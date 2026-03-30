import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { StorageProvider } from "./base.js";

export class LocalStorageProvider implements StorageProvider {
  constructor(private readonly basePath: string) {}

  private resolve(filePath: string): string {
    const resolved = path.resolve(this.basePath, filePath);
    const root = path.resolve(this.basePath);

    if (!resolved.startsWith(root)) {
      throw new Error(`Invalid storage path: ${filePath}`);
    }

    return resolved;
  }

  async upload(params: {
    filePath: string;
    content: Buffer;
    contentType?: string;
    metadata?: Record<string, unknown>;
  }): Promise<string> {
    const absolutePath = this.resolve(params.filePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, params.content);
    return absolutePath;
  }

  async download(filePath: string): Promise<Buffer> {
    const absolutePath = this.resolve(filePath);
    return readFile(absolutePath);
  }

  async delete(filePath: string): Promise<boolean> {
    const absolutePath = this.resolve(filePath);
    try {
      await rm(absolutePath, { force: true });
      return true;
    } catch {
      return false;
    }
  }

  async exists(filePath: string): Promise<boolean> {
    const absolutePath = this.resolve(filePath);
    try {
      await stat(absolutePath);
      return true;
    } catch {
      return false;
    }
  }

  async listFiles(prefix = ""): Promise<Array<Record<string, unknown>>> {
    const absolutePath = this.resolve(prefix);
    try {
      const entries = await readdir(absolutePath, { withFileTypes: true });
      return entries.map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory()
      }));
    } catch {
      return [];
    }
  }

  async getSignedUrl(filePath: string): Promise<string> {
    return `/files/${filePath}`;
  }
}
