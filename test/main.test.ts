// main.test.ts
import { expect, describe, it, beforeAll, afterAll, beforeEach } from "bun:test";
import { PrismaClient } from '@prisma/client';
import { BaseRepository, CachedRepository, setPrismaClient, setConfig } from '../src';
import { execSync } from 'child_process';
import { randomUUID } from 'crypto';

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
      await new Promise(resolve => setTimeout(resolve, 1000));
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
          datasourceUrl: DATABASE_URL,
          log: [
            { level: 'query', emit: 'event' },
            { level: 'error', emit: 'event' },
            { level: 'warn', emit: 'event' },
          ],
        });
        await prisma.$connect();
        break;
      } catch (e) {
        retries--;
        if (retries === 0) throw e;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Setup logging events
    prisma.$on('query', (e: unknown) => {
      testLogger.debug('Query', e);
    });

    prisma.$on('error', (e: unknown) => {
      testLogger.error('Prisma Error', e);
    });

    setPrismaClient(prisma);
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
      const timeout = setTimeout(() => {
        throw new Error('Transaction timeout');
      }, 5000);

      try {
        const [user1, user2] = await new UserRepository().$transaction(async (trx) => {
          const u1 = await new UserRepository().withTrx(trx).create({
            data: { email: 'test.trx1@example.com', name: 'Trx User 1' }
          });

          const u2 = await new UserRepository().withTrx(trx).create({
            data: { email: 'test.trx2@example.com', name: 'Trx User 2' }
          });

          return [u1, u2];
        });

        clearTimeout(timeout);
        expect(user1.email).toBe('test.trx1@example.com');
        expect(user2.email).toBe('test.trx2@example.com');
      } catch (e) {
        clearTimeout(timeout);
        throw e;
      }
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
