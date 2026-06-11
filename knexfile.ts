import type { Knex } from 'knex';
import fs from 'fs';
import path from 'path';
import dns from 'dns/promises';
import { parseSupabaseConfig } from './lib/supabase-config-parser.ts';

/**
 * Knex Configuration for Ycode Supabase Migrations
 *
 * This configuration is used to run migrations programmatically
 * against the user's Supabase PostgreSQL database.
 */

/**
 * Load key=value pairs from local env files into process.env.
 * This keeps the migration CLI independent from Next.js runtime-only modules.
 */
function loadEnvFile(fileName: string) {
  const envPath = path.join(process.cwd(), fileName);

  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;

    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function loadLocalEnv() {
  loadEnvFile('.env.local');
  loadEnvFile('.env');
}

function getSupabaseConnectionParams() {
  loadLocalEnv();

  const connectionUrl = process.env.SUPABASE_CONNECTION_URL;
  const dbPassword = process.env.SUPABASE_DB_PASSWORD;
  const supabaseUrl = process.env.SUPABASE_URL;

  if (!connectionUrl || !dbPassword) {
    throw new Error(
      'Supabase not configured for migrations.\n' +
      'Set SUPABASE_CONNECTION_URL and SUPABASE_DB_PASSWORD in .env.local or your shell.'
    );
  }

  const parsed = parseSupabaseConfig({
    anonKey: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '',
    serviceRoleKey: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    connectionUrl,
    dbPassword,
    supabaseUrl,
  });

  return {
    host: parsed.dbHost,
    port: parsed.dbPort,
    database: parsed.dbName,
    user: parsed.dbUser,
    password: parsed.dbPassword,
    ssl: supabaseUrl ? false : { rejectUnauthorized: false },
  };
}

async function ensureDatabaseHostResolves(host: string) {
  try {
    await dns.lookup(host);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Cannot resolve Supabase host "${host}".\n` +
      'Check your network/DNS or replace SUPABASE_CONNECTION_URL with a direct Postgres URL.\n' +
      `DNS error: ${message}`
    );
  }
}

const createConfig = (): Knex.Config => {
  const isVercel = process.env.VERCEL === '1';

  return {
    client: 'pg',
    connection: async () => {
      const connectionParams = await getSupabaseConnectionParams();
      await ensureDatabaseHostResolves(connectionParams.host);

      return connectionParams;
    },
    migrations: {
      directory: path.join(process.cwd(), 'database/migrations'),
      extension: 'ts',
      tableName: 'migrations',
    },
    pool: isVercel ? {
      min: 0,
      max: 1,
      acquireTimeoutMillis: 10000,
      createTimeoutMillis: 10000,
      idleTimeoutMillis: 1000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 200,
    } : {
      min: 0,
      max: 1,
      acquireTimeoutMillis: 10000,
      createTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
    },
  };
};

const config: { [key: string]: Knex.Config } = {
  development: createConfig(),
  production: createConfig(),
};

export default config;
