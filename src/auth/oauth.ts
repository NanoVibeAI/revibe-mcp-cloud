import { constants, createHash, createPublicKey, verify as verifySignature } from "node:crypto";

import type { FastifyReply, FastifyRequest } from "fastify";

import { config } from "../config.js";
import { schemaTable } from "../db/supabase.js";

type JwtHeader = {
  alg?: unknown;
  typ?: unknown;
  kid?: unknown;
};

type JwtPayload = {
  iss?: unknown;
  aud?: unknown;
  exp?: unknown;
  nbf?: unknown;
  sub?: unknown;
  scope?: unknown;
  scp?: unknown;
  [key: string]: unknown;
};

type Jwk = {
  kty?: unknown;
  kid?: unknown;
  use?: unknown;
  alg?: unknown;
  n?: unknown;
  e?: unknown;
  crv?: unknown;
  x?: unknown;
  y?: unknown;
  [key: string]: unknown;
};

type JwksDocument = {
  keys?: unknown;
};

type CachedJwks = {
  expiresAt: number;
  keys: Jwk[];
};

type JwtAlgorithmSpec =
  | {
      family: "rsa";
      digest: "RSA-SHA256" | "RSA-SHA384" | "RSA-SHA512";
      pss: boolean;
    }
  | {
      family: "ec";
      digest: "sha256" | "sha384" | "sha512";
      coordinateLength: number;
    };

const isRsaJwk = (value: Jwk): boolean => value.kty === "RSA" && typeof value.n === "string" && typeof value.e === "string";

const isEcJwk = (value: Jwk): boolean =>
  value.kty === "EC" && typeof value.crv === "string" && typeof value.x === "string" && typeof value.y === "string";

const isSupportedJwk = (value: unknown): value is Jwk => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Jwk;
  return isRsaJwk(candidate) || isEcJwk(candidate);
};

const JWT_ALGORITHMS: Record<string, JwtAlgorithmSpec> = {
  RS256: { family: "rsa", digest: "RSA-SHA256", pss: false },
  RS384: { family: "rsa", digest: "RSA-SHA384", pss: false },
  RS512: { family: "rsa", digest: "RSA-SHA512", pss: false },
  PS256: { family: "rsa", digest: "RSA-SHA256", pss: true },
  PS384: { family: "rsa", digest: "RSA-SHA384", pss: true },
  PS512: { family: "rsa", digest: "RSA-SHA512", pss: true },
  ES256: { family: "ec", digest: "sha256", coordinateLength: 32 },
  ES384: { family: "ec", digest: "sha384", coordinateLength: 48 },
  ES512: { family: "ec", digest: "sha512", coordinateLength: 66 }
};

let cachedJwks: CachedJwks | null = null;

const splitList = (input: string): string[] =>
  input
    .split(/[,\s]+/g)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

const unique = (values: string[]): string[] => Array.from(new Set(values));

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/g, "");

const firstHeaderValue = (value: string | string[] | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }
  return Array.isArray(value) ? value[0] : value;
};

const getRequestBaseUrl = (request: FastifyRequest): string => {
  if (config.MCP_PUBLIC_BASE_URL) {
    return trimTrailingSlash(config.MCP_PUBLIC_BASE_URL);
  }

  const forwardedProto = firstHeaderValue(request.headers["x-forwarded-proto"]);
  const protocol = forwardedProto?.split(",")[0]?.trim() || request.protocol || "http";
  const forwardedHost = firstHeaderValue(request.headers["x-forwarded-host"]);
  const host = forwardedHost?.split(",")[0]?.trim() || request.headers.host || `localhost:${config.PORT}`;

  return `${protocol}://${host}`;
};

const joinUrl = (baseUrl: string, path: string): string => `${trimTrailingSlash(baseUrl)}${path}`;

const getResourceUri = (request: FastifyRequest): string =>
  config.MCP_AUTH_RESOURCE_URI ?? joinUrl(getRequestBaseUrl(request), "/mcp");

const getResourceMetadataUrl = (request: FastifyRequest): string =>
  config.MCP_AUTH_RESOURCE_METADATA_URL ?? joinUrl(getRequestBaseUrl(request), "/.well-known/oauth-protected-resource");

