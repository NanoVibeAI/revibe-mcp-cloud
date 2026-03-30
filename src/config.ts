import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "off", ""].includes(normalized)) {
      return false;
    }
  }

  return value;
}, z.boolean());

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(8000),
  APP_NAME: z.string().default("Revibe MCP Cloud"),
  MCP_SERVER_NAME: z.string().default("revibe-mcp-cloud"),
  MCP_SERVER_VERSION: z.string().default("0.1.0"),
  MCP_PUBLIC_BASE_URL: z.string().url().optional(),

  MCP_AUTH_ENABLED: booleanFromEnv.default(false),
  MCP_AUTH_VALIDATE_AUDIENCE: booleanFromEnv.default(false),
  MCP_AUTH_RESOURCE_URI: z.string().url().optional(),
  MCP_AUTH_RESOURCE_METADATA_URL: z.string().url().optional(),
  MCP_AUTH_AUTHORIZATION_SERVER_URL: z.string().url().optional(),
  MCP_AUTH_AUTHORIZATION_SERVER_METADATA_URL: z.string().url().optional(),
  MCP_AUTH_JWKS_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  MCP_AUTH_SCOPES_SUPPORTED: z.string().default("mcp:access mcp:tools:call"),
  MCP_AUTH_REQUIRED_SCOPES: z.string().default("mcp:access"),
  MCP_AUTH_TOOLS_CALL_SCOPES: z.string().default("mcp:tools:call"),
  MCP_AUTH_ISSUER: z.string().url().optional(),

  STORAGE_PROVIDER: z.enum(["supabase", "vercel_blob", "local"]).default("supabase"),
  STORAGE_BASE_PATH: z.string().default(""),
  LOCAL_STORAGE_PATH: z.string().default("./storage/artifacts"),

  SUPABASE_URL: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_STORAGE_BUCKET: z.string().min(1),
  SUPABASE_DB_SCHEMA: z.string().default("apps_revibe"),

  BLOB_READ_WRITE_TOKEN: z.string().optional(),

  EMBEDDINGS_MODEL: z.string().default("sentence-transformers/all-MiniLM-L6-v2"),
  MAX_DISCOVERY_RESULTS: z.coerce.number().default(10),
  DISCOVERY_SCORE_THRESHOLD: z.coerce.number().default(0.5),
  RANK_WEIGHT_SIMILARITY: z.coerce.number().default(0.4),
  RANK_WEIGHT_QUALITY: z.coerce.number().default(0.3),
  RANK_WEIGHT_POPULARITY: z.coerce.number().default(0.3)
});

const parsed = configSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
}

// Helper function to derive standard OAuth endpoint URLs from the authorization server base URL
const deriveOAuthEndpoint = (baseUrl: string, path: string): string => {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return `${trimmed}${path}`;
};

// Build the final config with derived values
const baseConfig = parsed.data;
export const config = {
  ...baseConfig,
  // Derive standard OAuth endpoints from authorization server URL
  get MCP_AUTHORIZATION_ENDPOINT() {
    return baseConfig.MCP_AUTH_AUTHORIZATION_SERVER_URL
      ? deriveOAuthEndpoint(baseConfig.MCP_AUTH_AUTHORIZATION_SERVER_URL, "/oauth/authorize")
      : undefined;
  },
  get MCP_AUTH_TOKEN_ENDPOINT() {
    return baseConfig.MCP_AUTH_AUTHORIZATION_SERVER_URL
      ? deriveOAuthEndpoint(baseConfig.MCP_AUTH_AUTHORIZATION_SERVER_URL, "/oauth/token")
      : undefined;
  },
  get MCP_AUTH_REGISTRATION_ENDPOINT() {
    return baseConfig.MCP_AUTH_AUTHORIZATION_SERVER_URL
      ? deriveOAuthEndpoint(baseConfig.MCP_AUTH_AUTHORIZATION_SERVER_URL, "/oauth/register")
      : undefined;
  },
  get MCP_AUTH_JWKS_URI() {
    return baseConfig.MCP_AUTH_AUTHORIZATION_SERVER_URL
      ? deriveOAuthEndpoint(baseConfig.MCP_AUTH_AUTHORIZATION_SERVER_URL, "/.well-known/jwks.json")
      : undefined;
  },
  get MCP_AUTH_AUTHORIZATION_SERVERS() {
    return baseConfig.MCP_AUTH_AUTHORIZATION_SERVER_URL ? [baseConfig.MCP_AUTH_AUTHORIZATION_SERVER_URL] : [];
  }
};
