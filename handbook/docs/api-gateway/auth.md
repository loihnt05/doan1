---
sidebar_position: 3
---
# Authentication & Authorization

## Overview

Authentication verifies **who you are**, while authorization determines **what you can do**. In an API Gateway, these are critical for securing your microservices.

## Authentication

### JWT (JSON Web Tokens)

The most common authentication method for microservices.

```typescript
// auth.service.ts
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(private jwtService: JwtService) {}

  async login(credentials: LoginDto) {
    // Validate credentials
    const user = await this.validateUser(credentials);
    
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Generate JWT token
    const payload = {
      sub: user.id,
      email: user.email,
      roles: user.roles
    };

    return {
      access_token: this.jwtService.sign(payload),
      expires_in: 3600
    };
  }

  async validateToken(token: string) {
    try {
      return this.jwtService.verify(token);
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
```

### JWT Guard

```typescript
// jwt-auth.guard.ts
import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest(err, user, info) {
    if (err || !user) {
      throw new UnauthorizedException('Authentication required');
    }
    return user;
  }
}
```

### JWT Strategy

```typescript
// jwt.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET
    });
  }

  async validate(payload: any) {
    return {
      userId: payload.sub,
      email: payload.email,
      roles: payload.roles
    };
  }
}
```

### Usage

```typescript
@Controller('api')
export class UserController {
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  getProfile(@Request() req) {
    return req.user;
  }

  @Post('login')
  async login(@Body() credentials: LoginDto) {
    return this.authService.login(credentials);
  }
}
```

## Authorization

### Role-Based Access Control (RBAC)

```typescript
// roles.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const Roles = (...roles: string[]) => SetMetadata('roles', roles);

// roles.guard.ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.get<string[]>('roles', context.getHandler());
    
    if (!requiredRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    return requiredRoles.some(role => user.roles?.includes(role));
  }
}
```

**Usage:**

```typescript
@Controller('api/admin')
export class AdminController {
  @Get('users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  getAllUsers() {
    return this.userService.findAll();
  }

  @Delete('users/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin')
  deleteUser(@Param('id') id: string) {
    return this.userService.delete(id);
  }
}
```

### Permission-Based Access Control

More granular than roles.

```typescript
// permissions.decorator.ts
export const Permissions = (...permissions: string[]) => 
  SetMetadata('permissions', permissions);

// permissions.guard.ts
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.get<string[]>(
      'permissions',
      context.getHandler()
    );

    if (!requiredPermissions) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Fetch user permissions from database or cache
    const userPermissions = await this.getUserPermissions(user.userId);

    return requiredPermissions.every(permission =>
      userPermissions.includes(permission)
    );
  }

  private async getUserPermissions(userId: string): Promise<string[]> {
    // Get from cache or database
    const cached = await this.cache.get(`permissions:${userId}`);
    if (cached) return cached;

    const permissions = await this.permissionService.getUserPermissions(userId);
    await this.cache.set(`permissions:${userId}`, permissions, 300);
    return permissions;
  }
}
```

**Usage:**

```typescript
@Controller('api/orders')
export class OrderController {
  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('orders:create')
  createOrder(@Body() data: CreateOrderDto) {
    return this.orderService.create(data);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('orders:read')
  getOrder(@Param('id') id: string) {
    return this.orderService.findOne(id);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('orders:update')
  updateOrder(@Param('id') id: string, @Body() data: UpdateOrderDto) {
    return this.orderService.update(id, data);
  }
}
```

## API Keys

For service-to-service communication.

```typescript
// api-key.guard.ts
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private apiKeyService: ApiKeyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];

    if (!apiKey) {
      throw new UnauthorizedException('API key required');
    }

    const isValid = await this.apiKeyService.validate(apiKey);

    if (!isValid) {
      throw new UnauthorizedException('Invalid API key');
    }

    // Attach service info to request
    request.service = await this.apiKeyService.getServiceInfo(apiKey);
    
    return true;
  }
}
```

**API Key Service:**

```typescript
@Injectable()
export class ApiKeyService {
  constructor(
    private redis: Redis,
    private apiKeyRepository: ApiKeyRepository
  ) {}

  async validate(apiKey: string): Promise<boolean> {
    // Check cache first
    const cached = await this.redis.get(`apikey:${apiKey}`);
    if (cached) return cached === 'valid';

    // Check database
    const key = await this.apiKeyRepository.findOne({
      where: { key: apiKey, active: true }
    });

    const isValid = !!key;

    // Cache result
    await this.redis.setex(`apikey:${apiKey}`, 300, isValid ? 'valid' : 'invalid');

    return isValid;
  }

  async getServiceInfo(apiKey: string) {
    const key = await this.apiKeyRepository.findOne({
      where: { key: apiKey },
      relations: ['service']
    });

    return {
      serviceId: key.service.id,
      serviceName: key.service.name,
      rateLimit: key.rateLimit
    };
  }

  async generateApiKey(serviceId: string): Promise<string> {
    const apiKey = this.generateSecureKey();
    
    await this.apiKeyRepository.save({
      key: apiKey,
      serviceId,
      active: true,
      createdAt: new Date()
    });

    return apiKey;
  }

  private generateSecureKey(): string {
    return `sk_${crypto.randomBytes(32).toString('hex')}`;
  }
}
```

