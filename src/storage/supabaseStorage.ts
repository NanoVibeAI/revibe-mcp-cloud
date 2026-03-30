import { supabase } from "../db/supabase.js";
import { config } from "../config.js";
import type { StorageProvider } from "./base.js";

export class SupabaseStorageProvider implements StorageProvider {
  constructor(private readonly bucket: string) {}

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
    const { error } = await supabase.storage.from(this.bucket).upload(path, params.content, {
      contentType: params.contentType,
      upsert: true,
      metadata: params.metadata
    });

    if (error) {
      throw new Error(`Failed to upload ${path}: ${error.message}`);
    }

    const { data } = supabase.storage.from(this.bucket).getPublicUrl(path);
    return data.publicUrl;
  }

  async download(filePath: string): Promise<Buffer> {
    const path = this.fullPath(filePath);
    const { data, error } = await supabase.storage.from(this.bucket).download(path);
    if (error || !data) {
      throw new Error(`Failed to download ${path}: ${error?.message ?? "not found"}`);
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    return buffer;
  }

  async delete(filePath: string): Promise<boolean> {
    const path = this.fullPath(filePath);
    const { error } = await supabase.storage.from(this.bucket).remove([path]);
    return !error;
  }

  async exists(filePath: string): Promise<boolean> {
    const path = this.fullPath(filePath);
    const idx = path.lastIndexOf("/");
    const folder = idx >= 0 ? path.slice(0, idx) : "";
    const name = idx >= 0 ? path.slice(idx + 1) : path;

    const { data, error } = await supabase.storage.from(this.bucket).list(folder);
    if (error || !data) {
      return false;
    }

    return data.some((item) => item.name === name);
  }

  async listFiles(prefix = ""): Promise<Array<Record<string, unknown>>> {
    const path = this.fullPath(prefix);
    const { data, error } = await supabase.storage.from(this.bucket).list(path);
    if (error || !data) {
      return [];
    }

    return data.map((item) => ({
      path: `${path}/${item.name}`,
      ...item
    }));
  }

  async getSignedUrl(filePath: string, expiresIn = 3600): Promise<string> {
    const path = this.fullPath(filePath);
    const { data, error } = await supabase.storage.from(this.bucket).createSignedUrl(path, expiresIn);

    if (error || !data?.signedUrl) {
      throw new Error(`Failed to create signed URL for ${path}: ${error?.message ?? "unknown"}`);
    }

    return data.signedUrl;
  }
}

export const createSupabaseStorageProvider = () =>
  new SupabaseStorageProvider(config.SUPABASE_STORAGE_BUCKET);
