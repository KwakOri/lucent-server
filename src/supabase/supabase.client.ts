import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../types/database';

let cachedAdminClient: SupabaseClient<Database> | null = null;
let cachedAnonClient: SupabaseClient<Database> | null = null;

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`${name} is required to initialize Supabase client.`);
  }

  return value;
}

function createSupabaseClient(apiKey: string): SupabaseClient<Database> {
  const url = getRequiredEnv('SUPABASE_URL');
  return createClient<Database>(url, apiKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function getSupabaseClient(): SupabaseClient<Database> {
  if (cachedAdminClient) {
    return cachedAdminClient;
  }

  const serviceRoleKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  cachedAdminClient = createSupabaseClient(serviceRoleKey);

  return cachedAdminClient;
}

export function getSupabaseAnonClient(): SupabaseClient<Database> {
  if (cachedAnonClient) {
    return cachedAnonClient;
  }

  const anonKey =
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!anonKey || anonKey.trim().length === 0) {
    throw new Error(
      'SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) is required to initialize auth client.',
    );
  }

  cachedAnonClient = createSupabaseClient(anonKey);
  return cachedAnonClient;
}
