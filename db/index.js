const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const dbConfig = require('../config/db');

let activePool = null;

function createRealPool() {
  if (dbConfig.connectionString) {
    return new Pool({
      connectionString: dbConfig.connectionString,
      ssl: dbConfig.ssl,
    });
  }
  return new Pool({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    ssl: dbConfig.ssl,
  });
}

function createMemPool() {
  const { newDb } = require('pg-mem');
  const memDb = newDb();
  const migrationPath = path.join(__dirname, 'migrations', '001_initial_schema.sql');
  if (fs.existsSync(migrationPath)) {
    const sql = fs.readFileSync(migrationPath, 'utf8');
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
    activePool = createMemPool();
    return activePool;
  }
}

const query = async (text, params) => {
  const pool = getPool();
  return pool.query(text, params);
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
