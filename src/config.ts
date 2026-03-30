import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(8000),
  APP_NAME: z.string().default("Revibe MCP Cloud"),
  MCP_SERVER_NAME: z.string().default("Revibe UI"),
  MCP_SERVER_VERSION: z.string().default("0.1.0"),

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

export const config = parsed.data;
