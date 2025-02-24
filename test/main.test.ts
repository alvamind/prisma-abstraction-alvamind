// main.test.ts
import { expect, describe, it, beforeAll, afterAll, beforeEach } from "bun:test";
import { PrismaClient } from '@prisma/client';
import { BaseRepository, CachedRepository, setPrismaClient, setConfig, Cache, CacheError, CacheOperation } from '../src';
import { execSync } from 'child_process';
import { randomUUID } from 'crypto';
import { setTimeout } from 'timers/promises';
import { defaultSanitizeKey } from "../src/utils/utils";

// Unique database name for isolation
const TEST_DB_NAME = `test_db_${randomUUID().replace(/-/g, '_')}`;
const DATABASE_URL = `postgresql://postgres:postgres@localhost:54321/${TEST_DB_NAME}`;

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
class UserRepository extends BaseRepository<typeof PrismaClient, 'user'> { }
// @ts-expect-error - Will be used in future tests
class PostRepository extends BaseRepository<typeof PrismaClient, 'post'> { }

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

class TestCache implements Cache {
  store = new Map<string, { value: any; expires: number }>();
  hits = 0;
  misses = 0;
  operations: CacheOperation[] = [];

  async get<T>(key: string): Promise<T | null> {
    this.operations.push({
      type: 'get',
      key,
      timestamp: new Date()
    });

    const item = this.store.get(key);
    if (!item || (item.expires && item.expires < Date.now())) {
      this.misses++;
      return null;
    }

    this.hits++;
    return item.value as T;
  }

  async set<T>(key: string, value: T, ttl = 3600): Promise<void> {
    this.operations.push({
      type: 'set',
      key,
      timestamp: new Date()
    });

    this.store.set(key, {
      value,
      expires: Date.now() + (ttl * 1000)
    });
  }

  async delete(key: string): Promise<void> {
    this.operations.push({
      type: 'delete',
      key,
      timestamp: new Date()
    });

    if (key.endsWith('*')) {
      const prefix = key.slice(0, -1);
      for (const storeKey of this.store.keys()) {
        if (storeKey.startsWith(prefix)) {
          this.store.delete(storeKey);
        }
      }
    } else {
      this.store.delete(key);
    }
  }

  async clear(): Promise<void> {
    this.operations.push({
      type: 'clear',
      key: '*',
      timestamp: new Date()
    });

    this.store.clear();
    this.hits = 0;
    this.misses = 0;
  }

  async keys(): Promise<string[]> {
    return Array.from(this.store.keys());
  }
}

class CachedUserRepository extends CachedRepository<typeof PrismaClient, 'user'> {
  constructor(cache: TestCache) {
    super(cache); // TTL is optional
  }
}

// Global setup
let prisma: PrismaClient;
const testLogger = new TestLogger();
const testCache = new TestCache();

function execDockerCommand(command: string) {
  return execSync(`docker exec -u postgres postgres-prisma-abstraction ${command}`, {
    stdio: 'inherit',
    env: {
      ...process.env,
      PGUSER: 'postgres',
      PGPASSWORD: 'postgres'
    }
  });
}

async function waitForDatabase() {
  for (let i = 0; i < 30; i++) {
    try {
      execDockerCommand('pg_isready -q');
      return;
    } catch (e) {
      await setTimeout(1000);
    }
  }
  throw new Error('Database connection timeout');
}

async function createTestDatabase() {
  try {
    // Drop existing database if it exists
    execDockerCommand(`psql -c "DROP DATABASE IF EXISTS ${TEST_DB_NAME}"`);

    // Create new database
    execDockerCommand(`psql -c "CREATE DATABASE ${TEST_DB_NAME}"`);
  } catch (e) {
    console.error('Error creating test database:', e);
    throw e;
  }
}

async function dropTestDatabase() {
  try {
    execDockerCommand(`psql -c "DROP DATABASE IF EXISTS ${TEST_DB_NAME}"`);
  } catch (e) {
    console.error('Error dropping test database:', e);
    throw e;
  }
}

