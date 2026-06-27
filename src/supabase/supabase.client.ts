import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Logger } from '@nestjs/common';
import { Database } from '../types/database';

type SupabaseClientKind = 'admin' | 'anon';

let cachedAdminClient: SupabaseClient<Database> | null = null;
let cachedAnonClient: SupabaseClient<Database> | null = null;
const supabaseTimingLogger = new Logger('SupabaseTiming');

export function normalizeEnvValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 2) {
    return trimmed;
  }

  const startsWithSingleQuote = trimmed.startsWith("'");
  const endsWithSingleQuote = trimmed.endsWith("'");
  const startsWithDoubleQuote = trimmed.startsWith('"');
  const endsWithDoubleQuote = trimmed.endsWith('"');

  if (
    (startsWithSingleQuote && endsWithSingleQuote) ||
    (startsWithDoubleQuote && endsWithDoubleQuote)
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

export function normalizeSupabaseUrl(value: string): string {
  const normalized = normalizeEnvValue(value);
  const withProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(normalized)
    ? normalized
    : `https://${normalized}`;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(withProtocol);
  } catch {
    throw new Error(
      'SUPABASE_URL must be a valid absolute URL (for example: https://your-project.supabase.co).',
    );
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error(
      'SUPABASE_URL must use http or https protocol (for example: https://your-project.supabase.co).',
    );
  }

  return withProtocol;
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`${name} is required to initialize Supabase client.`);
  }

  const normalized = normalizeEnvValue(value);
  if (name === 'SUPABASE_URL') {
    return normalizeSupabaseUrl(normalized);
  }

  return normalized;
}

function formatDurationMs(durationMs: number): string {
  return Math.max(0, durationMs).toFixed(1);
}

function shouldLogSupabaseTiming(): boolean {
  return (
    process.env.NODE_ENV !== 'production' ||
    process.env.LUCENT_SUPABASE_TIMING_LOG === 'true'
  );
}

function resolveFetchUrl(input: Parameters<typeof fetch>[0]): string {
  const rawUrl =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  try {
    const url = new URL(rawUrl);
    return `${url.pathname}${url.search}`;
  } catch {
    return rawUrl;
  }
}

function resolveFetchMethod(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
): string {
  if (init?.method) {
    return init.method.toUpperCase();
  }

  if (typeof input === 'object' && 'method' in input && input.method) {
    return input.method.toUpperCase();
  }

  return 'GET';
}

function createInstrumentedFetch(kind: SupabaseClientKind): typeof fetch {
  return async (input, init) => {
    const startedAt = performance.now();
    const response = await fetch(input, init);
    const durationMs = performance.now() - startedAt;

    if (shouldLogSupabaseTiming()) {
      supabaseTimingLogger.log(
        [
          kind,
          resolveFetchMethod(input, init),
          resolveFetchUrl(input),
          `status=${response.status}`,
          `duration=${formatDurationMs(durationMs)}ms`,
        ].join(' '),
      );
    }

    return response;
  };
}

function createSupabaseClient(
  apiKey: string,
  kind: SupabaseClientKind,
): SupabaseClient<Database> {
  const url = getRequiredEnv('SUPABASE_URL');
  return createClient<Database>(url, apiKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      fetch: createInstrumentedFetch(kind),
    },
  });
}

export function getSupabaseClient(): SupabaseClient<Database> {
  if (cachedAdminClient) {
    return cachedAdminClient;
  }

  const serviceRoleKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  cachedAdminClient = createSupabaseClient(serviceRoleKey, 'admin');

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

  const normalizedAnonKey = anonKey ? normalizeEnvValue(anonKey) : '';
  if (normalizedAnonKey.length === 0) {
    throw new Error(
      'SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) is required to initialize auth client.',
    );
  }

  cachedAnonClient = createSupabaseClient(normalizedAnonKey, 'anon');
  return cachedAnonClient;
}
