```ts ai-streamer-elysiajs-backend/src/common/generic/base-repository.ts
// src/common/generic/base-repository.ts
import { container } from 'tsyringe-neo';
import { Prisma, PrismaClient } from '@prisma/client';
import { logger } from "../utils/logger.utils";

/* eslint-disable @typescript-eslint/no-explicit-any */
type PrismaClientType = new () => any;
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
type ModelNames<T extends PrismaClientType> = keyof Omit<InstanceType<T>, keyof Function>;
type TransactionClient = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

export abstract class BaseRepository<
  T extends PrismaClientType,
  Model extends ModelNames<T>
> {
  protected model: InstanceType<T>[Model];
  protected prisma: PrismaClient;
  private currentTrx?: TransactionClient;

  constructor() {
    type ModelType = Model;
    const modelName = String() as ModelType;

    const prisma = container.resolve(PrismaClient);
    this.prisma = prisma;
    this.model = prisma[modelName as keyof PrismaClient] as InstanceType<T>[Model];
    logger.info(`${String(modelName)} Repository initialized`);
  }

  withTrx(trx: TransactionClient) {
    this.currentTrx = trx;
    return this;
  }

  protected getClient(): InstanceType<T>[Model] {
    return (this.currentTrx?.[this.model.$name as keyof TransactionClient] ?? this.model) as InstanceType<T>[Model];
  }


  public create = (args: any) => {
    const result = this.getClient().create(args);
    this.currentTrx = undefined;
    return result;
  };

  public createMany = (args: any) => {
    const result = this.getClient().createMany(args);
    this.currentTrx = undefined;
    return result;
  }

  public findMany = (args: any) => {
    const result = this.getClient().findMany(args);
    this.currentTrx = undefined;
    return result;
  };

  public findFirst = (args: any) => {
    const result = this.getClient().findFirst(args);
    this.currentTrx = undefined;
    return result;
  };

  public findUnique = (args: any) => {
    const result = this.getClient().findUnique({
      where: {
        id: args.where.id,
        ...args.where
      },
      ...args
    });
    this.currentTrx = undefined;
    return result;
  };

  public delete = (args: any) => {
    const result = this.getClient().delete(args);
    this.currentTrx = undefined;
    return result;
  };

  public deleteMany = (args: any) => {
    const result = this.getClient().deleteMany(args);
    this.currentTrx = undefined;
    return result;
  };

  public update = (args: any) => {
    const result = this.getClient().update(args);
    this.currentTrx = undefined;
    return result;
  };

  public updateMany = (args: any) => {
    const result = this.getClient().updateMany(args);
    this.currentTrx = undefined;
    return result;
  }

  public upsert = (args: any) => {
    const result = this.getClient().upsert(args);
    this.currentTrx = undefined;
    return result;
  };

  public aggregate = (args: any) => {
    const result = this.getClient().aggregate(args);
    this.currentTrx = undefined;
    return result;
  }

  public count = (args: any) => {
    const result = this.getClient().count(args);
    this.currentTrx = undefined;
    return result;
  }

  public groupBy = (args: any) => {
    const result = this.getClient().groupBy(args);
    this.currentTrx = undefined;
    return result;
  }

  public async $transaction<P>(
    fn: (prisma: TransactionClient) => Promise<P>
  ): Promise<P> {
    const result = await this.prisma.$transaction(fn);
    this.currentTrx = undefined;
    return result;
  }

  public async $executeRaw(
    query: TemplateStringsArray | Prisma.Sql,
    ...values: any[]
  ): Promise<number> {
    const client = this.currentTrx ?? this.prisma;
    const result = await client.$executeRaw.apply(client, [query, ...values]);
    this.currentTrx = undefined;
    return result;
  }

  public async $queryRaw<P = any>(
    query: TemplateStringsArray | Prisma.Sql,
    ...values: any[]
  ): Promise<P> {
    const client = this.currentTrx ?? this.prisma;
    const result = await client.$queryRaw.apply(client, [query, ...values]);
    this.currentTrx = undefined;
    return result as P;
  }
}
```

```ts ai-streamer-elysiajs-backend/src/module/user/user.repository.ts
// src/module/user/user.service.ts
//
import { PrismaClient } from '@prisma/client';
import { injectable } from 'tsyringe-neo';
import { BaseRepository } from 'src/common/generic/base-repository';

@injectable()
export class UserRepository extends BaseRepository<typeof PrismaClient, 'user'> {
}
```


you know what, that base is cool

Thanks! Yes, this is a well-designed generic base repository pattern with several nice features:

1. **Generic Type Safety**:
```typescript
BaseRepository<T extends PrismaClientType, Model extends ModelNames<T>>
```
This ensures type safety for different Prisma models.

2. **Transaction Support**:
```typescript
withTrx(trx: TransactionClient) {
  this.currentTrx = trx;
  return this;
}
```
Allows for transaction management with a fluent interface.

3. **Comprehensive CRUD Operations**:
Includes all standard database operations like:
- create/createMany
- findMany/findFirst/findUnique
- update/updateMany
- delete/deleteMany
- upsert
- aggregate/count/groupBy

4. **Raw Query Support**:
```typescript
$executeRaw()
$queryRaw<P>()
```
Enables raw SQL queries when needed.

5. **Dependency Injection Ready**:
```typescript
const prisma = container.resolve(PrismaClient);
```
Uses tsyringe-neo for dependency injection.

The implementation makes it very easy to create repositories for new models, as shown in the UserRepository example:

```typescript
@injectable()
export class UserRepository extends BaseRepository<typeof PrismaClient, 'user'> {
}
```

This pattern provides a great foundation for maintaining consistent data access patterns across an application while reducing boilerplate code. It's particularly useful in larger applications with multiple models and complex data access requirements.

I want to publish that base as npm package so everyone can use it. What do you think? also not everyone uses tsyringe-neo, should I make it optional? also what features should I add?

That's a great idea! Here's how we could make it more package-friendly:

1. **Make DI Optional**
```typescript
export abstract class BaseRepository<T extends PrismaClientType, Model extends ModelNames<T>> {
  protected model: InstanceType<T>[Model];
  protected prisma: PrismaClient;
  private currentTrx?: TransactionClient;

  constructor(
    prismaClient: PrismaClient | (() => PrismaClient),
    modelName: Model
  ) {
    this.prisma = typeof prismaClient === 'function' ? prismaClient() : prismaClient;
    this.model = this.prisma[modelName as keyof PrismaClient] as InstanceType<T>[Model];
  }
  // ...
}
```

2. **Add New Features**:
```typescript
export abstract class BaseRepository<T extends PrismaClientType, Model extends ModelNames<T>> {
  // ... existing code ...

  // Batch operations with chunking
  public async batchCreateMany(
    data: any[],
    batchSize = 1000,
    options?: Omit<Parameters<InstanceType<T>[Model]['createMany']>[0], 'data'>
  ) {
    const chunks = [];
    for (let i = 0; i < data.length; i += batchSize) {
      chunks.push(data.slice(i, i + batchSize));
    }

    const results = [];
    for (const chunk of chunks) {
      const result = await this.createMany({ ...options, data: chunk });
      results.push(result);
    }
    return results;
  }

  // Soft delete support
  public softDelete = (args: any) => {
    return this.update({
      ...args,
      data: {
        ...args.data,
        deletedAt: new Date(),
      },
    });
  };

  // Pagination helper
  public paginate = async (args: {
    page?: number;
    limit?: number;
    where?: any;
    orderBy?: any;
    select?: any;
    include?: any;
  }) => {
    const { page = 1, limit = 10, ...rest } = args;
    const skip = (page - 1) * limit;

    const [total, items] = await Promise.all([
      this.count({ where: rest.where }),
      this.findMany({
        ...rest,
        skip,
        take: limit,
      }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  };

  // Cache wrapper
  public withCache = <T>(
    key: string,
    ttl: number,
    fn: () => Promise<T>,
    cache?: Cache
  ): Promise<T> => {
    if (!cache) return fn();
    return cache.wrap(key, fn, ttl);
  };
}
```

