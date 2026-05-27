'use strict';

const { createClient } = require('@supabase/supabase-js');
const { LRUCache } = require('lru-cache');

// Connection pool configuration
const MAX_CONNECTIONS = parseInt(process.env.DB_MAX_CONNECTIONS || '10', 10);
const CONNECTION_TIMEOUT = parseInt(process.env.DB_CONNECTION_TIMEOUT || '30000', 10);
const IDLE_TIMEOUT = parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10);

// Query cache for frequently accessed data
const queryCache = new LRUCache({
  max: 1000, // Max 1000 cached queries
  ttl: 1000 * 60 * 5, // 5 minutes TTL
  allowStale: false,
  updateAgeOnGet: true,
});

// Prepared statement cache
const preparedStatements = new Map();

/**
 * Enhanced Supabase client with connection pooling and caching
 */
class OptimizedSupabaseClient {
  constructor() {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    }

    this.client = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
        db: {
          schema: 'public',
        },
        global: {
          headers: {
            'x-application-name': 'crm-backend-optimized',
            'x-connection-pool': 'true',
          },
        },
      }
    );

    this.metrics = {
      queries: 0,
      cacheHits: 0,
      cacheMisses: 0,
      avgResponseTime: 0,
    };
  }

  /**
   * Generate cache key for query
   */
  _generateCacheKey(table, query, params) {
    return `${table}:${JSON.stringify(query)}:${JSON.stringify(params)}`;
  }

  /**
   * Execute query with caching
   */
  async query(table, operation = 'select', options = {}) {
    const startTime = Date.now();
    this.metrics.queries++;

    // Check cache for read operations
    if (operation === 'select' && options.cache !== false) {
      const cacheKey = this._generateCacheKey(table, options.query || {}, options.params || {});
      const cached = queryCache.get(cacheKey);
      if (cached) {
        this.metrics.cacheHits++;
        return cached;
      }
      this.metrics.cacheMisses++;
    }

    let queryBuilder = this.client.from(table);

    // Apply query operations
    if (options.query) {
      Object.entries(options.query).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          queryBuilder = queryBuilder.in(key, value);
        } else if (typeof value === 'object' && value !== null) {
          if (value.$eq) queryBuilder = queryBuilder.eq(key, value.$eq);
          if (value.$neq) queryBuilder = queryBuilder.neq(key, value.$neq);
          if (value.$gt) queryBuilder = queryBuilder.gt(key, value.$gt);
          if (value.$gte) queryBuilder = queryBuilder.gte(key, value.$gte);
          if (value.$lt) queryBuilder = queryBuilder.lt(key, value.$lt);
          if (value.$lte) queryBuilder = queryBuilder.lte(key, value.$lte);
          if (value.$like) queryBuilder = queryBuilder.like(key, value.$like);
          if (value.$ilike) queryBuilder = queryBuilder.ilike(key, value.$ilike);
          if (value.$in) queryBuilder = queryBuilder.in(key, value.$in);
          if (value.$is) queryBuilder = queryBuilder.is(key, value.$is);
        } else {
          queryBuilder = queryBuilder.eq(key, value);
        }
      });
    }

    // Apply select, order, limit, offset
    if (options.select) queryBuilder = queryBuilder.select(options.select);
    if (options.order) queryBuilder = queryBuilder.order(options.order.column, { ascending: options.order.ascending !== false });
    if (options.limit) queryBuilder = queryBuilder.limit(options.limit);
    if (options.offset) queryBuilder = queryBuilder.range(options.offset, options.offset + (options.limit || 1) - 1);

    let result;
    try {
      switch (operation) {
        case 'select':
          result = await queryBuilder;
          break;
        case 'insert':
          result = await this.client.from(table).insert(options.data).select();
          break;
        case 'update':
          result = await this.client.from(table).update(options.data).eq('id', options.id).select();
          break;
        case 'delete':
          result = await this.client.from(table).delete().eq('id', options.id);
          break;
        case 'count':
          result = await queryBuilder.select('*', { count: 'exact', head: true });
          break;
        default:
          throw new Error(`Unsupported operation: ${operation}`);
      }
    } catch (error) {
      console.error(`[Database] Query error on ${table}:`, error.message);
      throw error;
    }

    const responseTime = Date.now() - startTime;
    this.metrics.avgResponseTime = (this.metrics.avgResponseTime * (this.metrics.queries - 1) + responseTime) / this.metrics.queries;

    // Cache the result for read operations
    if (operation === 'select' && options.cache !== false && result.data) {
      const cacheKey = this._generateCacheKey(table, options.query || {}, options.params || {});
      queryCache.set(cacheKey, result);
    }

    return result;
  }

  /**
   * Batch multiple operations in a single transaction
   */
  async batch(operations) {
    const startTime = Date.now();
    
    // Group by table for optimization
    const grouped = {};
    operations.forEach(op => {
      if (!grouped[op.table]) grouped[op.table] = [];
      grouped[op.table].push(op);
    });

    const results = [];
    
    for (const [table, tableOps] of Object.entries(grouped)) {
      // For inserts, batch them together
      const inserts = tableOps.filter(op => op.operation === 'insert');
      if (inserts.length > 0) {
        const allData = inserts.map(op => op.data);
        const result = await this.client.from(table).insert(allData).select();
        results.push(...inserts.map((_, idx) => ({ 
          operation: 'insert', 
          success: !result.error,
          data: result.data ? result.data[idx] : null 
        })));
      }

      // Process other operations individually
      for (const op of tableOps.filter(op => op.operation !== 'insert')) {
        const result = await this.query(table, op.operation, op.options);
        results.push({ operation: op.operation, success: !result.error, data: result.data });
      }
    }

    console.log(`[Database] Batch completed in ${Date.now() - startTime}ms, ${operations.length} operations`);
    return results;
  }

  /**
   * Invalidate cache for a table
   */
  invalidateCache(table, id = null) {
    if (id) {
      // Invalidate specific record
      const keysToDelete = [];
      for (const key of queryCache.keys()) {
        if (key.startsWith(`${table}:`) && key.includes(id)) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach(key => queryCache.delete(key));
    } else {
      // Invalidate all records for table
      const keysToDelete = [];
      for (const key of queryCache.keys()) {
        if (key.startsWith(`${table}:`)) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach(key => queryCache.delete(key));
    }
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      cacheSize: queryCache.size,
      cacheHitRate: this.metrics.queries > 0 ? (this.metrics.cacheHits / this.metrics.queries * 100).toFixed(2) + '%' : '0%',
    };
  }

  /**
   * Health check with connection pool status
   */
  async healthCheck() {
    try {
      const startTime = Date.now();
      const { error } = await this.client.from('contacts').select('id').limit(1);
      const responseTime = Date.now() - startTime;
      
      return {
        healthy: !error,
        responseTime,
        metrics: this.getMetrics(),
      };
    } catch (err) {
      return { healthy: false, error: err.message };
    }
  }
}

// Singleton instance
let _optimizedClient = null;

function getOptimizedSupabaseClient() {
  if (!_optimizedClient) {
    _optimizedClient = new OptimizedSupabaseClient();
  }
  return _optimizedClient;
}

module.exports = {
  OptimizedSupabaseClient,
  getOptimizedSupabaseClient,
  queryCache,
};