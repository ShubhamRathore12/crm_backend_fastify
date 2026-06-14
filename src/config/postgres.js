'use strict';

const { Pool } = require('pg');

// Direct PostgreSQL connection pool (bypasses Supabase cloud)
// Connects to local PostgreSQL container at crm-postgres:5432

class PostgresClient {
  constructor() {
    const dbConfig = {
      host: process.env.DB_HOST || 'crm-postgres',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME || 'crm_db',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      max: parseInt(process.env.DB_MAX_CONNECTIONS || '20', 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };

    this.pool = new Pool(dbConfig);
    this.isConnected = false;

    // Connection error handler
    this.pool.on('error', (err) => {
      console.error('[PostgreSQL Pool Error]', err.message);
    });
  }

  /**
   * Health check - verify database connection
   */
  async healthCheck() {
    try {
      const result = await this.pool.query('SELECT NOW()');
      this.isConnected = true;
      return { healthy: true, timestamp: result.rows[0].now };
    } catch (err) {
      this.isConnected = false;
      return { healthy: false, error: err.message };
    }
  }

  /**
   * Get single user by email
   */
  async getUserByEmail(email) {
    try {
      const result = await this.pool.query(
        'SELECT id, name, email, password_hash, role, team_id, status FROM users WHERE LOWER(email) = LOWER($1)',
        [email]
      );
      return result.rows[0] || null;
    } catch (err) {
      console.error('[PostgreSQL] Error fetching user:', err.message);
      throw err;
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(userId) {
    try {
      const result = await this.pool.query(
        'SELECT id, name, email, role, team_id, status FROM users WHERE id = $1',
        [userId]
      );
      return result.rows[0] || null;
    } catch (err) {
      console.error('[PostgreSQL] Error fetching user by ID:', err.message);
      throw err;
    }
  }

  /**
   * Create new user
   */
  async createUser(userData) {
    const { name, email, password_hash, role = 'agent', team_id = null } = userData;
    try {
      const result = await this.pool.query(
        `INSERT INTO users (name, email, password_hash, role, team_id, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
         RETURNING id, name, email, role, team_id, status, created_at`,
        [name, email.toLowerCase().trim(), password_hash, role, team_id, 'active']
      );
      return result.rows[0];
    } catch (err) {
      console.error('[PostgreSQL] Error creating user:', err.message);
      throw err;
    }
  }

  /**
   * Update user
   */
  async updateUser(userId, updates) {
    try {
      const fields = Object.keys(updates);
      const values = Object.values(updates);
      const setClause = fields.map((field, idx) => `${field} = $${idx + 1}`).join(', ');
      
      const result = await this.pool.query(
        `UPDATE users SET ${setClause}, updated_at = NOW() WHERE id = $${fields.length + 1} RETURNING *`,
        [...values, userId]
      );
      return result.rows[0];
    } catch (err) {
      console.error('[PostgreSQL] Error updating user:', err.message);
      throw err;
    }
  }

  /**
   * Generic query execution
   */
  async query(sql, params = []) {
    try {
      const result = await this.pool.query(sql, params);
      return result;
    } catch (err) {
      console.error('[PostgreSQL] Query error:', err.message);
      throw err;
    }
  }

  /**
   * Close connection pool
   */
  async close() {
    try {
      await this.pool.end();
      this.isConnected = false;
      console.log('[PostgreSQL] Connection pool closed');
    } catch (err) {
      console.error('[PostgreSQL] Error closing pool:', err.message);
    }
  }
}

// Singleton instance
let _postgresClient = null;

function getPostgresClient() {
  if (!_postgresClient) {
    _postgresClient = new PostgresClient();
  }
  return _postgresClient;
}

module.exports = {
  PostgresClient,
  getPostgresClient,
};