const getAuthorizationServerBaseUrl = (request: FastifyRequest): string =>
  config.MCP_AUTH_AUTHORIZATION_SERVER_URL ?? getRequestBaseUrl(request);

const getAuthorizationServers = (request: FastifyRequest): string[] => {
  if (config.MCP_AUTH_AUTHORIZATION_SERVERS.length > 0) {
    return config.MCP_AUTH_AUTHORIZATION_SERVERS;
  }
  return [getAuthorizationServerBaseUrl(request)];
};

const escapeHeaderValue = (value: string): string => value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");

const formatWwwAuthenticateHeader = ({
  request,
  scope,
  error,
  errorDescription
}: {
  request: FastifyRequest;
  scope?: string;
  error?: string;
  errorDescription?: string;
}): string => {
  const attributes = [`resource_metadata="${escapeHeaderValue(getResourceMetadataUrl(request))}"`];

  if (scope) {
    attributes.push(`scope="${escapeHeaderValue(scope)}"`);
  }
  if (error) {
    attributes.push(`error="${escapeHeaderValue(error)}"`);
  }
  if (errorDescription) {
    attributes.push(`error_description="${escapeHeaderValue(errorDescription)}"`);
  }

  return `Bearer ${attributes.join(", ")}`;
};

const extractBearerToken = (authorizationHeader: string | undefined): string | null => {
  if (!authorizationHeader) {
    return null;
  }

  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return null;
  }

  return match[1].trim();
};

const extractApiKey = (request: FastifyRequest): string | null => {
  const headerValue = firstHeaderValue(request.headers["x-api-key"]);
  if (!headerValue) {
    return null;
  }

  const value = headerValue.trim();
  return value.length > 0 ? value : null;
};

const hashApiKey = (apiKey: string): string => createHash("sha256").update(apiKey).digest("hex");

const validatePersonalApiKey = async (apiKey: string): Promise<boolean> => {
  const nowIso = new Date().toISOString();
  const keyHash = hashApiKey(apiKey);

  const { data, error } = await schemaTable("user_api_keys")
    .select("id")
    .eq("key_hash", keyHash)
    .is("revoked_at", null)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to validate API key: ${error.message}`);
  }

  if (!data) {
    return false;
  }

  const { error: updateError } = await schemaTable("user_api_keys")
    .update({ last_used_at: nowIso })
    .eq("id", data.id);

  if (updateError) {
    throw new Error(`Failed to update API key usage: ${updateError.message}`);
  }

  return true;
};

const authorizeWithApiKey = async ({
  request,
  reply,
  bearerToken
}: {
  request: FastifyRequest;
  reply: FastifyReply;
  bearerToken: string | null;
}): Promise<{ authorized: boolean; handled: boolean }> => {
  const apiKey = extractApiKey(request);
  request.log.info({ hasApiKey: Boolean(apiKey) }, "[authorizeWithApiKey] api key check");
  
  if (!apiKey) {
    return { authorized: false, handled: false };
  }

  try {
    if (await validatePersonalApiKey(apiKey)) {
      request.log.info({}, "[authorizeWithApiKey] valid api key");
      return { authorized: true, handled: true };
    }
  } catch (err) {
    request.log.error({ error: err instanceof Error ? err.message : String(err) }, "[authorizeWithApiKey] error");
    reply.status(500).send({
      error: "server_error",
      message: err instanceof Error ? err.message : "Failed to validate API key"
    });
    return { authorized: false, handled: true };
  }

  if (!bearerToken) {
    request.log.warn({}, "[authorizeWithApiKey] invalid api key");
    reply.status(401).send({
      error: "invalid_api_key",
      message: "Invalid or expired API key"
    });
    return { authorized: false, handled: true };
  }

  return { authorized: false, handled: false };
};

const decodeSegment = <T>(segment: string, label: string): T => {
  try {
    const json = Buffer.from(segment, "base64url").toString("utf-8");
    return JSON.parse(json) as T;
  } catch {
    throw new Error(`Malformed JWT ${label}`);
  }
};

const trimLeadingZeroes = (buffer: Buffer): Buffer => {
  let index = 0;
  while (index < buffer.length - 1 && buffer[index] === 0) {
    index += 1;
  }
  return buffer.subarray(index);
};

const derEncodeInteger = (buffer: Buffer): Buffer => {
  const trimmed = trimLeadingZeroes(buffer);
  const needsPrefix = (trimmed[0] & 0x80) !== 0;
  const value = needsPrefix ? Buffer.concat([Buffer.from([0]), trimmed]) : trimmed;
  return Buffer.concat([Buffer.from([0x02, value.length]), value]);
};

const joseToDerSignature = (signature: Buffer, coordinateLength: number): Buffer => {
  const expectedLength = coordinateLength * 2;
  if (signature.length !== expectedLength) {
    throw new Error(`Invalid ECDSA signature length: expected ${expectedLength}, received ${signature.length}`);
  }

  const r = signature.subarray(0, coordinateLength);
  const s = signature.subarray(coordinateLength);
  const derR = derEncodeInteger(r);
  const derS = derEncodeInteger(s);
  const sequenceLength = derR.length + derS.length;

  return Buffer.concat([Buffer.from([0x30, sequenceLength]), derR, derS]);
};

const parseJwks = (value: unknown): Jwk[] => {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid JWKS response");
  }

  const document = value as JwksDocument;
  if (!Array.isArray(document.keys)) {
    throw new Error("Invalid JWKS response: missing keys array");
  }

  const keys = document.keys.filter(isSupportedJwk);
  if (keys.length === 0) {
    throw new Error("JWKS does not contain usable signing keys");
  }

  return keys;
};

const fetchJwks = async (forceRefresh = false): Promise<Jwk[]> => {
  const now = Date.now();
  if (!forceRefresh && cachedJwks && cachedJwks.expiresAt > now) {
    return cachedJwks.keys;
  }

  const jwksUri = config.MCP_AUTH_JWKS_URI;
  if (!jwksUri) {
    throw new Error("Server misconfigured: MCP_AUTH_JWKS_URI is required for JWKS verification");
  }

  const response = await fetch(jwksUri, {
    method: "GET",
    headers: {
      accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch JWKS: HTTP ${response.status}`);
  }

  const body = (await response.json()) as unknown;
  const keys = parseJwks(body);
  cachedJwks = {
    keys,
    expiresAt: now + config.MCP_AUTH_JWKS_CACHE_TTL_SECONDS * 1000
  };
  return keys;
};

