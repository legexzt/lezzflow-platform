const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const dbConfig = require('../config/db');
const cache = require('../services/cache');

let activePool = null;

function createRealPool() {
  if (dbConfig.connectionString) {
    return new Pool({
      connectionString: dbConfig.connectionString,
      ssl: dbConfig.ssl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }
  return new Pool({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    ssl: dbConfig.ssl,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
}

function createMemPool() {
  const { newDb, DataType } = require('pg-mem');
  const memDb = newDb();
  // pg-mem ships very few native string functions; register the standard
  // Postgres ones our migrations use (trim, strpos) so .sql migrations run
  // identically in tests and in production.
  memDb.public.registerFunction({
    name: 'trim',
    args: [DataType.text],
    returns: DataType.text,
    implementation: (x) => (x == null ? null : String(x).trim()),
  });
  memDb.public.registerFunction({
    name: 'strpos',
    args: [DataType.text, DataType.text],
    returns: DataType.integer,
    implementation: (str, sub) => {
      if (str == null || sub == null) return null;
      const i = String(str).indexOf(String(sub));
      return i === -1 ? 0 : i + 1; // 1-based like Postgres
    },
  });
  memDb.public.registerFunction({
    name: 'regexp_replace',
    args: [DataType.text, DataType.text, DataType.text, DataType.text],
    returns: DataType.text,
    implementation: (str, pattern, replacement, flags) => {
      if (str == null || pattern == null) return null;
      const re = new RegExp(String(pattern), String(flags || '').includes('g') ? 'g' : '');
      return String(str).replace(re, String(replacement ?? ''));
    },
  });
  memDb.public.registerFunction({
    name: 'gen_random_uuid',
    args: [],
    returns: DataType.uuid,
    implementation: () => require('crypto').randomUUID(),
  });
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');
    // Skip migrations that are not compatible with pg-mem
    const firstFiveLines = sql.split('\n').slice(0, 5).join('\n');
    if (firstFiveLines.includes('SKIP-PGMEM')) {
      continue;
    }
    memDb.public.none(sql);
  }
  const { Pool: MemPool } = memDb.adapters.createPg();
  return new MemPool();
}


function getPool() {
  if (!activePool) {
    if (process.env.NODE_ENV === 'test') {
      activePool = createMemPool();
    } else {
      activePool = createRealPool();
    }
  }
  return activePool;
}

function setPool(customPool) {
  activePool = customPool;
}

function resetTestDb() {
  if (process.env.NODE_ENV === 'test') {
    cache.clear();
    activePool = createMemPool();
    return activePool;
  }
}

const query = async (text, params) => {
  const start = Date.now();
  try {
    const pool = getPool();
    return await pool.query(text, params);
  } finally {
    const duration = Date.now() - start;
    if (duration > 500 && process.env.NODE_ENV !== 'test') {
      const sqlText = typeof text === 'string' ? text : (text && text.text ? text.text : String(text));
      const truncated = sqlText.slice(0, 120);
      console.warn(`[slow-query] ${duration}ms :: ${truncated}`);
    }
  }
};

const getClient = async () => {
  const pool = getPool();
  return pool.connect();
};

const close = async () => {
  if (activePool) {
    await activePool.end();
    activePool = null;
  }
};

module.exports = {
  query,
  getClient,
  getPool,
  setPool,
  resetTestDb,
  close,
};
