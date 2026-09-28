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
  const { newDb } = require('pg-mem');
  const memDb = newDb();
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
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
