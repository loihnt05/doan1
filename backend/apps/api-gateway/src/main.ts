import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

/**
 * Event Loop Delay Monitor
 * Measures how long it takes for a setImmediate callback to execute
 * High delay indicates event loop is blocked (CPU-bound work)
 */
function startEventLoopMonitoring() {
  setInterval(() => {
    const start = Date.now();
    setImmediate(() => {
      const delay = Date.now() - start;
      if (delay > 10) {
        console.log(`  [PID ${process.pid}] Event loop delay: ${delay}ms`);
      }
    });
  }, 1000);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  
  // Start event loop monitoring
  startEventLoopMonitoring();
  
  await app.listen(3000);
  console.log(`🚀 [PID ${process.pid}] API Gateway running on http://localhost:3000/api`);
}
bootstrap();
