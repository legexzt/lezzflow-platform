require('dotenv').config({ quiet: true });
const cluster = require('cluster');
const os = require('os');
const app = require('./app');
const { runMigrations } = require('./db/migrate');
const { startScanWorker, stopScanWorker } = require('./services/scanWorker');

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    if (process.env.AUTO_MIGRATE === 'true' && !cluster.isWorker) {
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
      stopScanWorker();
      server.close(() => {
        console.log('HTTP server closed.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('SIGINT', () => handleShutdown('SIGINT'));

    // Async scan queue worker: claims queued scan jobs (FOR UPDATE SKIP LOCKED
    // in production) and processes them in the background. Disabled in tests
    // and when SCAN_WORKER_ENABLED=0.
    if (process.env.SCAN_WORKER_ENABLED !== '0') {
      const intervalMs = parseInt(process.env.SCAN_WORKER_INTERVAL_MS || '5000', 10);
      startScanWorker(intervalMs);
    }
    return server;
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  const isClusterEnabled = process.env.NODE_ENV !== 'test' && process.env.CLUSTER_ENABLED !== 'false';

  if (isClusterEnabled) {
    const isPrimary = cluster.isPrimary !== undefined ? cluster.isPrimary : cluster.isMaster;

    if (isPrimary) {
      (async () => {
        try {
          if (process.env.AUTO_MIGRATE === 'true') {
            console.log('Running automatic database migrations...');
            await runMigrations();
          }

          const cpus = os.cpus().length;
          const configuredWorkers = parseInt(process.env.CLUSTER_WORKERS || '0', 10);
          const workerCount = Math.min(cpus, configuredWorkers || cpus);

          console.log(`Primary ${process.pid} is running. Forking ${workerCount} workers...`);

          let isShuttingDown = false;
          const handlePrimaryShutdown = (signal) => {
            console.log(`Primary received ${signal}. Shutting down workers...`);
            isShuttingDown = true;
            for (const id in cluster.workers) {
              if (cluster.workers[id]) {
                cluster.workers[id].kill(signal);
              }
            }
          };

          process.on('SIGTERM', () => handlePrimaryShutdown('SIGTERM'));
          process.on('SIGINT', () => handlePrimaryShutdown('SIGINT'));

          cluster.on('online', (worker) => {
            console.log(`Worker ${worker.process.pid} is online`);
          });

          cluster.on('exit', (worker, code, signal) => {
            console.log(`Worker ${worker.process.pid} exited (code: ${code}, signal: ${signal || 'none'})`);
            if (!isShuttingDown && !worker.exitedAfterDisconnect) {
              console.log('Worker exited unexpectedly. Respawning...');
              cluster.fork();
            }
          });

          for (let i = 0; i < workerCount; i++) {
            cluster.fork();
          }
        } catch (error) {
          console.error('Failed to start cluster primary:', error);
          process.exit(1);
        }
      })();
    } else {
      startServer();
    }
  } else {
    startServer();
  }
}

module.exports = { startServer };
