# Complete Example

Full production-ready authentication flow with all security features.

## Full Authentication Implementation

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Security
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(','),
    credentials: true,
  });
  
  // Validation
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));
  
  await app.listen(3000);
}
bootstrap();

// auth.controller.ts
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  @Post('register')
  @Throttle(3, 3600)  // 3 registrations per hour
  async register(@Body() dto: CreateUserDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @Throttle(5, 60)  // 5 login attempts per minute
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: SignInDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { access_token, refresh_token } = await this.authService.signIn(
      dto.username,
      dto.password,
    );
    
    // Set httpOnly cookie
    response.cookie('refresh_token', refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
    
    return { access_token };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = this.extractToken(request);
    await this.authService.revokeToken(token);
    
    response.clearCookie('refresh_token');
    
    return { message: 'Logged out successfully' };
  }

  @Post('refresh')
  async refresh(@Req() request: Request) {
    const refreshToken = request.cookies['refresh_token'];
    return this.authService.refresh(refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getProfile(@Request() req) {
    return req.user;
  }
}
```

## Key Features

This comprehensive authentication and authorization system provides enterprise-grade security with multiple layers of protection:

### Security Layers

1. **Password Security**
   - bcrypt hashing with configurable rounds
   - Strong password validation
   - Automatic hashing before database insertion

2. **Token Management**
   - Short-lived access tokens (15 minutes)
   - Long-lived refresh tokens (7 days)
   - httpOnly cookies for refresh tokens
   - Token revocation via Redis blacklist

3. **Rate Limiting**
   - Login attempts limited to 5 per minute
   - Registration limited to 3 per hour
   - Prevents brute force attacks

4. **Security Headers**
   - Helmet for HTTP security headers
   - CORS configuration
   - Content Security Policy

5. **Input Validation**
   - class-validator for DTO validation
   - Whitelist and forbid non-whitelisted properties
   - Automatic transformation

### Production Checklist

- [ ] Store JWT_SECRET in environment variables
- [ ] Use strong, randomly generated secrets
- [ ] Configure proper CORS origins
- [ ] Enable HTTPS in production
- [ ] Set up monitoring and logging
- [ ] Implement MFA for sensitive accounts
- [ ] Regular security audits
- [ ] Keep dependencies updated
- [ ] Implement account lockout after failed attempts
- [ ] Add email verification for new accounts

### Testing Endpoints

```bash
# Register a new user
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "password": "SecurePass123!"}'

# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "password": "SecurePass123!"}' \
  -c cookies.txt

# Get profile (with access token)
curl http://localhost:3000/auth/me \
  -H "Authorization: Bearer <access_token>"

# Refresh token (uses cookie)
curl -X POST http://localhost:3000/auth/refresh \
  -b cookies.txt

# Logout
curl -X POST http://localhost:3000/auth/logout \
  -H "Authorization: Bearer <access_token>" \
  -b cookies.txt
```

### Environment Variables

```env
# JWT Configuration
JWT_SECRET=your-super-secret-key-minimum-32-characters
JWT_REFRESH_SECRET=your-refresh-token-secret-different-from-access
JWT_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d

# Redis (for token blacklist)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# CORS
ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com

# Application
NODE_ENV=production
PORT=3000
```

### Monitoring and Logging

```typescript
// Add logging interceptor
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, ip } = request;
    const userAgent = request.get('user-agent') || '';
    const now = Date.now();

    return next.handle().pipe(
      tap(() => {
        const response = context.switchToHttp().getResponse();
        const { statusCode } = response;
        const contentLength = response.get('content-length');
        const responseTime = Date.now() - now;

        this.logger.log(
          `${method} ${url} ${statusCode} ${contentLength} - ${userAgent} ${ip} - ${responseTime}ms`
        );
      }),
    );
  }
}

// Add to app.module.ts
providers: [
  {
    provide: APP_INTERCEPTOR,
    useClass: LoggingInterceptor,
  },
]
```

This production-ready implementation provides a solid foundation for building secure applications with proper authentication and authorization.
