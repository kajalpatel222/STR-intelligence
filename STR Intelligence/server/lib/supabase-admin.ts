import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerEnvironment } from "../config/env.js";

let adminClient: SupabaseClient | null = null;

export function getSupabaseAdminClient(): SupabaseClient {
  if (!adminClient) {
    const { supabaseServiceRoleKey } = getServerEnvironment();

    if (!supabaseServiceRoleKey) {
      throw new Error(
        "Missing required server environment variable: SUPABASE_SERVICE_ROLE_KEY. Add the Supabase service-role key to the server environment before running ingestion.",
      );
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim();

    if (!supabaseUrl) {
      throw new Error(
        "Missing required server environment variable: VITE_SUPABASE_URL. The server uses the same Supabase project URL as the browser client.",
      );
    }

    adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });
  }

  return adminClient;
}
