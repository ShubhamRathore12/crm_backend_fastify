'use strict';

const { performance, PerformanceObserver } = require('perf_hooks');
const { EventEmitter } = require('events');

/**
 * Performance monitoring and optimization utilities
 */
class PerformanceMonitor extends EventEmitter {
  constructor() {
    super();
    this.metrics = {
      requests: 0,
      avgResponseTime: 0,
      p95: 0,
      p99: 0,
      errors: 0,
      databaseQueries: 0,
      cacheHits: 0,
      cacheMisses: 0,
    };

    this.histogram = [];
    this.maxHistogramSize = 10000;
    
    this.setupPerformanceObserver();
    this.startMetricsCollection();
  }

  /**
   * Setup Performance Observer for automatic monitoring
   */
  setupPerformanceObserver() {
    const obs = new PerformanceObserver((items) => {
      items.getEntries().forEach(entry => {
        this.recordMetric(entry.name, entry.duration);
      });
    });
    
    obs.observe({ entryTypes: ['measure', 'function'] });
  }

  /**
   * Start periodic metrics collection
   */
  startMetricsCollection() {
    setInterval(() => {
      this.calculatePercentiles();
      this.emit('metrics', this.getMetrics());
      
      // Auto-scale based on metrics
      this.autoScale();
    }, 60000); // Every minute
  }

  /**
   * Record a performance metric
   */
  recordMetric(name, duration, metadata = {}) {
    this.metrics.requests++;
    
    // Update average response time
    this.metrics.avgResponseTime = 
      (this.metrics.avgResponseTime * (this.metrics.requests - 1) + duration) / this.metrics.requests;
    
    // Add to histogram for percentile calculation
    this.histogram.push({ name, duration, timestamp: Date.now(), ...metadata });
    
    // Keep histogram size manageable
    if (this.histogram.length > this.maxHistogramSize) {
      this.histogram = this.histogram.slice(-this.maxHistogramSize);
    }
  }

  /**
   * Calculate percentiles (p95, p99)
   */
  calculatePercentiles() {
    if (this.histogram.length === 0) return;
    
    const durations = this.histogram.map(h => h.duration).sort((a, b) => a - b);
    
    const p95Index = Math.floor(durations.length * 0.95);
    const p99Index = Math.floor(durations.length * 0.99);
    
    this.metrics.p95 = durations[p95Index] || 0;
    this.metrics.p99 = durations[p99Index] || 0;
  }

  /**
   * Auto-scale based on performance metrics
   */
  autoScale() {
    const { p95, avgResponseTime } = this.metrics;
    
    // If p95 response time > 500ms, consider scaling
    if (p95 > 500) {
      this.emit('scaleWarning', {
        message: 'High response times detected',
        p95,
        avgResponseTime,
        recommendation: 'Consider increasing worker concurrency or adding more instances'
      });
    }
    
    // If error rate > 5%, alert
    const errorRate = this.metrics.errors / Math.max(this.metrics.requests, 1);
    if (errorRate > 0.05) {
      this.emit('errorWarning', {
        message: 'High error rate detected',
        errorRate: (errorRate * 100).toFixed(2) + '%',
        recommendation: 'Check database connections and external service health'
      });
    }
  }

  /**
   * Measure execution time of a function
   */
  async measure(name, fn) {
    const start = performance.now();
    
    try {
      const result = await fn();
      const duration = performance.now() - start;
      
      this.recordMetric(name, duration, { success: true });
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.metrics.errors++;
      
      this.recordMetric(name, duration, { success: false, error: error.message });
      throw error;
    }
  }

  /**
   * Create a performance measurement wrapper
   */
  createWrapper(name, fn) {
    return async (...args) => {
      return this.measure(name, () => fn(...args));
    };
  }

