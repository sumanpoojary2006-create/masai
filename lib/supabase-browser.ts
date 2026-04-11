import { createBrowserClient } from "@supabase/ssr";

import { getPublicSupabaseEnv } from "@/lib/env";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function createBrowserSupabase() {
  if (browserClient) {
    return browserClient;
  }

  const { url, key } = getPublicSupabaseEnv();
  browserClient = createBrowserClient(url, key);

  return browserClient;
}
