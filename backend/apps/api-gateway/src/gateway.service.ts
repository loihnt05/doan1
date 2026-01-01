import { Injectable } from '@nestjs/common';

@Injectable()
export class GatewayService {
  getHello(): string {
    return 'API Gateway - All services accessible here';
  }

  // Retry with exponential backoff
  async retry<T>(fn: () => Promise<T>, retries = 3, delay = 500): Promise<T> {
    try {
      const result = await fn();
      return result;
    } catch (error) {
      if (retries === 0) {
        throw error;
      }
      console.log(`Retry failed, ${retries} retries left. Waiting ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return this.retry(fn, retries - 1, delay * 2); // Exponential backoff
    }
  }
}
