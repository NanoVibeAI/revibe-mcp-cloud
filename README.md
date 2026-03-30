# Revibe MCP Cloud

TypeScript/Node.js backend for Revibe UI component workflows.

This service preserves the same API shapes and Supabase DB concepts from the previous Python version, but now uses Node tooling so multi-file UI bundles can be validated with JS/TS-native logic.

## Current Status

Implemented:

1. `POST /mcp/tools/upload_component`
2. Bundle-first upload contract (`source.type = bundle`)
3. Source validation for:
   - safe relative paths
   - duplicate files
   - entrypoint existence
   - unresolved relative imports
   - undeclared external dependencies
4. Artifact persistence to configured storage provider:
   - `request.json`
   - `review_artifact.json`
   - `source_manifest.json`
   - `context.md`
   - full bundle files under `files/`
5. Component metadata persistence in `apps_revibe.components`

Scaffolded (placeholder logic):

1. `POST /mcp/tools/discover_components`
2. `POST /mcp/tools/download_component`

## Stack

- Node.js 20+
- TypeScript
- Fastify
- Zod
- Supabase JS client

## Project Structure

```text
src/
├── index.ts
├── config.ts
├── auth/
│   └── oauth.ts
├── db/
│   └── supabase.ts
├── routes/
│   ├── health.ts
│   ├── api.ts
│   ├── mcp.ts
│   └── oauthMetadata.ts
├── schemas/
│   ├── component.ts
│   ├── discovery.ts
│   └── download.ts
├── services/
│   ├── componentService.ts
│   ├── discoveryService.ts
│   └── downloadService.ts
├── tools/
│   ├── catalog.ts
│   ├── executor.ts
│   └── descriptors/
│       ├── upload_component.json
│       ├── discover_components.json
│       └── download_component.json
└── storage/
    ├── base.ts
    ├── factory.ts
    ├── supabaseStorage.ts
    ├── vercelBlobStorage.ts
    └── localStorage.ts
```

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create environment file:

```bash
cp .env.example .env
```

3. Start dev server:

```bash
npm run dev
```

4. Build and run production output:

```bash
npm run build
npm run start
```

## API Endpoints

1. `POST /mcp/tools/upload_component`
2. `POST /mcp/tools/discover_components`
3. `POST /mcp/tools/download_component`
4. `GET /mcp/tools`
5. `POST /mcp` (JSON-RPC MCP protocol endpoint)
6. `GET /.well-known/oauth-protected-resource`
7. `GET /.well-known/oauth-protected-resource/mcp`
8. `GET /.well-known/oauth-authorization-server`
9. `GET /health`

MCP protocol methods currently supported on `POST /mcp`:

1. `initialize`
2. `notifications/initialized`
3. `ping`
4. `tools/list`
5. `tools/call`

## Upload Contract (Bundle-First)

`upload_component` requires:

1. `component_intent`
2. `target_framework`
3. `source`

Where `source` contains:

1. `type = "bundle"`
2. `entrypoint`
3. `files: [{ path, content }]`
4. `dependencies`
5. `peer_dependencies`
6. `dev_dependencies`

Example:

```json
{
  "component_intent": "Pricing card with CTA",
  "target_framework": "react",
  "style_system": "tailwind",
  "source": {
    "type": "bundle",
    "entrypoint": "src/PricingCard/index.tsx",
    "files": [
      { "path": "src/PricingCard/index.tsx", "content": "..." },
      { "path": "src/PricingCard/FeatureList.tsx", "content": "..." }
    ],
    "dependencies": { "react": "^18.2.0" },
    "peer_dependencies": {},
    "dev_dependencies": {}
  },
  "metadata": {
    "tags": ["pricing", "card"]
  }
}
```

## Environment Variables

Required for default setup (`STORAGE_PROVIDER=supabase`):

1. `SUPABASE_URL`
2. `SUPABASE_SERVICE_ROLE_KEY`
3. `SUPABASE_STORAGE_BUCKET`
4. `SUPABASE_DB_SCHEMA=apps_revibe`

General:

1. `PORT` (default `8000`)
2. `MCP_SERVER_NAME` (default `revibe-mcp-cloud`)
3. `MCP_SERVER_VERSION` (default `0.1.0`)
4. `MCP_PUBLIC_BASE_URL` (public base URL used for OAuth metadata links)
5. `MCP_AUTH_ENABLED` (`true`/`false`)
6. `MCP_AUTH_VALIDATE_AUDIENCE` (`true`/`false`)
7. `MCP_AUTH_RESOURCE_URI` (canonical resource URI, usually `${MCP_PUBLIC_BASE_URL}/mcp`)
8. `MCP_AUTH_RESOURCE_METADATA_URL` (defaults to `${MCP_PUBLIC_BASE_URL}/.well-known/oauth-protected-resource`)
9. `MCP_AUTH_AUTHORIZATION_SERVER_URL` (authorization server issuer base URL)
10. `MCP_AUTH_AUTHORIZATION_SERVERS` (comma/space-separated auth server URLs for protected resource metadata)
11. `MCP_AUTHORIZATION_ENDPOINT`
12. `MCP_AUTH_TOKEN_ENDPOINT`
13. `MCP_AUTH_REGISTRATION_ENDPOINT` (optional)
14. `MCP_AUTH_JWKS_URI` (optional)
15. `MCP_AUTH_JWKS_CACHE_TTL_SECONDS` (JWKS cache TTL in seconds; default `300`)
16. `MCP_AUTH_SCOPES_SUPPORTED` (space/comma-separated list)
17. `MCP_AUTH_REQUIRED_SCOPES` (required for `/mcp`; default `mcp:access`)
18. `MCP_AUTH_TOOLS_CALL_SCOPES` (additional for `tools/call`; default `mcp:tools:call`)
19. `MCP_AUTH_ISSUER` (expected JWT issuer; optional)
20. `STORAGE_PROVIDER` (`supabase`, `vercel_blob`, `local`)
21. `STORAGE_BASE_PATH` (default empty; cloud providers now write directly under `components/...` in the bucket)
22. `LOCAL_STORAGE_PATH` (used when provider is `local`)

## OAuth2 Behavior

When `MCP_AUTH_ENABLED=true`:

1. `POST /mcp` accepts either `Authorization: Bearer <token>` or `X-API-KEY: <personal-api-key>`.
2. Missing/invalid tokens return `401` with `WWW-Authenticate: Bearer resource_metadata="..."`.
3. Insufficient scopes return `403` with `WWW-Authenticate: Bearer error="insufficient_scope" ...`.
4. JWT validation uses `MCP_AUTH_JWKS_URI`.
5. The server publishes OAuth discovery metadata via:
   - `/.well-known/oauth-protected-resource`
   - `/.well-known/oauth-authorization-server`

## DB Concepts (Preserved)

The service continues using schema `apps_revibe` and table `components` with bundle metadata fields:

1. `entrypoint`
2. `source_manifest`
3. `dependency_manifest`
4. `source_file_count`
5. existing fields like `review_artifact`, `storage_prefix`, etc.

## License

Apache License 2.0
