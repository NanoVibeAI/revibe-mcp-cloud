import { config } from "../config.js";
import type { StorageProvider } from "./base.js";
import { LocalStorageProvider } from "./localStorage.js";
import { createSupabaseStorageProvider } from "./supabaseStorage.js";
import { VercelBlobStorageProvider } from "./vercelBlobStorage.js";

let provider: StorageProvider | null = null;

export const getStorageProvider = (): StorageProvider => {
  if (provider) {
    return provider;
  }

  if (config.STORAGE_PROVIDER === "supabase") {
    provider = createSupabaseStorageProvider();
    return provider;
  }

  if (config.STORAGE_PROVIDER === "local") {
    provider = new LocalStorageProvider(config.LOCAL_STORAGE_PATH);
    return provider;
  }

  if (!config.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is required for vercel_blob storage");
  }

  provider = new VercelBlobStorageProvider(config.BLOB_READ_WRITE_TOKEN);
  return provider;
};

export const setStorageProvider = (nextProvider: StorageProvider): void => {
  provider = nextProvider;
};
