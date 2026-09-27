const fs = require('fs');
const path = require('path');
const { query } = require('./index');

async function runMigrations() {
  console.log('Starting database migrations...');
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    console.log(`Running migration: ${file}`);
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');
    try {
      await query(sql);
      console.log(`Successfully applied: ${file}`);
    } catch (err) {
      console.error(`Error running migration ${file}:`, err.message);
      throw err;
    }
  }
  console.log('All migrations executed successfully.');
}

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

module.exports = { runMigrations };
