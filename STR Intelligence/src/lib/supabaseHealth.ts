import { getSupabaseClient, isSupabaseConfigured } from "./supabase";

export type SupabaseHealthStatus =
  | {
      ok: false;
      configured: false;
      message: string;
    }
  | {
      ok: true;
      configured: true;
      message: string;
    }
  | {
      ok: false;
      configured: true;
      message: string;
    };

export async function checkSupabaseHealth(): Promise<SupabaseHealthStatus> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      configured: false,
      message: "Supabase is not configured in this environment.",
    };
  }

  try {
    const { error } = await getSupabaseClient().from("_healthcheck").select("*").limit(1);

    if (error) {
      const authErrors = new Set(["PGRST116", "42P01"]);
      const healthy = authErrors.has(error.code ?? "") || /does not exist/i.test(error.message);

      return {
        ok: healthy,
        configured: true,
        message: healthy
          ? "Supabase client is configured and reachable."
          : `Supabase health check failed: ${error.message}`,
      };
    }

    return {
      ok: true,
      configured: true,
      message: "Supabase client is configured and reachable.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Supabase health check error.";

    return {
      ok: false,
      configured: true,
      message: `Supabase health check failed: ${message}`,
    };
  }
}
