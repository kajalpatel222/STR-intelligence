type ServerEnvironment = Readonly<{
  apifyApiToken: string;
  apifyZillowActorId: string;
  supabaseServiceRoleKey?: string;
}>;

function required(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required server environment variable: ${name}`);
  }

  return value;
}

function optional(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

export function getServerEnvironment(): ServerEnvironment {
  return {
    apifyApiToken: required("APIFY_API_TOKEN"),
    apifyZillowActorId: required("APIFY_ZILLOW_ACTOR_ID"),
    supabaseServiceRoleKey: optional("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

export function getServerConfigurationStatus() {
  return {
    apifyApiToken: Boolean(optional("APIFY_API_TOKEN")),
    apifyZillowActorId: Boolean(optional("APIFY_ZILLOW_ACTOR_ID")),
    supabaseServiceRoleKey: Boolean(optional("SUPABASE_SERVICE_ROLE_KEY")),
  } as const;
}
