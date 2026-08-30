import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL_KEY = "VITE_SUPABASE_URL";
const SUPABASE_PUBLISHABLE_KEY = "VITE_SUPABASE_PUBLISHABLE_KEY";

function readRequiredEnv(key: string): string {
  const value = (import.meta.env as Record<string, string | undefined>)[key];

  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  throw new Error(
    `Missing required Supabase environment variable: ${key}. Add it to .env.local (or your deployment settings) before using the client.`,
  );
}

export function getSupabaseConfig() {
  return {
    url: readRequiredEnv(SUPABASE_URL_KEY),
    publishableKey: readRequiredEnv(SUPABASE_PUBLISHABLE_KEY),
  } as const;
}

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    const { url, publishableKey } = getSupabaseConfig();
    supabaseClient = createClient(url, publishableKey);
  }

  return supabaseClient;
}

export function isSupabaseConfigured(): boolean {
  return ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"].every((key) => {
    const value = (import.meta.env as Record<string, string | undefined>)[key];
    return typeof value === "string" && value.trim().length > 0;
  });
}
