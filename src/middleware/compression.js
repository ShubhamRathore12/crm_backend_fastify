'use strict';

const zlib = require('zlib');
const { promisify } = require('util');

const gzip = promisify(zlib.gzip);
const brotliCompress = promisify(zlib.brotliCompress);

/**
 * Compression middleware for Fastify
 * Supports gzip and brotli compression
 */
async function compressionMiddleware(fastify, options) {
  const compressionEnabled = process.env.COMPRESSION_ENABLED !== 'false';
  const minSize = parseInt(process.env.COMPRESSION_MIN_SIZE || '1024', 10); // 1KB minimum
  
  if (!compressionEnabled) {
    fastify.log.info('Compression middleware disabled');
    return;
  }

  fastify.addHook('onSend', async (request, reply, payload) => {
    // Skip compression for certain content types
    const contentType = reply.getHeader('content-type') || '';
    if (
      !payload ||
      typeof payload !== 'string' ||
      payload.length < minSize ||
      contentType.includes('image/') ||
      contentType.includes('video/') ||
      contentType.includes('audio/') ||
      contentType.includes('font/') ||
      contentType.includes('application/octet-stream')
    ) {
      return payload;
    }

    // Check client's accepted encodings
    const acceptEncoding = request.headers['accept-encoding'] || '';
    
    try {
      let compressed;
      let encoding;
      
      // Prefer brotli if supported (better compression ratio)
      if (acceptEncoding.includes('br')) {
        compressed = await brotliCompress(payload, {
          params: {
            [zlib.constants.BROTLI_PARAM_QUALITY]: 4, // Balance between speed and compression
            [zlib.constants.BROTLI_PARAM_SIZE_HINT]: payload.length,
          },
        });
        encoding = 'br';
      } else if (acceptEncoding.includes('gzip')) {
        compressed = await gzip(payload, { level: zlib.constants.Z_BEST_SPEED });
        encoding = 'gzip';
      } else {
        // Client doesn't support compression
        return payload;
      }

      // Only compress if we actually save space
      if (compressed.length < payload.length * 0.9) { // At least 10% reduction
        reply.header('Content-Encoding', encoding);
        reply.header('Vary', 'Accept-Encoding');
        reply.header('Content-Length', compressed.length);
        
        // Add compression ratio header for debugging
        if (process.env.NODE_ENV !== 'production') {
          const ratio = ((1 - compressed.length / payload.length) * 100).toFixed(1);
          reply.header('X-Compression-Ratio', `${ratio}%`);
        }
        
        return compressed;
      }
      
      return payload;
    } catch (error) {
      fastify.log.warn({ err: error }, 'Compression failed');
      return payload;
    }
  });
}

module.exports = compressionMiddleware;