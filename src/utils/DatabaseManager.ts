/**
 * DatabaseManager — PostgreSQL connection pool and migration runner
 *
 * Supports two modes:
 *   - local: docker-compose Postgres (DB_PROVIDER=postgres)
 *   - supabase: Supabase-managed Postgres (DB_PROVIDER=supabase)
 */

import pg from 'pg';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { LogManager } from './LogManager.js';

const logger = LogManager.getInstance();

const { Pool } = pg;
type PoolType = InstanceType<typeof pg.Pool>;
type PoolClient = pg.PoolClient;

export interface DatabaseConfig {
  /** 'postgres' for local, 'supabase' for managed */
  provider: 'postgres' | 'supabase';
  /** Full connection string */
  connectionString: string;
  /** Max pool size (default: 10) */
  maxConnections?: number;
  /** Idle timeout in ms (default: 30000) */
  idleTimeoutMs?: number;
}

export class DatabaseManager {
  private pool: PoolType;
  private readonly config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = config;

    // Supabase session pooler typically limits to 10-15 concurrent connections
    const defaultMax = config.provider === 'supabase' ? 10 : 20;

    this.pool = new Pool({
      connectionString: config.connectionString,
      max: config.maxConnections ?? defaultMax,
      idleTimeoutMillis: config.idleTimeoutMs ?? 30_000,
      connectionTimeoutMillis: 10_000,
      // For Supabase session pooler, we need to handle SSL
      ssl: config.provider === 'supabase' ? { rejectUnauthorized: false } : undefined,
    });

    this.pool.on('error', (err) => {
      logger.error('DatabaseManager', `Pool error: ${err.message}`);
    });
  }

  /** Get a client from the pool */
  async getClient(): Promise<PoolClient> {
    return this.pool.connect();
  }

  /** Execute a query directly on the pool */
  async query<T extends pg.QueryResultRow = any>(
    text: string,
    params?: unknown[],
  ): Promise<pg.QueryResult<T>> {
    return this.pool.query<T>(text, params);
  }

  /**
   * Execute a query with RLS context set for the transaction.
   * Sets app.current_user_id and app.current_project_id via SET LOCAL.
   */
  async queryWithContext<T extends pg.QueryResultRow = any>(
    userId: string,
    projectId: string,
    text: string,
    params?: unknown[],
  ): Promise<pg.QueryResult<T>> {
    const client = await this.getClient();
    try {
      await client.query('BEGIN');
      await client.query(
        `SELECT set_config('app.current_user_id', $1, true),
                set_config('app.current_project_id', $2, true)`,
        [userId, projectId],
      );
      // Switch to app_user role so RLS policies are enforced.
      // The postgres/superuser role has BYPASSRLS, silently skipping all policies.
      await client.query('SET LOCAL ROLE app_user');
      const result = await client.query<T>(text, params);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Execute multiple queries in a single transaction with RLS context.
   */
  async transactionWithContext<T>(
    userId: string,
    projectId: string,
    fn: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.getClient();
    try {
      await client.query('BEGIN');
      await client.query(
        `SELECT set_config('app.current_user_id', $1, true),
                set_config('app.current_project_id', $2, true)`,
        [userId, projectId],
      );
      // Switch to app_user role so RLS policies are enforced.
      await client.query('SET LOCAL ROLE app_user');
      const result = await fn(client as PoolClient);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Run SQL migrations from the migrations/ directory.
   * Skips already-applied migrations based on schema_migrations table.
   */
  async runMigrations(migrationsDir: string): Promise<string[]> {
    const applied: string[] = [];

    // Ensure schema_migrations table exists
    await this.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    // Get already-applied versions
    const { rows } = await this.query<{ version: string }>(
      'SELECT version FROM schema_migrations ORDER BY version',
    );
    const appliedVersions = new Set(rows.map((r) => r.version));

    // Read migration files
    let files: string[];
    try {
      files = readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.sql'))
        .sort();
    } catch {
      logger.warn('DatabaseManager', `Migrations directory not found: ${migrationsDir}`);
      return applied;
    }

    for (const file of files) {
      const version = file.replace('.sql', '');
      if (appliedVersions.has(version)) {
        logger.debug('DatabaseManager', `Migration ${version} already applied, skipping`);
        continue;
      }

      logger.info('DatabaseManager', `Applying migration: ${file}`);
      const sql = readFileSync(join(migrationsDir, file), 'utf-8') as string;

      try {
        await this.query(sql);
        applied.push(version);
        logger.info('DatabaseManager', `Migration ${version} applied successfully`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error('DatabaseManager', `Migration ${version} failed: ${message}`);
        throw err;
      }
    }

    return applied;
  }

  /** Health check */
  async isHealthy(): Promise<boolean> {
    try {
      await this.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  /** Graceful shutdown */
  async close(): Promise<void> {
    await this.pool.end();
    logger.info('DatabaseManager', 'Connection pool closed');
  }
}