describe('Prisma Abstraction', () => {
  beforeAll(async () => {
    // Start Docker container
    execSync('docker compose up -d');

    // Wait for database to be ready
    await waitForDatabase();

    // Create test database
    await createTestDatabase();

    // Write schema file
    await Bun.write('./prisma/schema.prisma', SCHEMA);

    // Set database URL with correct port from docker-compose
    process.env['DATABASE_URL'] = DATABASE_URL;

    // Generate Prisma client
    execSync('bunx prisma generate', {
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL
      }
    });

    // Push schema
    execSync('bunx prisma db push --force-reset', {
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL
      }
    });

    // Initialize PrismaClient with retry logic
    let retries = 5;
    while (retries > 0) {
      try {
        prisma = new PrismaClient({
          datasourceUrl: DATABASE_URL
        });
        await prisma.$connect();
        break;
      } catch (e) {
        retries--;
        if (retries === 0) throw e;
        await setTimeout(1000);
      }
    }

    // @ts-ignore
    prisma.$on('query', (e: any) => {
      testLogger.debug('Query', e);
    });
    // @ts-ignore
    prisma.$on('error', (e: any) => {
      testLogger.error('Prisma Error', e);
    });

    setPrismaClient(prisma); // Initialize abstraction
  });

  beforeEach(async () => {
    try {
      // Clear all data before each test
      await prisma.post.deleteMany({
        where: {}
      }).catch(() => { }); // Ignore if table doesn't exist
      await prisma.user.deleteMany({
        where: {}
      }).catch(() => { }); // Ignore if table doesn't exist

      // Reset mocks
      testLogger.clear();
      testCache.clear();

      // Reset config for each test
      setConfig({ logger: testLogger });
    } catch (e) {
      console.error('Error in test setup:', e);
      throw e;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await dropTestDatabase();
    // Stop Docker container
    execSync('docker compose down');
  });

  // Configuration Tests
  describe('Configuration', () => {
    it('should properly initialize with logger', () => {
      setConfig({ logger: testLogger });
      new UserRepository();

      // Check for initialization log
      const infoLogs = testLogger.getLogsByLevel('info');
      expect(infoLogs).toHaveLength(1);
      expect(infoLogs[0].message).toContain('Repository initialized');
      expect(infoLogs[0].message).toContain('user'); // Check for model name
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
      try {
        const [user1, user2] = await new UserRepository().$transaction(async (trx) => {
          const u1 = await new UserRepository().trx(trx).create({  // Fixed: added 'create'
            data: { email: 'test.trx1@example.com', name: 'Trx User 1' }
          });

          const u2 = await new UserRepository().trx(trx).create({
            data: { email: 'test.trx2@example.com', name: 'Trx User 2' }
          });

          return [u1, u2];
        });
        expect(user1.email).toBe('test.trx1@example.com');
        expect(user2.email).toBe('test.trx2@example.com');
      } catch (e) {
        throw e;
      }
    });

    it('should rollback failed transactions', async () => {
      try {
        await new UserRepository().$transaction(async (trx) => {
          await new UserRepository().trx(trx).create({
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
    let repo: CachedUserRepository;

    beforeEach(() => {
      repo = new CachedUserRepository(testCache);
      testCache.clear();
    });



    // Read Operation Tests
    describe('Cache Read Operations', () => {
      it('should cache findUnique results', async () => {
        const user = await repo.create({
          data: { email: 'test.cache@example.com', name: 'Cache User' }
        });

        // First call - should miss cache
        await repo.findUnique({ where: { id: user.id } });
        expect(testCache.misses).toBe(1);
        expect(testCache.hits).toBe(0);

        // Second call - should hit cache
        await repo.findUnique({ where: { id: user.id } });
        expect(testCache.hits).toBe(1);
      });

      it('should cache findMany results', async () => {
        // Create test users
        await repo.createMany({
          data: [
            { email: 'cache1@test.com', name: 'Cache User 1' },
            { email: 'cache2@test.com', name: 'Cache User 2' }
          ]
        });

        // First findMany call
        await repo.findMany({ where: { email: { contains: 'cache' } } });
        expect(testCache.misses).toBe(1);

        // Second findMany call with same parameters
        await repo.findMany({ where: { email: { contains: 'cache' } } });
        expect(testCache.hits).toBe(1);
      });

      it('should cache findFirst results', async () => {
        await repo.create({
          data: { email: 'first.cache@test.com', name: 'First Cache User' }
        });

        // First call
        await repo.findFirst({ where: { email: 'first.cache@test.com' } });
        expect(testCache.misses).toBe(1);

        // Second call
        await repo.findFirst({ where: { email: 'first.cache@test.com' } });
        expect(testCache.hits).toBe(1);
      });

      it('should cache count results', async () => {
        await repo.createMany({
          data: [
            { email: 'count1@test.com', name: 'Count User 1' },
            { email: 'count2@test.com', name: 'Count User 2' }
          ]
        });

        // First count
        await repo.count({ where: { email: { contains: 'count' } } });
        expect(testCache.misses).toBe(1);

        // Second count
        await repo.count({ where: { email: { contains: 'count' } } });
        expect(testCache.hits).toBe(1);
      });

      it('should cache queryRaw results', async () => {
        // First raw query
        await repo.$queryRaw`SELECT COUNT(*) FROM "User"`;
        expect(testCache.misses).toBe(1);

        // Second identical raw query
        await repo.$queryRaw`SELECT COUNT(*) FROM "User"`;
        expect(testCache.hits).toBe(1);
      });
    });

    // Cache Invalidation Tests
    describe('Cache Invalidation', () => {
      it('should invalidate cache on create', async () => {
        // Populate cache with initial findMany
        await repo.findMany({});
        testCache.clear();

        // Create new user
        await repo.create({
          data: { email: 'new@test.com', name: 'New User' }
        });

        // Verify cache is invalidated
        await repo.findMany({});
        expect(testCache.misses).toBe(1);
      });

      it('should invalidate cache on createMany', async () => {
        // Initial query to cache
        await repo.findMany({});
        testCache.clear();

        // Bulk create
        await repo.createMany({
          data: [
            { email: 'bulk1@test.com', name: 'Bulk 1' },
            { email: 'bulk2@test.com', name: 'Bulk 2' }
          ]
        });

        // Verify cache invalidation
        await repo.findMany({});
        expect(testCache.misses).toBe(1);
      });

      it('should invalidate cache on update', async () => {
        const user = await repo.create({
          data: { email: 'update@test.com', name: 'Update User' }
        });

        // Cache the user
        await repo.findUnique({ where: { id: user.id } });
        testCache.clear();

        // Update user
        await repo.update({
          where: { id: user.id },
          data: { name: 'Updated Name' }
        });

        // Verify cache invalidation
        await repo.findUnique({ where: { id: user.id } });
        expect(testCache.misses).toBe(1);
      });

      it('should invalidate cache on updateMany', async () => {
        // Initial query to cache
        await repo.findMany({});
        testCache.clear();

        // Bulk update
        await repo.updateMany({
          where: { email: { contains: 'test.com' } },
          data: { status: 'updated' }
        });

        // Verify cache invalidation
        await repo.findMany({});
        expect(testCache.misses).toBe(1);
      });

      it('should invalidate cache on delete', async () => {
        const user = await repo.create({
          data: { email: 'delete@test.com', name: 'Delete User' }
        });

        // Cache the user
        await repo.findUnique({ where: { id: user.id } });
        testCache.clear();

        // Delete user
        await repo.delete({ where: { id: user.id } });

        // Verify cache invalidation
        await repo.findUnique({ where: { id: user.id } });
        expect(testCache.misses).toBe(1);
      });

      it('should invalidate cache on deleteMany', async () => {
        // Initial query to cache
        await repo.findMany({});
        testCache.clear();

        // Bulk delete
        await repo.deleteMany({
          where: { email: { contains: 'test.com' } }
        });

        // Verify cache invalidation
        await repo.findMany({});
        expect(testCache.misses).toBe(1);
      });

      it('should invalidate cache on upsert', async () => {
        // Initial query to cache
        await repo.findMany({});
        testCache.clear();

        // Perform upsert
        await repo.upsert({
          where: { email: 'upsert@test.com' },
          create: { email: 'upsert@test.com', name: 'Upsert User' },
          update: { name: 'Updated Upsert User' }
        });

        // Verify cache invalidation
        await repo.findMany({});
        expect(testCache.misses).toBe(1);
      });

      it('should invalidate cache on executeRaw', async () => {
        // Initial query to cache
        await repo.findMany({});
        testCache.clear();

        // Execute raw query
        await repo.$executeRaw`UPDATE "User" SET "status" = 'active'`;

        // Verify cache invalidation
        await repo.findMany({});
        expect(testCache.misses).toBe(1);
      });
    });

    // Cache Edge Cases
    describe('Cache Edge Cases', () => {
      it('should handle cache errors gracefully', async () => {
        const user = await repo.create({
          data: { email: 'error@test.com', name: 'Error User' }
        });

        // Store original get method
        const originalGet = testCache.get;

        // Override get method to simulate error
        testCache.get = async () => {
          // Restore original method immediately
          testCache.get = originalGet;
          throw new Error('Cache error');
        };

        // Should still return data despite cache error
        const result = await repo.findUnique({ where: { id: user.id } });

        // Type assertion since we know the shape of the result
        const typedResult = result as { id: string, email: string, name: string };

        expect(typedResult).toBeDefined();
        expect(typedResult.id).toBe(user.id);

        // Cleanup - restore original method if not already restored
        testCache.get = originalGet;
      });

      it('should handle null results correctly', async () => {
        // Cache a null result
        await repo.findUnique({ where: { id: 'nonexistent' } });
        testCache.clear();

        // Second attempt should still miss cache
        await repo.findUnique({ where: { id: 'nonexistent' } });
        expect(testCache.misses).toBe(1);
        expect(testCache.hits).toBe(0);
      });
    });

    describe('Cache Flushing', () => {
      let repo: CachedUserRepository;
      let testCache: TestCache;

      beforeEach(() => {
        testCache = new TestCache();
        repo = new CachedUserRepository(testCache);
      });

      it('should flush all cache entries', async () => {
        // Populate cache
        const user = await repo.create({
          data: { email: 'flush@test.com', name: 'Flush Test' }
        });

        await repo.findUnique({ where: { id: user.id } });
        await repo.findMany({});

        expect(testCache.store.size).toBeGreaterThan(0);

        // Flush all
        await repo.flushAll();

        expect(testCache.store.size).toBe(0);
      });

      it('should flush specific operation cache', async () => {
        await testCache.clear();

        // Populate cache with different operations
        const user = await repo.create({
          data: { email: 'flush-op@test.com', name: 'Flush Op Test' }
        });

        const user2 = await repo.create({
          data: { email: 'flush-op-2@test.com', name: 'Flush Op Test 2' }
        });

        // Cache findUnique operations
        await repo.findUnique({ where: { id: user.id } });
        await repo.findUnique({ where: { id: user2.id } });

        // Cache findMany operation
        await repo.findMany({});

        const initialKeys = await testCache.keys();
        const findUniqueKeys = initialKeys.filter(k =>
          repo['matchesOperation'](k, 'findUnique')
        );

        // Flush only findUnique operations
        await repo.flushOperation('findUnique');

        const remainingKeys = await testCache.keys();

        // Verify that only findUnique keys were removed
        expect(remainingKeys.length).toBe(initialKeys.length - findUniqueKeys.length);
        expect(remainingKeys.some(k => repo['matchesOperation'](k, 'findunique'))).toBe(false);
      });

      it('should flush exact cache entry', async () => {
        const user = await repo.create({
          data: { email: 'flush-exact@test.com', name: 'Flush Exact Test' }
        });

        const args = { where: { id: user.id } };

        // Cache the findUnique result
        await repo.findUnique(args);

        // Cache another operation
        await repo.findMany({});

        const initialSize = testCache.store.size;

        // Flush exact cache entry
        await repo.flushExact('findUnique', args);

        // Should have removed only the specific cache entry
        expect(testCache.store.size).toBe(initialSize - 1);

        // The specific cache key should not exist
        const specificKey = repo['getCacheKey']('findUnique', args);
        expect(testCache.store.has(specificKey)).toBe(false);
      });

      it('should handle flush errors gracefully', async () => {
        const errorCache: TestCache = {
          ...testCache,
          get: testCache.get,
          set: testCache.set,
          delete: testCache.delete,
          clear: async () => { throw new Error('Clear failed'); },
          keys: async () => { return [] } // Add the keys method here
        };

        const errorRepo = new CachedUserRepository(errorCache);

        expect(errorRepo.flushAll()).rejects.toThrow(CacheError);
      });

      it('should support pattern-based flushing', async () => {
        await repo.flushAll();

        // Create test data and cache results
        await repo.create({
          data: { email: 'pattern@test.com', name: 'Pattern Test' }
        });

        // Cache multiple findMany results
        await repo.findMany({ where: { status: 'active' } });
        await repo.findMany({ where: { status: 'inactive' } });

        // Cache findFirst result
        await repo.findFirst({ where: { email: 'pattern@test.com' } });

        const initialKeys = await testCache.keys();
        const findManyKeys = initialKeys.filter(k =>
          repo['matchesOperation'](k, 'findMany')
        );

        // Use public flushOperation method
        await repo.flushOperation('findMany');

        const remainingKeys = await testCache.keys();

        // Verify that only findMany keys were removed
        expect(remainingKeys.length).toBe(initialKeys.length - findManyKeys.length);
        expect(remainingKeys.some(k => repo['matchesOperation'](k, 'findMany'))).toBe(false);
        expect(remainingKeys.some(k => repo['matchesOperation'](k, 'findFirst'))).toBe(true);
      });
    })

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
      // First create a user to update
      await new UserRepository().create({
        data: { email: 'test.raw@example.com', name: 'Raw User' }
      });

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
      const circular: any = {};
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
          const current = await repo.trx(trx).findUnique({
            where: { id: user.id }
          });

          return repo.trx(trx).update({
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

  describe('Existence Checks', () => {
    it('should correctly check if a record exists', async () => {
      const repo = new UserRepository();
      await repo.create({
        data: { email: 'exists@test.com', name: 'Exists Test' }
      });

      // @ts-ignore
      const exists = await repo.isExist({ email: 'exists@test.com' });
      // @ts-ignore
      const doesntExist = await repo.isExist({ email: 'nonexistent@test.com' });

      expect(exists).toBe(true);
      expect(doesntExist).toBe(false);
    });

    it('should work with complex where conditions', async () => {
      const repo = new UserRepository();
      await repo.create({
        data: {
          email: 'complex@test.com',
          name: 'Complex Test',
          status: 'active'
        }
      });

      // @ts-ignore
      const exists = await repo.isExist({
        AND: [
          { email: 'complex@test.com' },
          { status: 'active' }
        ]
      });

      expect(exists).toBe(true);
    });
  });

  describe('Pagination', () => {
    it('should return paginated results', async () => {
      const repo = new UserRepository();

      // Create test data
      await Promise.all(
        Array.from({ length: 15 }).map((_, i) =>
          repo.create({
            data: {
              email: `page${i}@test.com`,
              name: `Page User ${i}`
            }
          })
        )
      );

      // Test first page
      const firstPage = await repo.findManyWithPagination({
        page: 1,
        pageSize: 10
      });

      expect(firstPage.items).toHaveLength(10);
      expect(firstPage.meta.total).toBe(15);
      expect(firstPage.meta.hasNextPage).toBe(true);
      expect(firstPage.meta.hasPreviousPage).toBe(false);

      // Test last page
      const lastPage = await repo.findManyWithPagination({
        page: 2,
        pageSize: 10
      });

      expect(lastPage.items).toHaveLength(5);
      expect(lastPage.meta.hasNextPage).toBe(false);
      expect(lastPage.meta.hasPreviousPage).toBe(true);
    });

    it('should handle filtering with pagination', async () => {
      const repo = new UserRepository();

      await Promise.all([
        repo.create({ data: { email: 'active1@test.com', name: 'Active 1', status: 'active' } }),
        repo.create({ data: { email: 'active2@test.com', name: 'Active 2', status: 'active' } }),
        repo.create({ data: { email: 'inactive1@test.com', name: 'Inactive 1', status: 'inactive' } }),
      ]);

      const result = await repo.findManyWithPagination({
        // @ts-ignore
        where: { status: 'active' },
        pageSize: 5
      });

      expect(result.items).toHaveLength(2);
      expect(result.meta.total).toBe(2);
    });
  });

  // Restore Operations
  describe('Restore Operations', () => {
    beforeEach(() => {
      setConfig({ softDelete: true });
    });

    it('should restore a soft-deleted record', async () => {
      const repo = new UserRepository();

      // Create and delete a user
      const user = await repo.create({
        data: { email: 'restore@test.com', name: 'Restore Test' }
      });

      await repo.delete({
        where: { id: user.id }
      });

      // Verify soft deletion
      const deletedUser = await prisma.user.findUnique({
        where: { id: user.id }
      });
      expect(deletedUser?.deletedAt).toBeDefined();

      // Restore the user
      const restored = await repo.restoreById(user.id);
      expect(restored.deletedAt).toBeNull();

      // Verify restoration
      const restoredUser = await prisma.user.findUnique({
        where: { id: user.id }
      });
      expect(restoredUser?.deletedAt).toBeNull();
    });

    // In the pagination test
    it('should return paginated results', async () => {
      const repo = new UserRepository();

      // Create test data
      await Promise.all(  // Remove unused variable
        Array.from({ length: 15 }).map((_, i) =>
          repo.create({
            data: {
              email: `page${i}@test.com`,
              name: `Page User ${i}`
            }
          })
        )
      );

      // Rest of the test remains the same
      const firstPage = await repo.findManyWithPagination({
        page: 1,
        pageSize: 10
      });

      expect(firstPage.items).toHaveLength(10);
      expect(firstPage.meta.total).toBe(15);
      expect(firstPage.meta.hasNextPage).toBe(true);
      expect(firstPage.meta.hasPreviousPage).toBe(false);

      // Test last page
      const lastPage = await repo.findManyWithPagination({
        page: 2,
        pageSize: 10
      });

      expect(lastPage.items).toHaveLength(5);
      expect(lastPage.meta.hasNextPage).toBe(false);
      expect(lastPage.meta.hasPreviousPage).toBe(true);
    });;

  });

  describe('Granular Cache Control', () => {
    it('should respect method-level cache options', async () => {
      const repo = new CachedUserRepository(testCache);

      // Create test user
      const user = await repo.create({
        data: { email: 'cache.control@test.com', name: 'Cache Control' }
      });

      // First call with caching disabled
      await repo.cache({ cache: false }).findUnique(
        { where: { id: user.id } }

      );
      expect(testCache.misses).toBe(0); // Should not even attempt to use cache

      // Second call with custom TTL
      await repo
        .cache({ cache: true, ttl: 60 })
        .findUnique(
          { where: { id: user.id } }
        );

      expect(testCache.misses).toBe(1); // Should miss and then cache

      // Third call should hit cache
      await repo.findUnique(
        { where: { id: user.id } }
      );
      expect(testCache.hits).toBe(1);
    });

    it('should respect global cache configuration', async () => {
      // Set global config to disable caching
      setConfig({ cacheConfig: { defaultCaching: false } });

      const repo = new CachedUserRepository(testCache);
      const user = await repo.create({
        data: { email: 'global.config@test.com', name: 'Global Config' }
      });

      // Should not use cache by default
      await repo.findUnique({ where: { id: user.id } });
      expect(testCache.misses).toBe(0);

      // But should still allow override
      await repo.cache({ cache: true }).findUnique(
        { where: { id: user.id } },

      );
      expect(testCache.misses).toBe(1);
    });
  });

  describe('Default Key Sanitization Consistency', () => {
    it('should produce consistent output across multiple calls', () => {
      const input = 'hello.world';

      // Multiple calls should produce same output
      const results = new Set();
      for (let i = 0; i < 1000; i++) {
        results.add(defaultSanitizeKey(input));
      }

      // Should only have one unique result
      expect(results.size).toBe(1);
      expect(results.has('aGVsbG8ud29ybGQ')).toBe(true);
    });

    it('should produce same output for known test cases', () => {
      const testCases = [
        { input: 'hello.world', expected: 'aGVsbG8ud29ybGQ' },
        { input: 'test.123', expected: 'dGVzdC4xMjM' },
        { input: 'foo/bar', expected: 'Zm9vL2Jhcg' },
        { input: 'user-id_123', expected: 'dXNlci1pZF8xMjM' }
      ];

      testCases.forEach(({ input, expected }) => {
        expect(defaultSanitizeKey(input)).toBe(expected);
      });
    });

    // Test with different character encodings
    it('should handle different character encodings consistently', () => {
      const input = 'hello.world';
      const utf8Result = defaultSanitizeKey(input);
      const asciiResult = defaultSanitizeKey(Buffer.from(input, 'ascii').toString());
      // Remove UTF-16 test as it's not relevant for our use case

      expect(utf8Result).toBe('aGVsbG8ud29ybGQ');
      expect(asciiResult).toBe('aGVsbG8ud29ybGQ');
    });;

    // Test consistency of encoding between Buffer and string inputs
    it('should produce consistent results for Buffer and string inputs', () => {
      const stringInput = 'hello.world';
      const bufferInput = Buffer.from('hello.world');

      const stringResult = defaultSanitizeKey(stringInput);
      const bufferResult = defaultSanitizeKey(bufferInput.toString());

      expect(stringResult).toBe(bufferResult);
      expect(stringResult).toBe('aGVsbG8ud29ybGQ');
    });
  })

  describe('Cache Key Sanitization', () => {
    let testCache: TestCache;

    beforeEach(() => {
      testCache = new TestCache();
    });

    it('should sanitize cache keys with custom sanitizer', async () => {
      const customSanitizer = (key: string) =>
        Buffer.from(key.toLowerCase()).toString('base64url');

      setConfig({
        cacheConfig: {
          cacheKeySanitizer: customSanitizer
        }
      });

      const repo = new CachedUserRepository(testCache);
      const user = await repo.create({
        data: { email: 'test@example.com', name: 'Test User' }
      });

      await repo.findUnique({ where: { id: user.id } });

      // Type-safe operation finding
      const operation = [...testCache.operations]
        .reverse()
        .find((op): op is CacheOperation => op.type === 'set');

      expect(operation).toBeDefined();
      const customKey = customSanitizer(`user:findUnique:{"where":{"id":"${user.id}"}}`);
      expect(operation?.key).toBe(customKey);
    });

    it('should sanitize cache keys with default sanitizer', async () => {
      setConfig({}); // Use default sanitizer

      const repo = new CachedUserRepository(testCache);
      const user = await repo.create({
        data: { email: 'test@example.com', name: 'Test User' }
      });

      await repo.findUnique({ where: { id: user.id } });

      const operation = testCache.operations.find(op => op.type === 'set');
      const expectedKey = `user:findUnique:{"where":{"id":"${user.id}"}}`;
      expect(operation?.key).toBe(defaultSanitizeKey(expectedKey));
    });

    it('should not sanitize keys if sanitizer is not provided', async () => {
      setConfig({
        cacheConfig: {
          cacheKeySanitizer: null as any
        }
      });

      const repo = new CachedUserRepository(testCache);
      const user = await repo.create({
        data: { email: 'test@example.com', name: 'Test User' }
      });

      await repo.findUnique({ where: { id: user.id } });

      const operation = testCache.operations.find(op => op.type === 'set');
      const expectedKey = `user:findUnique:{"where":{"id":"${user.id}"}}`;
      expect(operation?.key).toBe(defaultSanitizeKey(expectedKey));
    });

    it('should handle undefined return from custom sanitizer', async () => {
      setConfig({
        cacheConfig: {
          cacheKeySanitizer: () => undefined
        }
      });

      const repo = new CachedUserRepository(testCache);
      const user = await repo.create({
        data: { email: 'test@example.com', name: 'Test User' }
      });

      await repo.findUnique({ where: { id: user.id } });

      const operation = testCache.operations.find(op => op.type === 'set');
      const expectedKey = `user:findUnique:{"where":{"id":"${user.id}"}}`;
      expect(operation?.key).toBe(defaultSanitizeKey(expectedKey));
    });

    it('should produce consistent keys for same operations', async () => {
      const repo = new CachedUserRepository(testCache);
      const user = await repo.create({
        data: { email: 'test@example.com', name: 'Test User' }
      });

      // First operation
      await repo.findUnique({ where: { id: user.id } });
      const firstOperation = testCache.operations.find(op => op.type === 'set');
      const firstKey = firstOperation?.key;
      expect(firstKey).toBeDefined();

      // Clear operations but keep cache
      testCache.operations = [];

      // Second identical operation - should hit cache
      await repo.findUnique({ where: { id: user.id } });
      const secondOperation = testCache.operations.find(op => op.type === 'get');
      const secondKey = secondOperation?.key;
      expect(secondKey).toBeDefined();

      // Keys should match
      if (firstKey && secondKey) {
        expect(firstKey).toBe(secondKey);
      } else {
        throw new Error('Cache keys are undefined');
      }
    });
  })
});