const selectJwk = async (kid: string | undefined): Promise<Jwk> => {
  const pickFrom = async (forceRefresh: boolean): Promise<Jwk | null> => {
    const keys = await fetchJwks(forceRefresh);

    if (kid) {
      const match = keys.find((key) => key.kid === kid);
      return match ?? null;
    }

    if (keys.length === 1) {
      return keys[0];
    }

    const signingKeys = keys.filter((key) => key.use === "sig" || key.use === undefined);
    if (signingKeys.length === 1) {
      return signingKeys[0];
    }

    return null;
  };

  const firstAttempt = await pickFrom(false);
  if (firstAttempt) {
    return firstAttempt;
  }

  const refreshedAttempt = await pickFrom(true);
  if (refreshedAttempt) {
    return refreshedAttempt;
  }

  if (kid) {
    throw new Error(`Unable to find signing key for kid '${kid}'`);
  }

  throw new Error("JWT is missing kid and JWKS contains multiple possible signing keys");
};

const verifyWithJwk = async ({
  header,
  signingInput,
  encodedSignature
}: {
  header: JwtHeader;
  signingInput: string;
  encodedSignature: string;
}): Promise<void> => {
  const alg = typeof header.alg === "string" ? header.alg : "";
  const algorithmSpec = JWT_ALGORITHMS[alg];
  if (!algorithmSpec) {
    throw new Error(`Unsupported JWT algorithm: ${alg || "unknown"}`);
  }

  const kid = typeof header.kid === "string" && header.kid.trim().length > 0 ? header.kid : undefined;
  const jwk = await selectJwk(kid);
  const publicKey = createPublicKey({
    key: jwk as Record<string, unknown>,
    format: "jwk"
  });

  const signatureBuffer = Buffer.from(encodedSignature, "base64url");
  const signature =
    algorithmSpec.family === "ec" ? joseToDerSignature(signatureBuffer, algorithmSpec.coordinateLength) : signatureBuffer;
  const data = Buffer.from(signingInput, "utf-8");

  const verified =
    algorithmSpec.family === "rsa" && algorithmSpec.pss
      ? verifySignature(
          algorithmSpec.digest,
          data,
          {
            key: publicKey,
            padding: constants.RSA_PKCS1_PSS_PADDING,
            saltLength: constants.RSA_PSS_SALTLEN_DIGEST
          },
          signature
        )
      : verifySignature(algorithmSpec.digest, data, publicKey, signature);

  if (!verified) {
    throw new Error("Invalid token signature");
  }
};

