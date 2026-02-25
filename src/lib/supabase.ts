import { createClient } from "@supabase/supabase-js";

const env = (import.meta as any).env as Record<string, string | undefined>;

const supabaseUrl = (env.TTVM_SUPABASE_URL ?? "").trim();
const supabaseAnonKey = (env.TTVM_SUPABASE_ANON_KEY ?? "").trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const supabaseConfigError = isSupabaseConfigured
  ? null
  : "Missing TTVM_SUPABASE_URL or TTVM_SUPABASE_ANON_KEY in .env";

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
