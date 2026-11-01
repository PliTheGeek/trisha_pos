function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing ${name}. Add it to .env.local and restart the Next.js dev server.`,
    );
  }
  return value;
}

export function getSupabaseUrl() {
  return requiredEnv('NEXT_PUBLIC_SUPABASE_URL');
}

export function getSupabaseAnonKey() {
  return requiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

export function getSupabaseServiceRoleKey() {
  return requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
}

function requiredBrowserEnv(value: string | undefined, name: string) {
  if (!value?.trim()) {
    throw new Error(
      `Missing ${name}. Add it to .env.local and restart the Next.js dev server.`,
    );
  }
  return value.trim();
}

export function getBrowserSupabaseUrl() {
  return requiredBrowserEnv(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    'NEXT_PUBLIC_SUPABASE_URL',
  );
}

export function getBrowserSupabaseAnonKey() {
  return requiredBrowserEnv(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  );
}
