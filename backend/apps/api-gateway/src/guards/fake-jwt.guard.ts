import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

@Injectable()
export class FakeJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];
    
    // Simple fake JWT validation - just checks for specific token
    return authHeader === 'Bearer demo-token';
  }
}
