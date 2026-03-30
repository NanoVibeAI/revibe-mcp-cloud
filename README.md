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
├── db/
│   └── supabase.ts
├── routes/
│   ├── health.ts
│   ├── api.ts
│   └── mcp.ts
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
6. `GET /health`

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
4. `STORAGE_PROVIDER` (`supabase`, `vercel_blob`, `local`)
5. `STORAGE_BASE_PATH` (default empty; cloud providers now write directly under `components/...` in the bucket)
6. `LOCAL_STORAGE_PATH` (used when provider is `local`)

## DB Concepts (Preserved)

The service continues using schema `apps_revibe` and table `components` with bundle metadata fields:

1. `entrypoint`
2. `source_manifest`
3. `dependency_manifest`
4. `source_file_count`
5. existing fields like `review_artifact`, `storage_prefix`, etc.

## License

Apache License 2.0