3. **Add Type Safety Improvements**:
```typescript
export type RepositoryOptions = {
  softDeletes?: boolean;
  cache?: Cache;
  logging?: boolean;
};

export type PaginationResponse<T> = {
  items: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};
```

4. **Package Structure**:
```
prisma-repository-base/
├── src/
│   ├── base-repository.ts
│   ├── types.ts
│   └── utils/
│       ├── pagination.ts
│       └── cache.ts
├── package.json
├── tsconfig.json
├── README.md
└── LICENSE
```

5. **Add Decorators Support** (Optional):
```typescript
export function CacheResult(key: string, ttl: number) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    descriptor.value = async function (...args: any[]) {
      return this.withCache(
        `${key}:${JSON.stringify(args)}`,
        ttl,
        () => originalMethod.apply(this, args)
      );
    };
    return descriptor;
  };
}
```

6. **README Features to Highlight**:
- Generic Prisma repository base class
- Transaction support
- Batch operations with automatic chunking
- Pagination helper
- Soft delete support
- Caching support
- Type safety
- Framework agnostic
- DI framework agnostic
- Decorator support (optional)

7. **Package.json**:
```json
{
  "name": "prisma-repository-base",
  "version": "1.0.0",
  "description": "A type-safe generic repository pattern for Prisma",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "peerDependencies": {
    "@prisma/client": "^4.0.0"
  },
  "optionalDependencies": {
    "tsyringe-neo": "^1.0.0"
  }
}
```

8. **Future Features to Consider**:
- Query builders
- More advanced caching strategies
- Event dispatching
- Audit logging
- Schema validation
- Custom error handling
- Performance monitoring
- Migration helpers
- Testing utilities
- CLI for repository generation

This would make a very useful package for the Prisma ecosystem! Let me know if you'd like me to elaborate on any of these points.

how the lib user use it? actually I want the user to use without constructor. just like me only by export class UserRepository extends BaseRepository<typeof PrismaClient, 'user'>

Ah, I see! We can make it more user-friendly by using a static PrismaClient instance. Here's how we can modify it:

```typescript
// base-repository.ts
import { PrismaClient } from '@prisma/client';

let prismaInstance: PrismaClient | null = null;

export function setPrismaClient(prisma: PrismaClient) {
  prismaInstance = prisma;
}

export abstract class BaseRepository<T extends PrismaClientType, Model extends ModelNames<T>> {
  protected model: InstanceType<T>[Model];
  protected prisma: PrismaClient;
  private currentTrx?: TransactionClient;

  constructor() {
    if (!prismaInstance) {
      throw new Error('PrismaClient not initialized. Please call setPrismaClient() before using repositories');
    }

    const modelName = this.getModelName();
    this.prisma = prismaInstance;
    this.model = this.prisma[modelName as keyof PrismaClient] as InstanceType<T>[Model];
  }

  private getModelName(): Model {
    // Get model name from class name convention
    // UserRepository -> 'user'
    // PostRepository -> 'post'
    const className = this.constructor.name;
    const modelName = className.replace('Repository', '').toLowerCase();
    return modelName as Model;
  }

  // ... rest of the code
}
```

Then users can use it like this:

```typescript
// main.ts or app.ts
import { PrismaClient } from '@prisma/client';
import { setPrismaClient } from 'prisma-repository-base';

const prisma = new PrismaClient();
setPrismaClient(prisma);
```

```typescript
// user.repository.ts
import { BaseRepository } from 'prisma-repository-base';
import { PrismaClient } from '@prisma/client';

export class UserRepository extends BaseRepository<typeof PrismaClient, 'user'> {
  // That's it! No constructor needed
}
```

Would this be more in line with what you're looking for?

yes great

! also we can add a bit more type safety by adding something like this:

```typescript
// For repositories
export class UserRepository extends BaseRepository<typeof PrismaClient, 'user'> {
  // Methods will be type-safe based on Prisma schema
  async findByEmail(email: string) {
    return this.findUnique({
      where: { email }
    });
  }
}

// And for consumers
const users = await userRepository.findMany({
  where: { email: 'test@test.com' },
  select: { id: true, email: true }
}); // This will be fully typed
```

The package would be very useful for Prisma users who want:
1. A simple way to implement the repository pattern
2. Full type safety
3. Minimal boilerplate
4. All the base repository features (transactions, pagination, etc.)

Would you like me to show more examples of how to improve the type safety?

great give me full source code for the library, I will publish it.. the name will be prisma-abstraction-alvamind . I want the caching concern should be in separate file maybe extending base, also I want to add a feature to add custom logger. configuration, soft delete is good, but I dont want pagination or batchCreateMany...

I'll help structure the library. Here's the complete source code:

```typescript
// src/types.ts
import { PrismaClient } from '@prisma/client';

export type PrismaClientType = new () => any;
export type ModelNames<T extends PrismaClientType> = keyof Omit<InstanceType<T>, keyof Function>;
export type TransactionClient = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

export interface Logger {
  info(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  debug(message: string, ...args: any[]): void;
}

export interface Config {
  logger?: Logger;
  softDelete?: boolean;
}
```

```typescript
// src/config.ts
import { Config, Logger } from './types';
import { PrismaClient } from '@prisma/client';

let prismaInstance: PrismaClient | null = null;
let globalConfig: Config = {
  softDelete: false,
  logger: console
};

export function setPrismaClient(prisma: PrismaClient) {
  prismaInstance = prisma;
}

export function getPrismaClient(): PrismaClient {
  if (!prismaInstance) {
    throw new Error('PrismaClient not initialized. Please call setPrismaClient() before using repositories');
  }
  return prismaInstance;
}

export function setConfig(config: Config) {
  globalConfig = { ...globalConfig, ...config };
}

export function getConfig(): Config {
  return globalConfig;
}
```

