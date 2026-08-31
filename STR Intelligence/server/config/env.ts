type ServerEnvironment = Readonly<{
  apifyApiToken: string;
  apifyZillowActorId: string;
  apifyAirbnbDiscoveryActorId: string;
  apifyAirbnbCalendarActorId: string;
  supabaseServiceRoleKey?: string;
  openRouterApiKey?: string;
  openRouterBaseUrl: string;
  openRouterModel?: string;
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
    apifyAirbnbDiscoveryActorId: optional("APIFY_AIRBNB_DISCOVERY_ACTOR_ID") ?? "unfenced-group/airbnb-scraper",
    apifyAirbnbCalendarActorId: optional("APIFY_AIRBNB_CALENDAR_ACTOR_ID") ?? "cirkit/airbnb-availability-scraper",
    supabaseServiceRoleKey: optional("SUPABASE_SERVICE_ROLE_KEY"),
    openRouterApiKey: optional("OPENROUTER_API_KEY"),
    openRouterBaseUrl: optional("OPENROUTER_BASE_URL") ?? "https://openrouter.ai/api/v1",
    openRouterModel: optional("OPENROUTER_MODEL"),
  };
}

export function getServerConfigurationStatus() {
  return {
    apifyApiToken: Boolean(optional("APIFY_API_TOKEN")),
    apifyZillowActorId: Boolean(optional("APIFY_ZILLOW_ACTOR_ID")),
    apifyAirbnbDiscoveryActorId: true,
    apifyAirbnbCalendarActorId: true,
    supabaseServiceRoleKey: Boolean(optional("SUPABASE_SERVICE_ROLE_KEY")),
    openRouterApiKey: Boolean(optional("OPENROUTER_API_KEY")),
    openRouterModel: Boolean(optional("OPENROUTER_MODEL")),
  } as const;
}
