/**
 * Supabase admin client for scripts.
 * Uses SUPABASE_SERVICE_ROLE_KEY to bypass RLS.
 */
import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Add to .env.local"
    );
  }

  return createClient(url, serviceRoleKey);
}