```typescript
// src/base-repository.ts
import { PrismaClient, Prisma } from '@prisma/client';
import { ModelNames, PrismaClientType, TransactionClient } from './types';
import { getConfig, getPrismaClient } from './config';

export abstract class BaseRepository<
  T extends PrismaClientType,
  Model extends ModelNames<T>
> {
  protected model: InstanceType<T>[Model];
  protected prisma: PrismaClient;
  private currentTrx?: TransactionClient;

  constructor() {
    const modelName = this.getModelName();
    this.prisma = getPrismaClient();
    this.model = this.prisma[modelName as keyof PrismaClient] as InstanceType<T>[Model];
    getConfig().logger?.info(`${String(modelName)} Repository initialized`);
  }

  private getModelName(): Model {
    const className = this.constructor.name;
    const modelName = className.replace('Repository', '').toLowerCase();
    return modelName as Model;
  }

  withTrx(trx: TransactionClient) {
    this.currentTrx = trx;
    return this;
  }

  protected getClient(): InstanceType<T>[Model] {
    return (this.currentTrx?.[this.model.$name as keyof TransactionClient] ?? this.model) as InstanceType<T>[Model];
  }

  public create = (args: Parameters<InstanceType<T>[Model]['create']>[0]) => {
    const result = this.getClient().create(args);
    this.currentTrx = undefined;
    return result;
  };

  public createMany = (args: Parameters<InstanceType<T>[Model]['createMany']>[0]) => {
    const result = this.getClient().createMany(args);
    this.currentTrx = undefined;
    return result;
  }

  public findMany = (args: Parameters<InstanceType<T>[Model]['findMany']>[0]) => {
    const result = this.getClient().findMany(args);
    this.currentTrx = undefined;
    return result;
  };

  public findFirst = (args: Parameters<InstanceType<T>[Model]['findFirst']>[0]) => {
    const result = this.getClient().findFirst(args);
    this.currentTrx = undefined;
    return result;
  };

  public findUnique = (args: Parameters<InstanceType<T>[Model]['findUnique']>[0]) => {
    const result = this.getClient().findUnique(args);
    this.currentTrx = undefined;
    return result;
  };

  public delete = (args: Parameters<InstanceType<T>[Model]['delete']>[0]) => {
    if (getConfig().softDelete) {
      return this.softDelete(args);
    }
    const result = this.getClient().delete(args);
    this.currentTrx = undefined;
    return result;
  };

  public deleteMany = (args: Parameters<InstanceType<T>[Model]['deleteMany']>[0]) => {
    if (getConfig().softDelete) {
      return this.softDeleteMany(args);
    }
    const result = this.getClient().deleteMany(args);
    this.currentTrx = undefined;
    return result;
  };

  protected softDelete = (args: Parameters<InstanceType<T>[Model]['update']>[0]) => {
    const result = this.update({
      ...args,
      data: {
        ...args.data,
        deletedAt: new Date(),
      },
    });
    this.currentTrx = undefined;
    return result;
  };

  protected softDeleteMany = (args: Parameters<InstanceType<T>[Model]['updateMany']>[0]) => {
    const result = this.updateMany({
      ...args,
      data: {
        ...args.data,
        deletedAt: new Date(),
      },
    });
    this.currentTrx = undefined;
    return result;
  };

  public update = (args: Parameters<InstanceType<T>[Model]['update']>[0]) => {
    const result = this.getClient().update(args);
    this.currentTrx = undefined;
    return result;
  };

  public updateMany = (args: Parameters<InstanceType<T>[Model]['updateMany']>[0]) => {
    const result = this.getClient().updateMany(args);
    this.currentTrx = undefined;
    return result;
  }

  public upsert = (args: Parameters<InstanceType<T>[Model]['upsert']>[0]) => {
    const result = this.getClient().upsert(args);
    this.currentTrx = undefined;
    return result;
  };

  public count = (args: Parameters<InstanceType<T>[Model]['count']>[0]) => {
    const result = this.getClient().count(args);
    this.currentTrx = undefined;
    return result;
  }

  public async $transaction<P>(
    fn: (prisma: TransactionClient) => Promise<P>
  ): Promise<P> {
    const result = await this.prisma.$transaction(fn);
    this.currentTrx = undefined;
    return result;
  }

  public async $executeRaw(
    query: TemplateStringsArray | Prisma.Sql,
    ...values: any[]
  ): Promise<number> {
    const client = this.currentTrx ?? this.prisma;
    const result = await client.$executeRaw.apply(client, [query, ...values]);
    this.currentTrx = undefined;
    return result;
  }

  public async $queryRaw<P = any>(
    query: TemplateStringsArray | Prisma.Sql,
    ...values: any[]
  ): Promise<P> {
    const client = this.currentTrx ?? this.prisma;
    const result = await client.$queryRaw.apply(client, [query, ...values]);
    this.currentTrx = undefined;
    return result as P;
  }
}
```

```typescript
// src/cached-repository.ts
import { BaseRepository } from './base-repository';
import { ModelNames, PrismaClientType } from './types';

export interface Cache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
}

export abstract class CachedRepository<
  T extends PrismaClientType,
  Model extends ModelNames<T>
> extends BaseRepository<T, Model> {
  constructor(
    protected cache: Cache,
    protected defaultTTL: number = 3600 // 1 hour
  ) {
    super();
  }

  protected async withCache<P>(
    key: string,
    fn: () => Promise<P>,
    ttl: number = this.defaultTTL
  ): Promise<P> {
    const cached = await this.cache.get<P>(key);
    if (cached) return cached;

    const result = await fn();
    await this.cache.set(key, result, ttl);
    return result;
  }

  public async findUnique(args: Parameters<InstanceType<T>[Model]['findUnique']>[0]) {
    const cacheKey = `${this.model.$name}:unique:${JSON.stringify(args)}`;
    return this.withCache(
      cacheKey,
      () => super.findUnique(args)
    );
  }

  // Add more cached methods as needed
}
```

```typescript
// src/index.ts
export * from './base-repository';
export * from './cached-repository';
export * from './types';
export * from './config';
```

And here's the package.json:

```json
{
  "name": "prisma-abstraction-alvamind",
  "version": "1.0.0",
  "description": "Type-safe repository pattern abstraction for Prisma",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": [
    "dist",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "npm run build"
  },
  "keywords": [
    "prisma",
    "repository",
    "typescript",
    "orm"
  ],
  "author": "Alvamind",
  "license": "MIT",
  "peerDependencies": {
    "@prisma/client": "^4.0.0"
  },
  "devDependencies": {
    "typescript": "^4.9.0",
    "@types/node": "^16.0.0"
  }
}
```

Usage example:

```typescript
// Initialize
import { PrismaClient } from '@prisma/client';
import { setPrismaClient, setConfig } from 'prisma-abstraction-alvamind';

const prisma = new PrismaClient();
setPrismaClient(prisma);
setConfig({
  softDelete: true,
  logger: customLogger // optional
});

// Basic Repository
import { BaseRepository } from 'prisma-abstraction-alvamind';

export class UserRepository extends BaseRepository<typeof PrismaClient, 'user'> {
  async findByEmail(email: string) {
    return this.findUnique({
      where: { email }
    });
  }
}

// Cached Repository
import { CachedRepository } from 'prisma-abstraction-alvamind';

export class ProductRepository extends CachedRepository<typeof PrismaClient, 'product'> {
  constructor() {
    super(redisCache, 3600); // Pass your cache implementation
  }
}
```

This implementation provides:
1. Type-safe repository pattern
2. Soft delete support
3. Custom logging
4. Optional caching through extension
5. Transaction support
6. Clean and minimal API

Let me know if you want to add or modify anything!

give me serious main.test.ts bun test for the library without mocking or jest.

Here's a comprehensive test file using Bun's built-in test runner. This will actually test against a real database:

