/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_APP_NAME?: string;
  readonly VITE_DEFAULT_LOOKBACK_DAYS?: string;
  readonly VITE_MAX_LOOKBACK_DAYS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