## OAuth 2.0

For third-party integrations.

```typescript
// oauth.strategy.ts
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: 'http://localhost:3000/auth/google/callback',
      scope: ['email', 'profile']
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any
  ) {
    const { id, emails, displayName } = profile;

    const user = {
      googleId: id,
      email: emails[0].value,
      name: displayName,
      accessToken
    };

    return user;
  }
}

// oauth.controller.ts
@Controller('auth')
export class AuthController {
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleAuth() {
    // Redirects to Google
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthCallback(@Request() req) {
    // User info from Google
    const user = await this.authService.findOrCreateUser(req.user);
    
    // Generate JWT
    const token = this.authService.generateToken(user);
    
    return { token };
  }
}
```

## Multi-Factor Authentication (MFA)

```typescript
// mfa.service.ts
@Injectable()
export class MfaService {
  async generateSecret(userId: string) {
    const secret = speakeasy.generateSecret({
      name: `MyApp (${userId})`,
      length: 32
    });

    // Store secret
    await this.userRepository.update(userId, {
      mfaSecret: secret.base32,
      mfaEnabled: false
    });

    // Generate QR code
    const qrCode = await QRCode.toDataURL(secret.otpauth_url);

    return {
      secret: secret.base32,
      qrCode
    };
  }

  async verifyToken(userId: string, token: string): Promise<boolean> {
    const user = await this.userRepository.findOne(userId);
    
    return speakeasy.totp.verify({
      secret: user.mfaSecret,
      encoding: 'base32',
      token,
      window: 2
    });
  }

  async enableMfa(userId: string, token: string) {
    const isValid = await this.verifyToken(userId, token);
    
    if (!isValid) {
      throw new BadRequestException('Invalid MFA token');
    }

    await this.userRepository.update(userId, {
      mfaEnabled: true
    });
  }
}

// Login with MFA
@Post('login')
async login(@Body() credentials: LoginDto) {
  const user = await this.authService.validateUser(credentials);

  if (user.mfaEnabled) {
    // Return temporary token
    return {
      mfaRequired: true,
      tempToken: this.authService.generateTempToken(user.id)
    };
  }

  // Regular login
  return this.authService.generateToken(user);
}

@Post('mfa/verify')
async verifyMfa(@Body() data: { tempToken: string; mfaToken: string }) {
  const userId = await this.authService.verifyTempToken(data.tempToken);
  const isValid = await this.mfaService.verifyToken(userId, data.mfaToken);

  if (!isValid) {
    throw new UnauthorizedException('Invalid MFA token');
  }

  const user = await this.userRepository.findOne(userId);
  return this.authService.generateToken(user);
}
```

## Best Practices

### 1. Secure Token Storage

```typescript
//  GOOD: httpOnly cookies
@Post('login')
async login(@Body() credentials: LoginDto, @Res() res: Response) {
  const token = await this.authService.login(credentials);

  res.cookie('access_token', token, {
    httpOnly: true,    // Not accessible via JavaScript
    secure: true,      // HTTPS only
    sameSite: 'strict',
    maxAge: 3600000    // 1 hour
  });

  return res.json({ message: 'Logged in' });
}

//  BAD: localStorage (vulnerable to XSS)
// localStorage.setItem('token', token);
```

### 2. Token Refresh

```typescript
@Post('refresh')
async refreshToken(@Req() req: Request) {
  const refreshToken = req.cookies['refresh_token'];
  
  if (!refreshToken) {
    throw new UnauthorizedException('Refresh token required');
  }

  const payload = await this.authService.verifyRefreshToken(refreshToken);
  const newAccessToken = this.authService.generateAccessToken(payload);

  return { access_token: newAccessToken };
}
```

### 3. Rate Limiting for Auth Endpoints

```typescript
@Post('login')
@UseGuards(ThrottlerGuard)
@Throttle(5, 60) // 5 attempts per minute
async login(@Body() credentials: LoginDto) {
  return this.authService.login(credentials);
}
```

### 4. Audit Logging

```typescript
@Post('login')
async login(@Body() credentials: LoginDto, @Req() req: Request) {
  const result = await this.authService.login(credentials);

  // Log authentication attempt
  await this.auditService.log({
    action: 'LOGIN',
    userId: result.user.id,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    success: true,
    timestamp: new Date()
  });

  return result;
}
```

## Testing

```typescript
describe('Authentication', () => {
  it('should authenticate with valid credentials', async () => {
    const result = await authService.login({
      email: 'user@example.com',
      password: 'password123'
    });

    expect(result).toHaveProperty('access_token');
    expect(result.expires_in).toBe(3600);
  });

  it('should reject invalid credentials', async () => {
    await expect(
      authService.login({
        email: 'user@example.com',
        password: 'wrong'
      })
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should validate JWT token', async () => {
    const token = 'valid.jwt.token';
    const payload = await authService.validateToken(token);

    expect(payload).toHaveProperty('sub');
    expect(payload).toHaveProperty('email');
  });
});
```

## Next Steps

- Learn about [Rate Limiting](./rate-limiting.md)
- Explore [Circuit Breaker](./circuit-breaker.md)
- Check [Service Discovery](./service-discovery.md)