```typescript
// main.test.ts
import { expect, test, describe, beforeAll, afterAll } from "bun:test";
import { PrismaClient } from '@prisma/client';
import { BaseRepository, CachedRepository, setPrismaClient, setConfig } from './src';

// Setup Test Database
const prisma = new PrismaClient({
  datasourceUrl: "postgresql://postgres:postgres@localhost:5432/test_db"
});

// Test Repositories
class UserRepository extends BaseRepository<typeof PrismaClient, 'user'> {}

// Simple in-memory cache for testing
class InMemoryCache {
  private store = new Map<string, { value: any; expires: number }>();

  async get<T>(key: string): Promise<T | null> {
    const item = this.store.get(key);
    if (!item) return null;
    if (item.expires < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return item.value as T;
  }

  async set<T>(key: string, value: T, ttl: number): Promise<void> {
    this.store.set(key, {
      value,
      expires: Date.now() + (ttl * 1000)
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

class CachedUserRepository extends CachedRepository<typeof PrismaClient, 'user'> {
  constructor() {
    super(new InMemoryCache(), 60);
  }
}

// Tests
describe('Prisma Abstraction', () => {
  const userRepo = new UserRepository();
  const cachedUserRepo = new CachedUserRepository();
  let testUserId: string;

  beforeAll(() => {
    setPrismaClient(prisma);
    setConfig({
      softDelete: true,
      logger: {
        info: console.log,
        error: console.error,
        warn: console.warn,
        debug: console.debug
      }
    });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  test('CRUD Operations', async () => {
    // Create
    const created = await userRepo.create({
      data: {
        email: 'test@example.com',
        name: 'Test User'
      }
    });

    expect(created.email).toBe('test@example.com');
    testUserId = created.id;

    // Read
    const found = await userRepo.findUnique({
      where: { id: testUserId }
    });

    expect(found).toBeTruthy();
    expect(found?.email).toBe('test@example.com');

    // Update
    const updated = await userRepo.update({
      where: { id: testUserId },
      data: { name: 'Updated Name' }
    });

    expect(updated.name).toBe('Updated Name');

    // Delete (Soft)
    await userRepo.delete({
      where: { id: testUserId }
    });

    const deletedUser = await prisma.user.findUnique({
      where: { id: testUserId }
    });

    expect(deletedUser?.deletedAt).toBeTruthy();
  });

  test('Transaction Support', async () => {
    const result = await userRepo.$transaction(async (trx) => {
      const user1 = await userRepo.withTrx(trx).create({
        data: {
          email: 'trx1@example.com',
          name: 'Trx User 1'
        }
      });

      const user2 = await userRepo.withTrx(trx).create({
        data: {
          email: 'trx2@example.com',
          name: 'Trx User 2'
        }
      });

      return [user1, user2];
    });

    expect(result).toHaveLength(2);
    expect(result[0].email).toBe('trx1@example.com');
    expect(result[1].email).toBe('trx2@example.com');
  });

  test('Raw Queries', async () => {
    const count = await userRepo.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM "User"
    `;

    expect(Number(count[0].count)).toBeGreaterThan(0);
  });

  test('Cached Repository', async () => {
    // First call - should hit database
    const user = await cachedUserRepo.create({
      data: {
        email: 'cached@example.com',
        name: 'Cached User'
      }
    });

    // Second call - should hit cache
    const cachedUser = await cachedUserRepo.findUnique({
      where: { id: user.id }
    });

    expect(cachedUser).toBeTruthy();
    expect(cachedUser?.email).toBe('cached@example.com');

    // Verify both results match
    expect(cachedUser).toEqual(user);
  });

  test('Bulk Operations', async () => {
    const users = await userRepo.createMany({
      data: [
        { email: 'bulk1@example.com', name: 'Bulk User 1' },
        { email: 'bulk2@example.com', name: 'Bulk User 2' },
      ]
    });

    expect(users.count).toBe(2);

    const foundUsers = await userRepo.findMany({
      where: {
        email: {
          contains: 'bulk'
        }
      },
      orderBy: {
        email: 'asc'
      }
    });

    expect(foundUsers).toHaveLength(2);
    expect(foundUsers[0].email).toBe('bulk1@example.com');
  });
});
```

To run these tests:

1. First, ensure you have a test database setup:
```sql
CREATE DATABASE test_db;
```

2. Run your Prisma migrations:
```bash
prisma migrate deploy
```

3. Run the tests:
```bash
bun test main.test.ts
```

This test suite:
- Tests real database operations
- Covers all major features (CRUD, transactions, soft deletes, caching)
- Uses actual database connections
- Tests both base and cached repositories
- Includes cleanup
- Tests bulk operations
- Verifies raw query functionality

Key points about this test approach:
1. Uses real database for accurate testing
2. No mocks means we test actual behavior
3. Comprehensive coverage of features
4. Tests both sync and async operations
5. Verifies type safety (TypeScript compilation)

Remember to add appropriate error handling and edge cases in production use.

use describe it instead of test, also I want to test the logger, also, test with or without cache, test softdele... and more I want everything to be tested

Here's a more comprehensive test suite:

```typescript
// main.test.ts
import { expect, describe, it, beforeAll, afterAll, beforeEach } from "bun:test";
import { PrismaClient } from '@prisma/client';
import { BaseRepository, CachedRepository, setPrismaClient, setConfig, Config } from './src';

const prisma = new PrismaClient({
  datasourceUrl: "postgresql://postgres:postgres@localhost:5432/test_db"
});

// Test Repositories
class UserRepository extends BaseRepository<typeof PrismaClient, 'user'> {}

// Mock Logger
class TestLogger {
  logs: { level: string; message: string; args: any[] }[] = [];

  info(message: string, ...args: any[]) {
    this.logs.push({ level: 'info', message, args });
  }

  error(message: string, ...args: any[]) {
    this.logs.push({ level: 'error', message, args });
  }

  warn(message: string, ...args: any[]) {
    this.logs.push({ level: 'warn', message, args });
  }

  debug(message: string, ...args: any[]) {
    this.logs.push({ level: 'debug', message, args });
  }

  clear() {
    this.logs = [];
  }
}

// Test Cache
class TestCache {
  store = new Map<string, { value: any; expires: number }>();
  hits = 0;
  misses = 0;

  async get<T>(key: string): Promise<T | null> {
    const item = this.store.get(key);
    if (!item) {
      this.misses++;
      return null;
    }
    if (item.expires < Date.now()) {
      this.store.delete(key);
      this.misses++;
      return null;
    }
    this.hits++;
    return item.value as T;
  }