  /**
   * Database query performance monitoring
   */
  monitorDatabase() {
    const originalQuery = require('../config/database').getOptimizedSupabaseClient().query;
    const client = require('../config/database').getOptimizedSupabaseClient();
    
    // Wrap query method
    client.query = async function(table, operation, options) {
      const start = performance.now();
      this.metrics.databaseQueries++;
      
      try {
        const result = await originalQuery.call(this, table, operation, options);
        const duration = performance.now() - start;
        
        this.recordMetric(`db.${table}.${operation}`, duration, { 
          success: true,
          cached: result.cached || false
        });
        
        return result;
      } catch (error) {
        const duration = performance.now() - start;
        this.recordMetric(`db.${table}.${operation}`, duration, { 
          success: false,
          error: error.message
        });
        throw error;
      }
    }.bind(client);
  }

  /**
   * Cache performance monitoring
   */
  monitorCache() {
    const cache = require('../middleware/cache');
    
    const originalGet = cache.get;
    const originalSet = cache.set;
    
    cache.get = async function(key) {
      const start = performance.now();
      
      try {
        const result = await originalGet.call(this, key);
        const duration = performance.now() - start;
        
        if (result) {
          this.metrics.cacheHits++;
          this.recordMetric('cache.get.hit', duration, { key });
        } else {
          this.metrics.cacheMisses++;
          this.recordMetric('cache.get.miss', duration, { key });
        }
        
        return result;
      } catch (error) {
        const duration = performance.now() - start;
        this.recordMetric('cache.get.error', duration, { key, error: error.message });
        throw error;
      }
    }.bind(cache);
    
    cache.set = async function(key, data, ttl) {
      const start = performance.now();
      
      try {
        await originalSet.call(this, key, data, ttl);
        const duration = performance.now() - start;
        
        this.recordMetric('cache.set', duration, { key, ttl, size: JSON.stringify(data).length });
      } catch (error) {
        const duration = performance.now() - start;
        this.recordMetric('cache.set.error', duration, { key, error: error.message });
        throw error;
      }
    }.bind(cache);
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      histogramSize: this.histogram.length,
      cacheHitRate: this.metrics.cacheHits + this.metrics.cacheMisses > 0 
        ? (this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) * 100).toFixed(2) + '%'
        : '0%',
      timestamp: Date.now(),
    };
  }

  /**
   * Generate performance report
   */
  generateReport() {
    const metrics = this.getMetrics();
    const report = {
      summary: {
        totalRequests: metrics.requests,
        avgResponseTime: metrics.avgResponseTime.toFixed(2) + 'ms',
        p95ResponseTime: metrics.p95.toFixed(2) + 'ms',
        p99ResponseTime: metrics.p99.toFixed(2) + 'ms',
        errorRate: (metrics.errors / Math.max(metrics.requests, 1) * 100).toFixed(2) + '%',
        cacheHitRate: metrics.cacheHitRate,
        databaseQueries: metrics.databaseQueries,
      },
      recommendations: [],
    };

    // Generate recommendations
    if (metrics.p95 > 500) {
      report.recommendations.push({
        priority: 'HIGH',
        issue: 'Slow response times',
        suggestion: 'Implement database indexing, query optimization, or increase server resources',
        metric: `p95: ${metrics.p95.toFixed(2)}ms`,
      });
    }

    if (parseFloat(metrics.cacheHitRate) < 30) {
      report.recommendations.push({
        priority: 'MEDIUM',
        issue: 'Low cache hit rate',
        suggestion: 'Increase cache TTL, cache more endpoints, or implement Redis clustering',
        metric: `Hit rate: ${metrics.cacheHitRate}`,
      });
    }

    if (metrics.databaseQueries / Math.max(metrics.requests, 1) > 10) {
      report.recommendations.push({
        priority: 'HIGH',
        issue: 'High database query rate',
        suggestion: 'Implement query batching, connection pooling, or read replicas',
        metric: `${metrics.databaseQueries} queries for ${metrics.requests} requests`,
      });
    }

    return report;
  }

  /**
   * Reset metrics (for testing)
   */
  reset() {
    this.metrics = {
      requests: 0,
      avgResponseTime: 0,
      p95: 0,
      p99: 0,
      errors: 0,
      databaseQueries: 0,
      cacheHits: 0,
      cacheMisses: 0,
    };
    this.histogram = [];
  }
}

// Singleton instance
const monitor = new PerformanceMonitor();
module.exports = monitor;