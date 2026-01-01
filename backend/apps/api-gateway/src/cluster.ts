import cluster from 'cluster';
import * as os from 'os';

/**
 * Cluster Bootstrap for Vertical Scaling
 * 
 * This demonstrates vertical scaling by running multiple Node.js processes
 * (one per CPU core) to better utilize the machine's resources.
 * 
 * Each worker process runs independently with its own event loop,
 * so CPU-bound operations in one worker won't block others.
 */

async function bootstrap() {
  // Dynamically import the main NestJS bootstrap
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('./app.module');

  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  await app.listen(3000);
  
  console.log(`[Worker ${process.pid}] API Gateway started on port 3000`);
}

if (cluster.isPrimary) {
  const cpuCount = os.cpus().length;
  console.log(`[Primary ${process.pid}] Starting ${cpuCount} workers...`);
  
  // Fork workers equal to CPU count
  for (let i = 0; i < cpuCount; i++) {
    cluster.fork();
  }
  
  // Handle worker exit and restart
  cluster.on('exit', (worker, code, signal) => {
    console.log(`[Primary] Worker ${worker.process.pid} died. Restarting...`);
    cluster.fork();
  });
  
  console.log(`[Primary ${process.pid}] All workers started`);
} else {
  // Worker processes run the NestJS application
  bootstrap();
}