const readJwtPayload = async (token: string): Promise<JwtPayload> => {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed JWT");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeSegment<JwtHeader>(encodedHeader, "header");
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  await verifyWithJwk({
    header,
    signingInput,
    encodedSignature
  });

  return decodeSegment<JwtPayload>(encodedPayload, "payload");
};

const parseJwtScopes = (payload: JwtPayload): Set<string> => {
  const scopes = new Set<string>();

  if (typeof payload.scope === "string") {
    splitList(payload.scope).forEach((scope) => scopes.add(scope));
  }

  if (typeof payload.scp === "string") {
    splitList(payload.scp).forEach((scope) => scopes.add(scope));
  }

  if (Array.isArray(payload.scp)) {
    for (const value of payload.scp) {
      if (typeof value === "string" && value.trim().length > 0) {
        scopes.add(value.trim());
      }
    }
  }

  return scopes;
};

const hasAudience = (audienceClaim: unknown, expectedAudience: string): boolean => {
  if (typeof audienceClaim === "string") {
    return audienceClaim === expectedAudience;
  }

  if (Array.isArray(audienceClaim)) {
    return audienceClaim.some((value) => typeof value === "string" && value === expectedAudience);
  }

  return false;
};

const validateJwtClaims = (payload: JwtPayload, request: FastifyRequest): void => {
  const now = Math.floor(Date.now() / 1000);

  if (typeof payload.exp === "number" && now >= payload.exp) {
    throw new Error("Token expired");
  }

  if (typeof payload.nbf === "number" && now < payload.nbf) {
    throw new Error("Token is not active yet");
  }

  if (config.MCP_AUTH_ISSUER && payload.iss !== config.MCP_AUTH_ISSUER) {
    throw new Error(`Token issuer mismatch. Expected '${config.MCP_AUTH_ISSUER}', got '${payload.iss}'`);
  }

  if (config.MCP_AUTH_VALIDATE_AUDIENCE) {
    const expectedAudience = getResourceUri(request);
    request.log.info({
      tokenAudience: payload.aud,
      expectedAudience,
      validateAudienceEnabled: true
    }, "[validateJwtClaims] checking audience");
    if (!hasAudience(payload.aud, expectedAudience)) {
      throw new Error(`Token audience mismatch. Expected '${expectedAudience}', got '${String(payload.aud)}'`);
    }
  }
};

const payloadContainsToolsCall = (payload: unknown): boolean => {
  if (Array.isArray(payload)) {
    return payload.some(payloadContainsToolsCall);
  }

  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as { method?: unknown };
  return candidate.method === "tools/call";
};

const requiredScopesForPayload = (payload: unknown): string[] => {
  const required = [...splitList(config.MCP_AUTH_REQUIRED_SCOPES)];
  if (payloadContainsToolsCall(payload)) {
    required.push(...splitList(config.MCP_AUTH_TOOLS_CALL_SCOPES));
  }
  return unique(required);
};

const sendChallenge = ({
  request,
  reply,
  statusCode,
  scope,
  error,
  errorDescription
}: {
  request: FastifyRequest;
  reply: FastifyReply;
  statusCode: 401 | 403;
  scope?: string;
  error?: string;
  errorDescription?: string;
}): void => {
  reply
    .header(
      "WWW-Authenticate",
      formatWwwAuthenticateHeader({
        request,
        scope,
        error,
        errorDescription
      })
    )
    .status(statusCode)
    .send({
      error: error ?? "unauthorized",
      message: errorDescription ?? "Authorization required"
    });
};