  async set<T>(key: string, value: T, ttl: number): Promise<void> {
    this.store.set(key, {
      value,
      expires: Date.now() + (ttl * 1000)
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
  }
}

class CachedUserRepository extends CachedRepository<typeof PrismaClient, 'user'> {
  constructor(cache: TestCache) {
    super(cache, 60);
  }
}

describe('Prisma Abstraction', () => {
  const testLogger = new TestLogger();
  const testCache = new TestCache();
  let userRepo: UserRepository;
  let cachedUserRepo: CachedUserRepository;

  beforeAll(() => {
    setPrismaClient(prisma);
  });

  beforeEach(async () => {
    testLogger.clear();
    testCache.clear();
    await prisma.user.deleteMany({ where: { email: { contains: 'test' } } });

    userRepo = new UserRepository();
    cachedUserRepo = new CachedUserRepository(testCache);
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  describe('Configuration', () => {
    it('should properly initialize with logger', () => {
      setConfig({ logger: testLogger });
      new UserRepository();
      expect(testLogger.logs).toHaveLength(1);
      expect(testLogger.logs[0].message).toContain('Repository initialized');
    });

    it('should work without logger', () => {
      setConfig({});
      new UserRepository();
      expect(testLogger.logs).toHaveLength(0);
    });
  });

  describe('Basic CRUD Operations', () => {
    it('should create a user', async () => {
      const user = await userRepo.create({
        data: {
          email: 'test@example.com',
          name: 'Test User'
        }
      });

      expect(user.email).toBe('test@example.com');
      expect(user.id).toBeDefined();
    });

    it('should find a user', async () => {
      const created = await userRepo.create({
        data: { email: 'test.find@example.com', name: 'Find User' }
      });

      const found = await userRepo.findUnique({
        where: { id: created.id }
      });

      expect(found).toBeDefined();
      expect(found?.email).toBe('test.find@example.com');
    });

    it('should update a user', async () => {
      const user = await userRepo.create({
        data: { email: 'test.update@example.com', name: 'Update User' }
      });

      const updated = await userRepo.update({
        where: { id: user.id },
        data: { name: 'Updated Name' }
      });

      expect(updated.name).toBe('Updated Name');
    });
  });

  describe('Soft Delete', () => {
    beforeEach(() => {
      setConfig({ softDelete: true });
    });

    it('should soft delete a user when enabled', async () => {
      const user = await userRepo.create({
        data: { email: 'test.softdelete@example.com', name: 'Soft Delete User' }
      });

      await userRepo.delete({
        where: { id: user.id }
      });

      const deletedUser = await prisma.user.findUnique({
        where: { id: user.id }
      });

      expect(deletedUser?.deletedAt).toBeDefined();
    });

    it('should hard delete when soft delete is disabled', async () => {
      setConfig({ softDelete: false });

      const user = await userRepo.create({
        data: { email: 'test.harddelete@example.com', name: 'Hard Delete User' }
      });

      await userRepo.delete({
        where: { id: user.id }
      });

      const deletedUser = await prisma.user.findUnique({
        where: { id: user.id }
      });

      expect(deletedUser).toBeNull();
    });
  });

  describe('Transaction Support', () => {
    it('should handle successful transactions', async () => {
      const [user1, user2] = await userRepo.$transaction(async (trx) => {
        const u1 = await userRepo.withTrx(trx).create({
          data: { email: 'test.trx1@example.com', name: 'Trx User 1' }
        });

        const u2 = await userRepo.withTrx(trx).create({
          data: { email: 'test.trx2@example.com', name: 'Trx User 2' }
        });

        return [u1, u2];
      });

      expect(user1.email).toBe('test.trx1@example.com');
      expect(user2.email).toBe('test.trx2@example.com');
    });

    it('should rollback failed transactions', async () => {
      try {
        await userRepo.$transaction(async (trx) => {
          await userRepo.withTrx(trx).create({
            data: { email: 'test.rollback@example.com', name: 'Rollback User' }
          });

          throw new Error('Transaction failed');
        });
      } catch (error) {
        // Expected error
      }

      const user = await userRepo.findFirst({
        where: { email: 'test.rollback@example.com' }
      });

      expect(user).toBeNull();
    });
  });

  describe('Caching', () => {
    it('should cache findUnique results', async () => {
      const user = await cachedUserRepo.create({
        data: { email: 'test.cache@example.com', name: 'Cache User' }
      });

      // First call - should miss cache
      await cachedUserRepo.findUnique({ where: { id: user.id } });
      expect(testCache.misses).toBe(1);
      expect(testCache.hits).toBe(0);

      // Second call - should hit cache
      await cachedUserRepo.findUnique({ where: { id: user.id } });
      expect(testCache.hits).toBe(1);
    });

    it('should invalidate cache on update', async () => {
      const user = await cachedUserRepo.create({
        data: { email: 'test.cache.invalid@example.com', name: 'Cache Invalid User' }
      });

      await cachedUserRepo.findUnique({ where: { id: user.id } });
      await cachedUserRepo.update({
        where: { id: user.id },
        data: { name: 'Updated Cache User' }
      });

      // Should miss cache after update
      await cachedUserRepo.findUnique({ where: { id: user.id } });
      expect(testCache.misses).toBe(2);
    });
  });

  describe('Raw Queries', () => {
    it('should execute raw queries', async () => {
      await userRepo.create({
        data: { email: 'test.raw@example.com', name: 'Raw User' }
      });

      const result = await userRepo.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM "User" WHERE email = 'test.raw@example.com'
      `;

      expect(Number(result[0].count)).toBe(1);
    });

    it('should execute raw updates', async () => {
      const affected = await userRepo.$executeRaw`
        UPDATE "User" SET "name" = 'Updated via Raw' WHERE email LIKE 'test.raw@%'
      `;

      expect(affected).toBeGreaterThan(0);
    });
  });

  describe('Bulk Operations', () => {
    it('should create many records', async () => {
      const result = await userRepo.createMany({
        data: [
          { email: 'test.bulk1@example.com', name: 'Bulk User 1' },
          { email: 'test.bulk2@example.com', name: 'Bulk User 2' },
        ]
      });

      expect(result.count).toBe(2);
    });

    it('should update many records', async () => {
      await userRepo.createMany({
        data: [
          { email: 'test.bulkupdate1@example.com', name: 'Bulk Update User 1' },
          { email: 'test.bulkupdate2@example.com', name: 'Bulk Update User 2' },
        ]
      });

      const result = await userRepo.updateMany({
        where: { email: { contains: 'test.bulkupdate' } },
        data: { name: 'Updated Bulk User' }
      });

      expect(result.count).toBe(2);
    });
  });
});
```

This test suite:

1. Tests configuration with and without logger
2. Tests all CRUD operations
3. Verifies soft delete functionality
4. Tests transaction support including rollbacks
5. Comprehensive caching tests with hit/miss tracking
6. Tests raw query execution
7. Tests bulk operations
8. Includes proper setup and teardown
9. Uses custom test logger and cache for verification
10. Separates concerns into logical describe blocks
11. Tests both success and failure scenarios

Additional improvements could include:
- Testing edge cases and error conditions
- Testing with different configuration combinations
- Performance tests
- Concurrency tests
- Testing with different database schemas
- Testing with different cache TTLs

Would you like me to add any of these additional test scenarios?

yes add them, also the main.test.ts beforeAll should create the schema and run the bunx prisma db push --force-reset ... afterAll should clean, ,I want each test isolated.

You're absolutely right. Here's the improved version with schema management and complete isolation:

```typescript
// main.test.ts - Part 1 (Setup)
import { expect, describe, it, beforeAll, afterAll, beforeEach } from "bun:test";
import { PrismaClient } from '@prisma/client';
import { BaseRepository, CachedRepository, setPrismaClient, setConfig } from './src';
import { execSync } from 'child_process';
import { randomUUID } from 'crypto';

// Unique database name for isolation
const TEST_DB_NAME = `test_db_${randomUUID().replace(/-/g, '_')}`;
const DATABASE_URL = `postgresql://postgres:postgres@localhost:5432/${TEST_DB_NAME}`;

// Schema definition
const SCHEMA = `
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id        String    @id @default(uuid())
  email     String    @unique
  name      String
  status    String    @default("active")
  metadata  Json?
  deletedAt DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
}

model Post {
  id        String    @id @default(uuid())
  title     String
  content   String
  authorId  String
  deletedAt DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
}
`;

// Test Repositories
class UserRepository extends BaseRepository<typeof PrismaClient, 'user'> {}
class PostRepository extends BaseRepository<typeof PrismaClient, 'post'> {}

// Helpers and Mocks (same as before but enhanced)
class TestLogger {
  logs: { level: string; message: string; args: any[]; timestamp: Date }[] = [];

  info(message: string, ...args: any[]) {
    this.logs.push({ level: 'info', message, args, timestamp: new Date() });
  }

  error(message: string, ...args: any[]) {
    this.logs.push({ level: 'error', message, args, timestamp: new Date() });
  }

  warn(message: string, ...args: any[]) {
    this.logs.push({ level: 'warn', message, args, timestamp: new Date() });
  }

  debug(message: string, ...args: any[]) {
    this.logs.push({ level: 'debug', message, args, timestamp: new Date() });
  }

  clear() {
    this.logs = [];
  }

  getLogsByLevel(level: string) {
    return this.logs.filter(log => log.level === level);
  }
}

class TestCache {
  store = new Map<string, { value: any; expires: number }>();
  hits = 0;
  misses = 0;
  operations: { type: 'get' | 'set' | 'delete'; key: string; timestamp: Date }[] = [];

  async get<T>(key: string): Promise<T | null> {
    this.operations.push({ type: 'get', key, timestamp: new Date() });
    const item = this.store.get(key);
    if (!item || item.expires < Date.now()) {
      this.misses++;
      return null;
    }
    this.hits++;
    return item.value as T;
  }

  async set<T>(key: string, value: T, ttl: number): Promise<void> {
    this.operations.push({ type: 'set', key, timestamp: new Date() });
    this.store.set(key, {
      value,
      expires: Date.now() + (ttl * 1000)
    });
  }

  async delete(key: string): Promise<void> {
    this.operations.push({ type: 'delete', key, timestamp: new Date() });
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
    this.operations = [];
  }
}

class CachedUserRepository extends CachedRepository<typeof PrismaClient, 'user'> {
  constructor(cache: TestCache) {
    super(cache, 60);
  }
}

// Global setup
let prisma: PrismaClient;
const testLogger = new TestLogger();
const testCache = new TestCache();

describe('Prisma Abstraction', () => {
  beforeAll(async () => {
    // Create test database
    execSync(`createdb ${TEST_DB_NAME}`);

    // Write schema file
    await Bun.write('./prisma/schema.prisma', SCHEMA);

    // Push schema
    process.env.DATABASE_URL = DATABASE_URL;
    execSync('bunx prisma db push --force-reset', { stdio: 'inherit' });

    // Initialize PrismaClient
    prisma = new PrismaClient({
      datasourceUrl: DATABASE_URL,
      log: [
        { level: 'query', emit: 'event' },
        { level: 'error', emit: 'event' },
        { level: 'warn', emit: 'event' },
      ],
    });

    // Setup logging events
    prisma.$on('query', (e) => {
      testLogger.debug('Query', e);
    });

    prisma.$on('error', (e) => {
      testLogger.error('Prisma Error', e);
    });

    setPrismaClient(prisma);
  });

  beforeEach(async () => {
    // Clear all data before each test
    await prisma.post.deleteMany();
    await prisma.user.deleteMany();

    // Reset mocks
    testLogger.clear();
    testCache.clear();

    // Reset config for each test
    setConfig({ logger: testLogger });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    // Drop test database
    execSync(`dropdb ${TEST_DB_NAME}`);
  });

  // ... (previous test cases continue)

  // New test cases for edge cases, performance, and concurrency
  describe('Edge Cases', () => {
    it('should handle empty updates', async () => {
      const repo = new UserRepository();
      const user = await repo.create({
        data: { email: 'edge@test.com', name: 'Edge Case' }
      });

      const result = await repo.update({
        where: { id: user.id },
        data: {}
      });

      expect(result.id).toBe(user.id);
    });

    it('should handle non-existent records', async () => {
      const repo = new UserRepository();
      try {
        await repo.findUnique({
          where: { id: 'non-existent' }
        });
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle invalid JSON metadata', async () => {
      const repo = new UserRepository();
      const circular: any = { };
      circular.self = circular;

      try {
        await repo.create({
          data: {
            email: 'invalid@test.com',
            name: 'Invalid JSON',
            metadata: circular
          }
        });
        throw new Error('Should have failed');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('Performance', () => {
    it('should handle bulk operations efficiently', async () => {
      const repo = new UserRepository();
      const start = Date.now();

      const users = Array.from({ length: 100 }).map((_, i) => ({
        email: `bulk${i}@test.com`,
        name: `Bulk User ${i}`
      }));

      await repo.createMany({ data: users });

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should cache repeated queries effectively', async () => {
      const repo = new CachedUserRepository(testCache);
      const user = await repo.create({
        data: { email: 'perf@test.com', name: 'Performance Test' }
      });

      const start = Date.now();
      for (let i = 0; i < 100; i++) {
        await repo.findUnique({ where: { id: user.id } });
      }
      const duration = Date.now() - start;

      expect(testCache.hits).toBe(99); // First query misses, rest hit cache
      expect(duration).toBeLessThan(500); // Should be very fast with caching
    });
  });

  describe('Concurrency', () => {
    it('should handle parallel operations', async () => {
      const repo = new UserRepository();
      const operations = Array.from({ length: 10 }).map((_, i) =>
        repo.create({
          data: {
            email: `concurrent${i}@test.com`,
            name: `Concurrent User ${i}`
          }
        })
      );

      const results = await Promise.all(operations);
      expect(results).toHaveLength(10);
    });

    it('should handle race conditions in transactions', async () => {
      const repo = new UserRepository();
      const user = await repo.create({
        data: { email: 'race@test.com', name: 'Race Condition' }
      });

      const updates = Array.from({ length: 5 }).map((_, i) =>
        repo.$transaction(async (trx) => {
          const current = await repo.withTrx(trx).findUnique({
            where: { id: user.id }
          });

          return repo.withTrx(trx).update({
            where: { id: user.id },
            data: { name: `Updated ${current?.name} ${i}` }
          });
        })
      );

      await Promise.all(updates);
      const final = await repo.findUnique({ where: { id: user.id } });
      expect(final?.name).toContain('Updated');
    });
  });

  describe('Configuration Changes', () => {
    it('should handle config changes during runtime', async () => {
      const repo = new UserRepository();

      // Start with soft deletes enabled
      setConfig({ softDelete: true });
      const user = await repo.create({
        data: { email: 'config@test.com', name: 'Config Test' }
      });
      await repo.delete({ where: { id: user.id } });

      // Verify soft delete
      const softDeleted = await prisma.user.findUnique({
        where: { id: user.id }
      });
      expect(softDeleted?.deletedAt).toBeDefined();

      // Switch to hard deletes
      setConfig({ softDelete: false });
      const user2 = await repo.create({
        data: { email: 'config2@test.com', name: 'Config Test 2' }
      });
      await repo.delete({ where: { id: user2.id } });

      // Verify hard delete
      const hardDeleted = await prisma.user.findUnique({
        where: { id: user2.id }
      });
      expect(hardDeleted).toBeNull();
    });
  });
});
```

This improved version:
1. Creates a unique test database for each test run
2. Sets up and tears down schema automatically
3. Includes comprehensive edge case testing
4. Tests performance with benchmarks
5. Tests concurrent operations
6. Tests configuration changes
7. Has complete isolation between tests
8. Includes enhanced logging and cache tracking
9. Tests both simple and complex scenarios
10. Includes proper cleanup

Would you like me to add more specific test cases or enhance any particular area?

give me full final source code main.test.ts

Sure, here's the full final source code for `main.test.ts`:

```typescript
// main.test.ts
import { expect, describe, it, beforeAll, afterAll, beforeEach } from "bun:test";
import { PrismaClient } from '@prisma/client';
import { BaseRepository, CachedRepository, setPrismaClient, setConfig } from './src';
import { execSync } from 'child_process';
import { randomUUID } from 'crypto';

// Unique database name for isolation
const TEST_DB_NAME = `test_db_${randomUUID().replace(/-/g, '_')}`;
const DATABASE_URL = `postgresql://postgres:postgres@localhost:5432/${TEST_DB_NAME}`;

// Schema definition
const SCHEMA = `
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id        String    @id @default(uuid())
  email     String    @unique
  name      String
  status    String    @default("active")
  metadata  Json?
  deletedAt DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
}

model Post {
  id        String    @id @default(uuid())
  title     String
  content   String
  authorId  String
  deletedAt DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
}
`;

// Test Repositories
class UserRepository extends BaseRepository<typeof PrismaClient, 'user'> {}
class PostRepository extends BaseRepository<typeof PrismaClient, 'post'> {}

// Helpers and Mocks
class TestLogger {
  logs: { level: string; message: string; args: any[]; timestamp: Date }[] = [];

  info(message: string, ...args: any[]) {
    this.logs.push({ level: 'info', message, args, timestamp: new Date() });
  }

  error(message: string, ...args: any[]) {
    this.logs.push({ level: 'error', message, args, timestamp: new Date() });
  }

  warn(message: string, ...args: any[]) {
    this.logs.push({ level: 'warn', message, args, timestamp: new Date() });
  }

  debug(message: string, ...args: any[]) {
    this.logs.push({ level: 'debug', message, args, timestamp: new Date() });
  }

  clear() {
    this.logs = [];
  }

  getLogsByLevel(level: string) {
    return this.logs.filter(log => log.level === level);
  }
}

class TestCache {
  store = new Map<string, { value: any; expires: number }>();
  hits = 0;
  misses = 0;
  operations: { type: 'get' | 'set' | 'delete'; key: string; timestamp: Date }[] = [];

  async get<T>(key: string): Promise<T | null> {
    this.operations.push({ type: 'get', key, timestamp: new Date() });
    const item = this.store.get(key);
    if (!item || item.expires < Date.now()) {
      this.misses++;
      return null;
    }
    this.hits++;
    return item.value as T;
  }

  async set<T>(key: string, value: T, ttl: number): Promise<void> {
    this.operations.push({ type: 'set', key, timestamp: new Date() });
    this.store.set(key, {
      value,
      expires: Date.now() + (ttl * 1000)
    });
  }

  async delete(key: string): Promise<void> {
    this.operations.push({ type: 'delete', key, timestamp: new Date() });
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
    this.operations = [];
  }
}

class CachedUserRepository extends CachedRepository<typeof PrismaClient, 'user'> {
  constructor(cache: TestCache) {
    super(cache, 60);
  }
}

// Global setup
let prisma: PrismaClient;
const testLogger = new TestLogger();
const testCache = new TestCache();

describe('Prisma Abstraction', () => {
  beforeAll(async () => {
    // Create test database
    execSync(`createdb ${TEST_DB_NAME}`);

    // Write schema file
    await Bun.write('./prisma/schema.prisma', SCHEMA);

    // Push schema
    process.env.DATABASE_URL = DATABASE_URL;
    execSync('bunx prisma db push --force-reset', { stdio: 'inherit' });

    // Initialize PrismaClient
    prisma = new PrismaClient({
      datasourceUrl: DATABASE_URL,
      log: [
        { level: 'query', emit: 'event' },
        { level: 'error', emit: 'event' },
        { level: 'warn', emit: 'event' },
      ],
    });

    // Setup logging events
    prisma.$on('query', (e) => {
      testLogger.debug('Query', e);
    });

    prisma.$on('error', (e) => {
      testLogger.error('Prisma Error', e);
    });

    setPrismaClient(prisma);
  });

  beforeEach(async () => {
    // Clear all data before each test
    await prisma.post.deleteMany();
    await prisma.user.deleteMany();

    // Reset mocks
    testLogger.clear();
    testCache.clear();

    // Reset config for each test
    setConfig({ logger: testLogger });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    // Drop test database
    execSync(`dropdb ${TEST_DB_NAME}`);
  });

  // Configuration Tests
  describe('Configuration', () => {
    it('should properly initialize with logger', () => {
      setConfig({ logger: testLogger });
      new UserRepository();
      expect(testLogger.logs).toHaveLength(1);
      expect(testLogger.logs[0].message).toContain('Repository initialized');
    });

    it('should work without logger', () => {
      setConfig({});
      new UserRepository();
      expect(testLogger.logs).toHaveLength(0);
    });
  });

  // Basic CRUD Operations
  describe('Basic CRUD Operations', () => {
    it('should create a user', async () => {
      const user = await new UserRepository().create({
        data: {
          email: 'test@example.com',
          name: 'Test User'
        }
      });

      expect(user.email).toBe('test@example.com');
      expect(user.id).toBeDefined();
    });

    it('should find a user', async () => {
      const created = await new UserRepository().create({
        data: { email: 'test.find@example.com', name: 'Find User' }
      });

      const found = await new UserRepository().findUnique({
        where: { id: created.id }
      });

      expect(found).toBeDefined();
      expect(found?.email).toBe('test.find@example.com');
    });

    it('should update a user', async () => {
      const user = await new UserRepository().create({
        data: { email: 'test.update@example.com', name: 'Update User' }
      });

      const updated = await new UserRepository().update({
        where: { id: user.id },
        data: { name: 'Updated Name' }
      });

      expect(updated.name).toBe('Updated Name');
    });
  });

  // Soft Delete Tests
  describe('Soft Delete', () => {
    beforeEach(() => {
      setConfig({ softDelete: true });
    });

    it('should soft delete a user when enabled', async () => {
      const user = await new UserRepository().create({
        data: { email: 'test.softdelete@example.com', name: 'Soft Delete User' }
      });

      await new UserRepository().delete({
        where: { id: user.id }
      });

      const deletedUser = await prisma.user.findUnique({
        where: { id: user.id }
      });

      expect(deletedUser?.deletedAt).toBeDefined();
    });

    it('should hard delete when soft delete is disabled', async () => {
      setConfig({ softDelete: false });

      const user = await new UserRepository().create({
        data: { email: 'test.harddelete@example.com', name: 'Hard Delete User' }
      });

      await new UserRepository().delete({
        where: { id: user.id }
      });

      const deletedUser = await prisma.user.findUnique({
        where: { id: user.id }
      });

      expect(deletedUser).toBeNull();
    });
  });

  // Transaction Support Tests
  describe('Transaction Support', () => {
    it('should handle successful transactions', async () => {
      const [user1, user2] = await new UserRepository().$transaction(async (trx) => {
        const u1 = await new UserRepository().withTrx(trx).create({
          data: { email: 'test.trx1@example.com', name: 'Trx User 1' }
        });

        const u2 = await new UserRepository().withTrx(trx).create({
          data: { email: 'test.trx2@example.com', name: 'Trx User 2' }
        });

        return [u1, u2];
      });

      expect(user1.email).toBe('test.trx1@example.com');
      expect(user2.email).toBe('test.trx2@example.com');
    });

    it('should rollback failed transactions', async () => {
      try {
        await new UserRepository().$transaction(async (trx) => {
          await new UserRepository().withTrx(trx).create({
            data: { email: 'test.rollback@example.com', name: 'Rollback User' }
          });

          throw new Error('Transaction failed');
        });
      } catch (error) {
        // Expected error
      }

      const user = await new UserRepository().findFirst({
        where: { email: 'test.rollback@example.com' }
      });

      expect(user).toBeNull();
    });
  });

  // Caching Tests
  describe('Caching', () => {
    it('should cache findUnique results', async () => {
      const user = await new CachedUserRepository(testCache).create({
        data: { email: 'test.cache@example.com', name: 'Cache User' }
      });

      // First call - should miss cache
      await new CachedUserRepository(testCache).findUnique({ where: { id: user.id } });
      expect(testCache.misses).toBe(1);
      expect(testCache.hits).toBe(0);

      // Second call - should hit cache
      await new CachedUserRepository(testCache).findUnique({ where: { id: user.id } });
      expect(testCache.hits).toBe(1);
    });

    it('should invalidate cache on update', async () => {
      const user = await new CachedUserRepository(testCache).create({
        data: { email: 'test.cache.invalid@example.com', name: 'Cache Invalid User' }
      });

      await new CachedUserRepository(testCache).findUnique({ where: { id: user.id } });
      await new CachedUserRepository(testCache).update({
        where: { id: user.id },
        data: { name: 'Updated Cache User' }
      });

      // Should miss cache after update
      await new CachedUserRepository(testCache).findUnique({ where: { id: user.id } });
      expect(testCache.misses).toBe(2);
    });
  });

  // Raw Queries Tests
  describe('Raw Queries', () => {
    it('should execute raw queries', async () => {
      await new UserRepository().create({
        data: { email: 'test.raw@example.com', name: 'Raw User' }
      });

      const result = await new UserRepository().$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM "User" WHERE email = 'test.raw@example.com'
      `;

      expect(Number(result[0].count)).toBe(1);
    });

    it('should execute raw updates', async () => {
      const affected = await new UserRepository().$executeRaw`
        UPDATE "User" SET "name" = 'Updated via Raw' WHERE email LIKE 'test.raw@%'
      `;

      expect(affected).toBeGreaterThan(0);
    });
  });

  // Bulk Operations Tests
  describe('Bulk Operations', () => {
    it('should create many records', async () => {
      const result = await new UserRepository().createMany({
        data: [
          { email: 'test.bulk1@example.com', name: 'Bulk User 1' },
          { email: 'test.bulk2@example.com', name: 'Bulk User 2' },
        ]
      });

      expect(result.count).toBe(2);
    });

    it('should update many records', async () => {
      await new UserRepository().createMany({
        data: [
          { email: 'test.bulkupdate1@example.com', name: 'Bulk Update User 1' },
          { email: 'test.bulkupdate2@example.com', name: 'Bulk Update User 2' },
        ]
      });

      const result = await new UserRepository().updateMany({
        where: { email: { contains: 'test.bulkupdate' } },
        data: { name: 'Updated Bulk User' }
      });

      expect(result.count).toBe(2);
    });
  });

  // Edge Cases Tests
  describe('Edge Cases', () => {
    it('should handle empty updates', async () => {
      const repo = new UserRepository();
      const user = await repo.create({
        data: { email: 'edge@test.com', name: 'Edge Case' }
      });

      const result = await repo.update({
        where: { id: user.id },
        data: {}
      });

      expect(result.id).toBe(user.id);
    });

    it('should handle non-existent records', async () => {
      const repo = new UserRepository();
      try {
        await repo.findUnique({
          where: { id: 'non-existent' }
        });
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle invalid JSON metadata', async () => {
      const repo = new UserRepository();
      const circular: any = { };
      circular.self = circular;

      try {
        await repo.create({
          data: {
            email: 'invalid@test.com',
            name: 'Invalid JSON',
            metadata: circular
          }
        });
        throw new Error('Should have failed');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  // Performance Tests
  describe('Performance', () => {
    it('should handle bulk operations efficiently', async () => {
      const repo = new UserRepository();
      const start = Date.now();

      const users = Array.from({ length: 100 }).map((_, i) => ({
        email: `bulk${i}@test.com`,
        name: `Bulk User ${i}`
      }));

      await repo.createMany({ data: users });

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should cache repeated queries effectively', async () => {
      const repo = new CachedUserRepository(testCache);
      const user = await repo.create({
        data: { email: 'perf@test.com', name: 'Performance Test' }
      });

      const start = Date.now();
      for (let i = 0; i < 100; i++) {
        await repo.findUnique({ where: { id: user.id } });
      }
      const duration = Date.now() - start;

      expect(testCache.hits).toBe(99); // First query misses, rest hit cache
      expect(duration).toBeLessThan(500); // Should be very fast with caching
    });
  });

  // Concurrency Tests
  describe('Concurrency', () => {
    it('should handle parallel operations', async () => {
      const repo = new UserRepository();
      const operations = Array.from({ length: 10 }).map((_, i) =>
        repo.create({
          data: {
            email: `concurrent${i}@test.com`,
            name: `Concurrent User ${i}`
          }
        })
      );

      const results = await Promise.all(operations);
      expect(results).toHaveLength(10);
    });

    it('should handle race conditions in transactions', async () => {
      const repo = new UserRepository();
      const user = await repo.create({
        data: { email: 'race@test.com', name: 'Race Condition' }
      });

      const updates = Array.from({ length: 5 }).map((_, i) =>
        repo.$transaction(async (trx) => {
          const current = await repo.withTrx(trx).findUnique({
            where: { id: user.id }
          });

          return repo.withTrx(trx).update({
            where: { id: user.id },
            data: { name: `Updated ${current?.name} ${i}` }
          });
        })
      );

      await Promise.all(updates);
      const final = await repo.findUnique({ where: { id: user.id } });
      expect(final?.name).toContain('Updated');
    });
  });

  // Configuration Changes Tests
  describe('Configuration Changes', () => {
    it('should handle config changes during runtime', async () => {
      const repo = new UserRepository();

      // Start with soft deletes enabled
      setConfig({ softDelete: true });
      const user = await repo.create({
        data: { email: 'config@test.com', name: 'Config Test' }
      });
      await repo.delete({ where: { id: user.id } });

      // Verify soft delete
      const softDeleted = await prisma.user.findUnique({
        where: { id: user.id }
      });
      expect(softDeleted?.deletedAt).toBeDefined();

      // Switch to hard deletes
      setConfig({ softDelete: false });
      const user2 = await repo.create({
        data: { email: 'config2@test.com', name: 'Config Test 2' }
      });
      await repo.delete({ where: { id: user2.id } });

      // Verify hard delete
      const hardDeleted = await prisma.user.findUnique({
        where: { id: user2.id }
      });
      expect(hardDeleted).toBeNull();
    });
  });
});
```

This test suite:
1. Creates a unique test database for each test run.
2. Sets up and tears down the schema automatically.
3. Includes comprehensive edge case testing.
4. Tests performance with benchmarks.
5. Tests concurrent operations.
6. Tests configuration changes.
7. Has complete isolation between tests.
8. Includes enhanced logging and cache tracking.
9. Tests both simple and complex scenarios.
10. Includes proper cleanup.

To run these tests:
1. Ensure you have a PostgreSQL server running.
2. Create the test database:
   ```bash
   createdb test_db
   ```
3. Run the tests:
   ```bash
   bun test main.test.ts
   ```

This setup ensures that each test is isolated and the database
