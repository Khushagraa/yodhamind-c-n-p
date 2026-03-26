/**
 * api/db/index.js — PostgreSQL Connection Pool
 * ══════════════════════════════════════════════
 *
 * Single shared pool instance. Import anywhere:
 *   const db = require('../db');
 *   const result = await db.query('SELECT $1::text', ['hello']);
 *
 * Pool config is intentionally conservative:
 *   - max 10 connections  (fits free-tier Supabase / Neon)
 *   - 30s idle timeout
 *   - 5s connection timeout (fail fast, don't hang)
 */

'use strict';

const { Pool } = require('pg');

const pool = new Pool({
  connectionString:    process.env.DATABASE_URL,
  max:                 parseInt(process.env.DB_POOL_MAX, 10) || 10,
  idleTimeoutMillis:   30000,
  connectionTimeoutMillis: 5000,

  // SSL required for Supabase / Neon / most hosted Postgres providers
  ssl: process.env.DATABASE_SSL === 'false'
    ? false
    : process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false
});

// Log pool errors so they don't silently swallow exceptions
pool.on('error', (err) => {
  console.error('[db] Unexpected pool error:', err.message);
});

/**
 * Execute a parameterised query.
 * @param {string}  text    SQL string with $1, $2 … placeholders
 * @param {Array}   [params] Query parameters
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params) {
  const start  = Date.now();
  const result = await pool.query(text, params);

  if (process.env.NODE_ENV === 'development') {
    const duration = Date.now() - start;
    if (duration > 500) {
      console.warn(`[db] Slow query (${duration}ms):`, text.slice(0, 80));
    }
  }

  return result;
}

/**
 * Get a raw client from the pool for transactions.
 * Caller MUST call client.release() when done.
 *
 * Usage:
 *   const client = await db.getClient();
 *   try {
 *     await client.query('BEGIN');
 *     await client.query('...');
 *     await client.query('COMMIT');
 *   } catch (e) {
 *     await client.query('ROLLBACK');
 *     throw e;
 *   } finally {
 *     client.release();
 *   }
 */
async function getClient() {
  return pool.connect();
}

module.exports = { query, getClient, pool };
