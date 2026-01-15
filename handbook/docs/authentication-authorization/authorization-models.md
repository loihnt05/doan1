# Authorization Models

Different authorization strategies for controlling access to resources.

## 1. Role-Based Access Control (RBAC)

**Implementation**:

```typescript
// roles.enum.ts
export enum Role {
  USER = 'user',
  ADMIN = 'admin',
  MODERATOR = 'moderator',
}

// roles.decorator.ts
import { SetMetadata } from '@nestjs/common';
import { Role } from './roles.enum';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

// roles.guard.ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from './roles.enum';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    
    if (!requiredRoles) {
      return true;
    }
    
    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.some((role) => user.roles?.includes(role));
  }
}

// Usage
@Controller('admin')
export class AdminController {
  @Get('dashboard')
  @Roles(Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  getDashboard() {
    return { message: 'Admin dashboard' };
  }
}
```

**User Entity with Roles**:
```typescript
@Entity()
export class User {
  @PrimaryColumn()
  id: number;

  @Column({ unique: true })
  username: string;

  @Column()
  password: string;

  @Column('simple-array')
  roles: Role[];

  @BeforeInsert()
  async hashPassword() {
    const bcrypt = await import('bcrypt');
    this.password = await bcrypt.hash(this.password, 10);
  }
  
  @BeforeInsert()
  setDefaultRole() {
    if (!this.roles || this.roles.length === 0) {
      this.roles = [Role.USER];
    }
  }
}
```

## 2. Permission-Based Authorization

**Implementation**:

```typescript
// permissions.enum.ts
export enum Permission {
  CREATE_POST = 'create:post',
  READ_POST = 'read:post',
  UPDATE_POST = 'update:post',
  DELETE_POST = 'delete:post',
  MANAGE_USERS = 'manage:users',
  VIEW_ANALYTICS = 'view:analytics',
}

// permissions.decorator.ts
import { SetMetadata } from '@nestjs/common';
import { Permission } from './permissions.enum';

export const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

// permissions.guard.ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission } from './permissions.enum';
import { PERMISSIONS_KEY } from './permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()]
    );
    
    if (!requiredPermissions) {
      return true;
    }
    
    const { user } = context.switchToHttp().getRequest();
    
    return requiredPermissions.every((permission) =>
      user.permissions?.includes(permission)
    );
  }
}

// Usage
@Controller('posts')
export class PostsController {
  @Post()
  @RequirePermissions(Permission.CREATE_POST)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  createPost(@Body() createPostDto: CreatePostDto) {
    return this.postsService.create(createPostDto);
  }

  @Delete(':id')
  @RequirePermissions(Permission.DELETE_POST)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  deletePost(@Param('id') id: string) {
    return this.postsService.delete(id);
  }
}
```

## 3. Attribute-Based Access Control (ABAC)

**Implementation**:

```typescript
// abac.guard.ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

interface PolicyRule {
  effect: 'allow' | 'deny';
  conditions: {
    userAttribute?: string;
    resourceAttribute?: string;
    operator: 'equals' | 'contains' | 'greaterThan';
    value: any;
  }[];
}

@Injectable()
export class AbacGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const policy = this.reflector.get<PolicyRule>('policy', context.getHandler());
    
    if (!policy) {
      return true;
    }
    
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const resource = request.params; // or request.body
    
    return this.evaluatePolicy(policy, user, resource);
  }

  private evaluatePolicy(policy: PolicyRule, user: any, resource: any): boolean {
    for (const condition of policy.conditions) {
      const userValue = user[condition.userAttribute];
      const resourceValue = resource[condition.resourceAttribute];
      
      switch (condition.operator) {
        case 'equals':
          if (userValue !== condition.value) return false;
          break;
        case 'contains':
          if (!userValue.includes(condition.value)) return false;
          break;
        case 'greaterThan':
          if (userValue <= condition.value) return false;
          break;
      }
    }
    
    return policy.effect === 'allow';
  }
}

// Usage with decorator
export const Policy = (policy: PolicyRule) => SetMetadata('policy', policy);

@Controller('documents')
export class DocumentsController {
  @Get(':id')
  @Policy({
    effect: 'allow',
    conditions: [
      { userAttribute: 'department', operator: 'equals', value: 'engineering' },
      { userAttribute: 'level', operator: 'greaterThan', value: 3 }
    ]
  })
  @UseGuards(JwtAuthGuard, AbacGuard)
  getDocument(@Param('id') id: string) {
    return this.documentsService.findOne(id);
  }
}
```

## 4. Context-Based Policies

**Resource Ownership**:

```typescript
// ownership.guard.ts
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class OwnershipGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const resourceId = request.params.id;
    
    // Fetch resource and check ownership
    const resource = await this.getResource(resourceId);
    
    if (resource.ownerId !== user.id) {
      throw new ForbiddenException('You do not own this resource');
    }
    
    return true;
  }
  
  private async getResource(id: string) {
    // Fetch from database
    return { id, ownerId: 123 };
  }
}

// Usage
@Controller('posts')
export class PostsController {
  @Put(':id')
  @UseGuards(JwtAuthGuard, OwnershipGuard)
  updatePost(@Param('id') id: string, @Body() updatePostDto: UpdatePostDto) {
    return this.postsService.update(id, updatePostDto);
  }
}
```

## 5. Policy Enforcement Layer

**Centralized Policy Service**:

```typescript
// policy.service.ts
import { Injectable } from '@nestjs/common';

@Injectable()
export class PolicyService {
  private policies: Map<string, (user: any, resource: any) => boolean> = new Map();

  constructor() {
    this.registerPolicies();
  }

  private registerPolicies() {
    // Policy: User can update their own posts
    this.policies.set('post:update', (user, resource) => {
      return user.id === resource.ownerId || user.roles.includes('admin');
    });

    // Policy: User can delete posts if owner or moderator
    this.policies.set('post:delete', (user, resource) => {
      return (
        user.id === resource.ownerId ||
        user.roles.includes('admin') ||
        user.roles.includes('moderator')
      );
    });

    // Policy: User can view private posts if member
    this.policies.set('post:view', (user, resource) => {
      if (resource.visibility === 'public') return true;
      if (resource.visibility === 'private') {
        return user.id === resource.ownerId || resource.allowedUsers.includes(user.id);
      }
      return false;
    });
  }

  evaluate(policyName: string, user: any, resource: any): boolean {
    const policy = this.policies.get(policyName);
    if (!policy) {
      throw new Error(`Policy ${policyName} not found`);
    }
    return policy(user, resource);
  }
}

// policy.guard.ts
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PolicyService } from './policy.service';

@Injectable()
export class PolicyGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private policyService: PolicyService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policyName = this.reflector.get<string>('policyName', context.getHandler());
    
    if (!policyName) {
      return true;
    }
    
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const resourceId = request.params.id;
    
    // Fetch resource
    const resource = await this.getResource(resourceId);
    
    const allowed = this.policyService.evaluate(policyName, user, resource);
    
    if (!allowed) {
      throw new ForbiddenException('Policy violation');
    }
    
    return true;
  }

  private async getResource(id: string) {
    // Implementation
    return {};
  }
}

// Usage
@Put(':id')
@SetMetadata('policyName', 'post:update')
@UseGuards(JwtAuthGuard, PolicyGuard)
updatePost(@Param('id') id: string, @Body() dto: UpdatePostDto) {
  return this.postsService.update(id, dto);
}
```
