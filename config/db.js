require('dotenv').config({ quiet: true });

module.exports = {
  connectionString: process.env.DATABASE_URL,
  host: process.env.PGHOST || process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.PGPORT || process.env.DB_PORT || '5432', 10),
  user: process.env.PGUSER || process.env.DB_USER || 'postgres',
  password: process.env.PGPASSWORD || process.env.DB_PASSWORD || 'postgres',
  database: process.env.PGDATABASE || process.env.DB_NAME || 'lezzflow',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
};
