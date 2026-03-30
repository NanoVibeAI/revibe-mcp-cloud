# Storage architecture

This document explains the storage layer design for the TypeScript implementation and how to add or swap storage providers.

## Overview

The storage layer uses a strategy pattern so service code can stay unchanged while the backing provider changes.

Current providers:

1. Supabase storage
2. Vercel Blob
3. Local filesystem

Core interface: `StorageProvider` in `src/storage/base.ts`

Methods:

1. `upload()`
2. `download()`
3. `delete()`
4. `exists()`
5. `listFiles()`
6. `getSignedUrl()`

## Current implementation

Files involved:

1. `src/storage/base.ts`
2. `src/storage/factory.ts`
3. `src/storage/supabaseStorage.ts`
4. `src/storage/vercelBlobStorage.ts`
5. `src/storage/localStorage.ts`

Default provider is Supabase, configured through environment variables.

`STORAGE_BASE_PATH` is no longer prepended by the cloud providers. Component artifacts are written directly to the bucket root under `components/<component_id>/...`.

## Environment configuration

### Supabase storage

```bash
STORAGE_PROVIDER="supabase"
SUPABASE_URL="https://your-project-ref.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your_service_role_key"
SUPABASE_STORAGE_BUCKET="revibe-components"
SUPABASE_DB_SCHEMA="apps_revibe"
STORAGE_BASE_PATH=""
```

### Vercel Blob

```bash
STORAGE_PROVIDER="vercel_blob"
BLOB_READ_WRITE_TOKEN="your_vercel_blob_token"
STORAGE_BASE_PATH=""
```

### Local filesystem

```bash
STORAGE_PROVIDER="local"
LOCAL_STORAGE_PATH="./storage/artifacts"
```

## Runtime usage

Use the provider factory from application services.

```ts
import { getStorageProvider } from "../storage/factory.js";

const storage = getStorageProvider();

await storage.upload({
  filePath: "components/Button/request.json",
  content: Buffer.from("{}", "utf-8"),
  contentType: "application/json"
});
```

The provider swap is transparent to the service layer.

## How Component Service uses storage

`src/services/componentService.ts` writes the following artifacts per uploaded component bundle:

1. `request.json`
2. `review_artifact.json`
3. `source_manifest.json`
4. `context.md`
5. `files/...` for every uploaded bundle file

These are stored under a component-specific prefix:

```text
components/<component_id>/
```

## Adding a new storage provider

### 1. Create a provider class

```ts
import type { StorageProvider } from "./base.js";

export class S3StorageProvider implements StorageProvider {
  async upload(params: {
    filePath: string;
    content: Buffer;
    contentType?: string;
    metadata?: Record<string, unknown>;
  }): Promise<string> {
    throw new Error("Not implemented");
  }

  async download(filePath: string): Promise<Buffer> {
    throw new Error("Not implemented");
  }

  async delete(filePath: string): Promise<boolean> {
    throw new Error("Not implemented");
  }

  async exists(filePath: string): Promise<boolean> {
    throw new Error("Not implemented");
  }

  async listFiles(prefix = ""): Promise<Array<Record<string, unknown>>> {
    throw new Error("Not implemented");
  }

  async getSignedUrl(filePath: string, expiresIn = 3600): Promise<string> {
    throw new Error("Not implemented");
  }
}
```

### 2. Register it in the factory

Add provider selection logic in `src/storage/factory.ts`.

### 3. Add configuration

Extend `src/config.ts` with provider-specific variables.

## Notes on current providers

### Supabase storage

Pros:

1. Matches the current database stack
2. Signed URL support is built in
3. Good default for this project

Tradeoffs:

1. Coupled to Supabase platform
2. Requires service role key for backend operations

### Vercel Blob

Pros:

1. Simple object storage for frontend-heavy workflows
2. Easy public asset hosting

Tradeoffs:

1. Current implementation is not feature-complete
2. List/delete/exists support still needs hardening

### Local filesystem

Pros:

1. Good for local development
2. No external dependency

Tradeoffs:

1. Not suitable for multi-instance production deployments
2. Requires local disk management

## Testing guidance

For tests, replace the provider with a fake implementation using `setStorageProvider()` from `src/storage/factory.ts`.

This keeps service tests isolated from real storage backends.

## Security notes

1. Validate file paths before writing to local storage
2. Use signed URLs for private downloads where possible
3. Avoid exposing service role keys to the client
4. Treat uploaded code bundles as untrusted input
