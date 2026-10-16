/* Shared Supabase client. Requires js/config.js + the supabase-js CDN. */
const supabase = window.supabase.createClient(
  FLEETDESK_CONFIG.SUPABASE_URL,
  FLEETDESK_CONFIG.SUPABASE_ANON_KEY
);
