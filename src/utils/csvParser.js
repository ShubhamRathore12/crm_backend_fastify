'use strict';

const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { promisify } = require('util');
const { pipeline } = require('stream');
const { createReadStream } = require('fs');
const csv = require('csv-parser');
const { Transform } = require('stream');

const pipelineAsync = promisify(pipeline);

/**
 * Fast CSV parser using streams and worker threads
 */
class FastCSVParser {
  constructor(options = {}) {
    this.options = {
      batchSize: parseInt(process.env.CSV_BATCH_SIZE || '1000', 10),
      maxWorkers: parseInt(process.env.MAX_WORKERS || '4', 10),
      ...options,
    };
    this.workers = [];
  }

  /**
   * Parse CSV from string (small files)
   */
  async parseString(csvString) {
    return new Promise((resolve, reject) => {
      const rows = [];
      const lines = csvString.trim().split('\n');
      
      if (lines.length < 2) {
        reject(new Error('CSV must have a header row and at least one data row'));
        return;
      }

      // Parse headers
      const headers = lines[0].split(',').map(h => 
        h.trim().replace(/^"|"$/g, '').toLowerCase()
      );

      // Fast parsing without regex for small files
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const row = {};
        let current = '';
        let inQuotes = false;
        let colIndex = 0;

        for (const char of line) {
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            row[headers[colIndex]] = current.trim();
            current = '';
            colIndex++;
          } else {
            current += char;
          }
        }
        
        // Last column
        row[headers[colIndex]] = current.trim();
        rows.push(row);
      }

      resolve(rows);
    });
  }

  /**
   * Parse large CSV file using streams and worker threads
   */
  async parseFile(filePath, onBatch) {
    return new Promise((resolve, reject) => {
      const rows = [];
      let batch = [];
      let rowCount = 0;

      const csvStream = csv({
        mapHeaders: ({ header }) => header.trim().replace(/^"|"$/g, '').toLowerCase(),
        mapValues: ({ value }) => value.trim(),
        strict: false,
        skipLines: 0,
      });

      const batchTransform = new Transform({
        objectMode: true,
        transform(row, encoding, callback) {
          batch.push(row);
          rowCount++;

          if (batch.length >= this.options.batchSize) {
            if (onBatch) {
              onBatch([...batch], rowCount);
            } else {
              rows.push(...batch);
            }
            batch = [];
          }
          callback();
        },
        flush(callback) {
          if (batch.length > 0) {
            if (onBatch) {
              onBatch(batch, rowCount);
            } else {
              rows.push(...batch);
            }
          }
          callback();
        },
      });

      pipelineAsync(
        createReadStream(filePath),
        csvStream,
        batchTransform
      )
        .then(() => {
          resolve({ rowCount, rows: onBatch ? null : rows });
        })
        .catch(reject);
    });
  }

  /**
   * Parse CSV in parallel using worker threads (for very large files)
   */
  async parseFileParallel(filePath, chunkSize = 1024 * 1024 * 10) { // 10MB chunks
    return new Promise((resolve, reject) => {
      if (!isMainThread) {
        // Worker thread logic
        const { chunk, headers } = workerData;
        const rows = this.parseChunk(chunk, headers);
        parentPort.postMessage({ rows });
        return;
      }

      // Main thread logic
      const fs = require('fs');
      const fileSize = fs.statSync(filePath).size;
      const chunks = Math.ceil(fileSize / chunkSize);
      
      console.log(`[CSVParser] Processing ${fileSize} bytes in ${chunks} chunks`);

      const workers = [];
      const allRows = [];
      let completedWorkers = 0;

      for (let i = 0; i < Math.min(chunks, this.options.maxWorkers); i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, fileSize);

        const worker = new Worker(__filename, {
          workerData: {
            filePath,
            start,
            end,
            chunkIndex: i,
          },
        });

        worker.on('message', (message) => {
          allRows.push(...message.rows);
        });

        worker.on('error', reject);
        worker.on('exit', (code) => {
          completedWorkers++;
          if (completedWorkers === workers.length) {
            resolve(allRows);
          }
        });

        workers.push(worker);
      }
    });
  }

  /**
   * Parse a chunk of CSV data (worker thread method)
   */
  parseChunk(chunk, headers) {
    const rows = [];
    const lines = chunk.split('\n');
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      const row = {};
      let current = '';
      let inQuotes = false;
      let colIndex = 0;

      for (const char of line) {
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          row[headers[colIndex]] = current.trim();
          current = '';
          colIndex++;
        } else {
          current += char;
        }
      }
      
      row[headers[colIndex]] = current.trim();
      rows.push(row);
    }

    return rows;
  }

  /**
   * Convert CSV rows to contact records with validation
   */
  csvRowsToContacts(rows, mapping = {}) {
    const defaultMapping = {
      email: 'email',
      name: 'name',
      mobile: 'mobile',
      ucc_code: 'ucc_code',
      pan: 'pan',
      address: 'address',
    };

    const finalMapping = { ...defaultMapping, ...mapping };
    const contacts = [];
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const contact = {
        id: require('uuid').v4(),
        email: '',
        name: '',
        mobile: '',
        ucc_code: '',
        pan: '',
        address: '',
        custom_fields: {},
      };

      try {
        // Map fields
        for (const [field, csvField] of Object.entries(finalMapping)) {
          if (csvField && row[csvField]) {
            if (field === 'email') {
              contact.email = row[csvField].toLowerCase().trim();
            } else {
              contact[field] = row[csvField];
            }
          }
        }

        // Extract custom fields (any column not in mapping)
        for (const [key, value] of Object.entries(row)) {
          if (!Object.values(finalMapping).includes(key) && value) {
            contact.custom_fields[key] = value;
          }
        }

        // Validate required fields
        if (!contact.email) {
          throw new Error('Email is required');
        }

        // Basic email validation
        if (!contact.email.includes('@')) {
          throw new Error('Invalid email format');
        }

        contacts.push(contact);
      } catch (error) {
        errors.push({
          row: i + 2, // +2 for header row and 1-based indexing
          data: row,
          error: error.message,
        });
      }
    }

    return { contacts, errors };
  }
}

// Export singleton
const parser = new FastCSVParser();
module.exports = parser;