export const authorizeMcpRequest = async (
  request: FastifyRequest,
  reply: FastifyReply,
  payload: unknown
): Promise<boolean> => {
  if (!config.MCP_AUTH_ENABLED) {
    return true;
  }

  const requiredScopes = requiredScopesForPayload(payload);
  const requiredScopeValue = requiredScopes.join(" ");
  const bearerToken = extractBearerToken(request.headers.authorization);

  request.log.info({
    hasBearerToken: Boolean(bearerToken),
    requiredScopes
  }, "[authorizeMcpRequest] auth check started");

  const apiKeyAuth = await authorizeWithApiKey({ request, reply, bearerToken });
  if (apiKeyAuth.authorized) {
    request.log.info({}, "[authorizeMcpRequest] authorized via API key");
    return true;
  }
  if (apiKeyAuth.handled) {
    return false;
  }

  if (!bearerToken) {
    request.log.warn({}, "[authorizeMcpRequest] no bearer token, sending challenge");
    sendChallenge({
      request,
      reply,
      statusCode: 401,
      scope: requiredScopeValue
    });
    return false;
  }

  let jwtPayload: JwtPayload;
  try {
    request.log.info({}, "[authorizeMcpRequest] reading and verifying JWT");
    jwtPayload = await readJwtPayload(bearerToken);
    request.log.info({
      iss: jwtPayload.iss,
      sub: jwtPayload.sub,
      aud: jwtPayload.aud,
      exp: jwtPayload.exp,
      scope: jwtPayload.scope,
      scp: jwtPayload.scp
    }, "[authorizeMcpRequest] JWT payload decoded");
    validateJwtClaims(jwtPayload, request);
    request.log.info({}, "[authorizeMcpRequest] JWT claims validated");
  } catch (err) {
    request.log.error({
      error: err instanceof Error ? err.message : String(err)
    }, "[authorizeMcpRequest] JWT validation failed");
    sendChallenge({
      request,
      reply,
      statusCode: 401,
      scope: requiredScopeValue,
      error: "invalid_token",
      errorDescription: err instanceof Error ? err.message : "Token validation failed"
    });
    return false;
  }

  const grantedScopes = parseJwtScopes(jwtPayload);
  request.log.info({
    grantedScopes: Array.from(grantedScopes),
    requiredScopes
  }, "[authorizeMcpRequest] scope check");
  
  const missingScopes = requiredScopes.filter((scope) => !grantedScopes.has(scope));
  if (missingScopes.length > 0) {
    request.log.warn({
      missingScopes
    }, "[authorizeMcpRequest] insufficient scopes, sending challenge");
    sendChallenge({
      request,
      reply,
      statusCode: 403,
      scope: missingScopes.join(" "),
      error: "insufficient_scope",
      errorDescription: `Missing required scopes: ${missingScopes.join(" ")}`
    });
    return false;
  }

  request.log.info({}, "[authorizeMcpRequest] authorization successful");
  return true;
};

export const buildProtectedResourceMetadata = (request: FastifyRequest): Record<string, unknown> => ({
  resource: getResourceUri(request),
  authorization_servers: getAuthorizationServers(request),
  bearer_methods_supported: ["header"],
  scopes_supported: unique(splitList(config.MCP_AUTH_SCOPES_SUPPORTED))
});

export const buildAuthorizationServerMetadata = (request: FastifyRequest): Record<string, unknown> => {
  const issuer = getAuthorizationServerBaseUrl(request);
  const scopesSupported = unique(splitList(config.MCP_AUTH_SCOPES_SUPPORTED));

  const metadata: Record<string, unknown> = {
    issuer,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: scopesSupported,
    client_id_metadata_document_supported: true
  };

  // Add endpoints if available
  if (config.MCP_AUTHORIZATION_ENDPOINT) {
    metadata.authorization_endpoint = config.MCP_AUTHORIZATION_ENDPOINT;
  }
  if (config.MCP_AUTH_TOKEN_ENDPOINT) {
    metadata.token_endpoint = config.MCP_AUTH_TOKEN_ENDPOINT;
  }
  if (config.MCP_AUTH_REGISTRATION_ENDPOINT) {
    metadata.registration_endpoint = config.MCP_AUTH_REGISTRATION_ENDPOINT;
  }
  if (config.MCP_AUTH_JWKS_URI) {
    metadata.jwks_uri = config.MCP_AUTH_JWKS_URI;
  }

  return metadata;
};
