# Security Best Practices

Essential security practices for authentication and authorization systems.

## 1. Password Security

**Strong Password Requirements**:
```typescript
import { IsString, IsNotEmpty, MinLength, Matches } from 'class-validator';

export class CreateUserDto {
  @IsNotEmpty()
  @IsString()
  username: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  @Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message: 'Password must contain uppercase, lowercase, number/special character',
  })
  password: string;
}
```

**Password Hashing Comparison**:
- **bcrypt** ✅ (Current): Slow by design, resistant to brute force
- **argon2** ✅ (Recommended): Winner of Password Hashing Competition, most secure
- **scrypt** ✅: Good alternative, memory-hard function
- **PBKDF2** ⚠️: Acceptable but slower to compute than bcrypt
- **MD5/SHA1** ❌: NEVER use for passwords (too fast, vulnerable)

**Implementing Argon2**:
```bash
npm install argon2
```

```typescript
import * as argon2 from 'argon2';

@BeforeInsert()
async hashPassword() {
  this.password = await argon2.hash(this.password, {
    type: argon2.argon2id,  // Hybrid of argon2i and argon2d
    memoryCost: 2 ** 16,     // 64 MB
    timeCost: 3,              // Number of iterations
    parallelism: 1,           // Number of threads
  });
}

// Verification
const isValid = await argon2.verify(user.password, plainPassword);
```

## 2. JWT Security

**Token Storage**:
- ✅ **httpOnly cookies**: Best for web apps (prevents XSS)
- ⚠️ **localStorage**: Vulnerable to XSS attacks
- ⚠️ **sessionStorage**: Vulnerable to XSS attacks
- ✅ **Memory**: Most secure but lost on refresh

**Refresh Token Pattern**:
```typescript
// auth.service.ts
async signIn(username: string, pass: string) {
  const user = await this.validateUser(username, pass);
  
  const payload = { sub: user.id, username: user.username };
  
  return {
    access_token: await this.jwtService.signAsync(payload, {
      expiresIn: '15m'  // Short-lived access token
    }),
    refresh_token: await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: '7d'  // Long-lived refresh token
    }),
  };
}

async refresh(refreshToken: string) {
  try {
    const payload = await this.jwtService.verifyAsync(refreshToken, {
      secret: process.env.JWT_REFRESH_SECRET
    });
    
    // Generate new access token
    return {
      access_token: await this.jwtService.signAsync({
        sub: payload.sub,
        username: payload.username
      }, {
        expiresIn: '15m'
      })
    };
  } catch {
    throw new UnauthorizedException('Invalid refresh token');
  }
}
```

**Token Revocation**:
```typescript
// Store revoked tokens in Redis
import { Injectable } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

@Injectable()
export class TokenBlacklistService {
  constructor(@InjectRedis() private redis: Redis) {}

  async revokeToken(token: string, expiresIn: number) {
    await this.redis.setex(`blacklist:${token}`, expiresIn, '1');
  }

  async isRevoked(token: string): Promise<boolean> {
    const result = await this.redis.get(`blacklist:${token}`);
    return result === '1';
  }
}

// Use in guard
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private blacklistService: TokenBlacklistService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const token = this.extractToken(context);
    
    if (await this.blacklistService.isRevoked(token)) {
      throw new UnauthorizedException('Token revoked');
    }
    
    // Continue validation...
    return true;
  }
}
```

## 3. Rate Limiting

```bash
npm install @nestjs/throttler
```

```typescript
// app.module.ts
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

@Module({
  imports: [
    ThrottlerModule.forRoot({
      ttl: 60,     // Time window in seconds
      limit: 10,   // Max requests per window
    }),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}

// Custom rate limit for login
@Controller('auth')
export class AuthController {
  @Post('login')
  @Throttle(5, 60)  // 5 requests per minute
  signIn(@Body() signInDto: SignInDto) {
    return this.authService.signIn(signInDto.username, signInDto.password);
  }
}
```

## 4. Multi-Factor Authentication (MFA)

```bash
npm install speakeasy qrcode
```

```typescript
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';

@Injectable()
export class MfaService {
  async generateSecret(username: string) {
    const secret = speakeasy.generateSecret({
      name: `MyApp (${username})`,
      length: 32,
    });
    
    const qrCode = await QRCode.toDataURL(secret.otpauth_url);
    
    return {
      secret: secret.base32,
      qrCode,
    };
  }

  verifyToken(secret: string, token: string): boolean {
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 1,  // Allow 1 step before/after current time
    });
  }
}

// Usage in auth flow
async enableMfa(userId: number) {
  const user = await this.usersService.findById(userId);
  const { secret, qrCode } = await this.mfaService.generateSecret(user.username);
  
  // Save secret to user
  await this.usersService.update(userId, { mfaSecret: secret });
  
  return { qrCode };
}

async signInWithMfa(username: string, password: string, mfaToken: string) {
  const user = await this.validateUser(username, password);
  
  if (user.mfaEnabled) {
    const isValid = this.mfaService.verifyToken(user.mfaSecret, mfaToken);
    if (!isValid) {
      throw new UnauthorizedException('Invalid MFA token');
    }
  }
  
  return this.generateTokens(user);
}
```

## 5. OAuth2 / Social Login

```bash
npm install @nestjs/passport passport passport-google-oauth20
```

```typescript
// google.strategy.ts
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { Injectable } from '@nestjs/common';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: 'http://localhost:3000/auth/google/callback',
      scope: ['email', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    const { name, emails, photos } = profile;
    
    const user = {
      email: emails[0].value,
      firstName: name.givenName,
      lastName: name.familyName,
      picture: photos[0].value,
      accessToken,
    };
    
    done(null, user);
  }
}

// auth.controller.ts
@Get('google')
@UseGuards(AuthGuard('google'))
async googleAuth(@Req() req) {}

@Get('google/callback')
@UseGuards(AuthGuard('google'))
async googleAuthRedirect(@Req() req) {
  // Create/find user in database
  const user = await this.authService.findOrCreateGoogleUser(req.user);
  
  // Generate JWT
  const tokens = await this.authService.generateTokens(user);
  
  return tokens;
}
```

## 6. Security Headers

```bash
npm install helmet
```

```typescript
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  }));
  
  await app.listen(3000);
}
bootstrap();
```

## 7. CORS Configuration

```typescript
const app = await NestFactory.create(AppModule);

app.enableCors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
```
