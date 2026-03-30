import { createClient } from "@supabase/supabase-js";

import { config } from "../config.js";

export const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);

const configuredSchema = config.SUPABASE_DB_SCHEMA?.trim();

export const schemaTable = (tableName: string) => {
  if (!configuredSchema || configuredSchema === "public") {
    return supabase.from(tableName);
  }

  return supabase.schema(configuredSchema).from(tableName);
};

export const isInvalidSchemaError = (error: { message?: string } | null | undefined): boolean =>
  Boolean(error?.message && /^Invalid schema\s*:/i.test(error.message));
