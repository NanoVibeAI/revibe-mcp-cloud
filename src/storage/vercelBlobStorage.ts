import type { StorageProvider } from "./base.js";

export class VercelBlobStorageProvider implements StorageProvider {
  constructor(private readonly token: string) {}

  private fullPath(filePath: string): string {
    return filePath.replace(/^\/+/, "");
  }

  async upload(params: {
    filePath: string;
    content: Buffer;
    contentType?: string;
    metadata?: Record<string, unknown>;
  }): Promise<string> {
    const path = this.fullPath(params.filePath);
    const formData = new FormData();
    formData.set("file", new Blob([params.content]), path);

    const response = await fetch(`https://blob.vercel-storage.com?pathname=${encodeURIComponent(path)}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "x-content-type": params.contentType ?? "application/octet-stream"
      },
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Failed to upload to Vercel Blob: ${response.status}`);
    }

    const result = (await response.json()) as { url: string };
    return result.url;
  }

  async download(filePath: string): Promise<Buffer> {
    const path = this.fullPath(filePath);
    const response = await fetch(`https://blob.vercel-storage.com/${path}`);
    if (!response.ok) {
      throw new Error(`Failed to download ${path}: ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async delete(): Promise<boolean> {
    throw new Error("Delete is not implemented for Vercel Blob provider");
  }

  async exists(): Promise<boolean> {
    throw new Error("Exists is not implemented for Vercel Blob provider");
  }

  async listFiles(): Promise<Array<Record<string, unknown>>> {
    return [];
  }

  async getSignedUrl(filePath: string): Promise<string> {
    return `https://blob.vercel-storage.com/${this.fullPath(filePath)}`;
  }
}
