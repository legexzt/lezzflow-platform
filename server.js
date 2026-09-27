require('dotenv').config({ quiet: true });
const app = require('./app');
const { runMigrations } = require('./db/migrate');

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    if (process.env.AUTO_MIGRATE === 'true') {
      console.log('Running automatic database migrations...');
      await runMigrations();
    }

    const server = app.listen(PORT, () => {
      console.log(`LezzFlow platform API running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    // Graceful shutdown
    const handleShutdown = (signal) => {
      console.log(`Received ${signal}. Shutting down gracefully...`);
      server.close(() => {
        console.log('HTTP server closed.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('SIGINT', () => handleShutdown('SIGINT'));
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer };
