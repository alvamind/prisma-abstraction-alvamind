# Project: prisma-abstraction-alvamind

## 📁 Dir Structure:
- prisma/
  • schema.prisma
- src/
  • base-repository.ts
  • cached-repository.ts
  • config.ts
  • index.ts
  • types.ts
- test/
  • main.test.ts

- ./
  • docker-compose.yml
  • package.json
  • tsconfig.build.json
  • tsconfig.json
## 🚫 Excludes:
- **/node_modules/**
- **/dist/**
- **/.git/**
- **/generate-source.ts
- **/.zed-settings.json
- **/.vscode/settings.json
- **/package-lock.json
- **/bun.lockb
- **/build/**
- source.md
- **/dist/**
- .gitignore
- bun.lockb
- *md

## 📁 Dir Structure:
- prisma
- src
- test

## 💻 Code:
====================

// docker-compose.yml
version: '3.8'
services:
  postgres-prisma-abstraction:
    container_name: postgres-prisma-abstraction
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: postgres
    ports:
      - '54321:5432'
    command:
      - 'postgres'
      - '-c'
      - 'max_connections=1000'
      - '-c'
      - 'shared_buffers=128MB'
    tmpfs:
      - /var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - test-network
networks:
  test-network:
    driver: bridge

// package.json
{
  "name": "prisma-abstraction-alvamind",
  "version": "1.0.0",
  "description": "Type-safe repository pattern abstraction for Prisma",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "repository": {
    "type": "git",
    "url": "https://github.com/alvamind/prisma-abstraction-alvamind.git"
  },
  "scripts": {
    "format": "prettier --write \"src*.ts\"",
    "lint": "eslint \"src*.ts\" --fix",
    "dev": "bun tsc --watch",
    "compose": "docker compose up -d",
    "commit": "commit",
    "reinstall": "bun clean && bun install",
    "build": "tsc -p tsconfig.build.json",
    "source": "generate-source --exclude=**/dist/**,.gitignore,bun.lockb,*md --output=source.md",
    "clean": "clean",
    "build:tgz": "bun run build && bun pm pack",
    "test": "bun test test/*.test.ts",
    "split-code": "split-code source=combined.md markers=nats-alvamind/ outputDir=./output",
    "publish-npm": "publish-npm patch",
    "db:up": "docker compose up -d",
    "db:down": "docker compose down",
    "test:with-db": "docker compose up -d && bun test && docker compose down"
  },
  "keywords": [
    "prisma",
    "repository",
    "typescript",
    "orm"
  ],
  "author": "alvamind",
  "license": "MIT",
  "dependencies": {
    "@prisma/client": "^6.2.1",
    "alvamind-tools": "^1.0.23",
    "typescript": "^5.7.3"
  },
  "devDependencies": {
    "@types/bun": "^1.1.16",
    "bun-types": "^1.1.43",
    "prisma": "^6.2.1"
  },
  "files": [
    "dist",
    "README.md",
    "LICENSE"
  ],
  "peerDependencies": {
    "typescript": "^5.0.0",
    "@prisma/client": "^6.2.1"
  }
}

// prisma/schema.prisma
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

// src/base-repository.ts
import { PrismaClient } from '@prisma/client';
import { ModelNames, PrismaClientType, TransactionClient } from './types';
import { getConfig, getPrismaClient } from './config';
import { Sql } from '@prisma/client/runtime/library';
export abstract class BaseRepository<
  T extends PrismaClientType,
  Model extends ModelNames<T>
> {
  protected model: InstanceType<T>[Model];
  protected prisma: PrismaClient;
  protected currentTrx?: TransactionClient;
  constructor() {
    try {
      const modelName = this.getModelName();
      this.prisma = getPrismaClient();
      if (!(modelName in this.prisma)) {
        throw new Error(`prisma-abstraction-alvamind: Invalid model name: ${String(modelName)}`);
      }
      this.model = this.prisma[modelName as keyof PrismaClient] as InstanceType<T>[Model];
      getConfig().logger?.info(`${String(modelName)} Repository initialized`);
    } catch (e) {
      getConfig().logger?.error(`prisma-abstraction-alvamind:: Repository initialization failed: ${e}`);
      throw e;
    }
  }
  private getModelName(): Model {
    const className = this.constructor.name;
    const modelName = className
      .replace(/Repository$/, '')
      .replace(/^Cached/, '')
      .toLowerCase();
    return modelName as Model;
  }
  withTrx(trx: TransactionClient) {
    this.currentTrx = trx;
    return this;
  }
  protected getClient(): InstanceType<T>[Model] {
    const client = this.currentTrx?.[this.model.$name as keyof TransactionClient] ?? this.model;
    if (!client) {
      throw new Error('prisma-abstraction-alvamind: Invalid prisma client state');
    }
    return client as InstanceType<T>[Model];
  }
  public async create(args: Parameters<InstanceType<T>[Model]['create']>[0]) {
    try {
      return await this.getClient().create(args);
    } finally {
      this.currentTrx = undefined;
    }
  }
  public async createMany(args: Parameters<InstanceType<T>[Model]['createMany']>[0]) {
    try {
      return await this.getClient().createMany(args);
    } finally {
      this.currentTrx = undefined;
    }
  }
  public async findMany(args: Parameters<InstanceType<T>[Model]['findMany']>[0]) {
    try {
      return await this.getClient().findMany(args);
    } finally {
      this.currentTrx = undefined;
    }
  }
  public async findFirst(args: Parameters<InstanceType<T>[Model]['findFirst']>[0]) {
    try {
      return await this.getClient().findFirst(args);
    } finally {
      this.currentTrx = undefined;
    }
  }
  public async findUnique(args: Parameters<InstanceType<T>[Model]['findUnique']>[0]) {
    try {
      return await this.getClient().findUnique(args);
    } finally {
      this.currentTrx = undefined;
    }
  }
  public async delete(args: Parameters<InstanceType<T>[Model]['delete']>[0]) {
    try {
      if (getConfig().softDelete) {
        return this.softDelete(args);
      }
      return await this.getClient().delete(args);
    } finally {
      this.currentTrx = undefined;
    }
  }
  public async deleteMany(args: Parameters<InstanceType<T>[Model]['deleteMany']>[0]) {
    try {
      if (getConfig().softDelete) {
        return this.softDeleteMany(args);
      }
      return await this.getClient().deleteMany(args);
    } finally {
      this.currentTrx = undefined;
    }
  }
  protected async softDelete(args: any) {
    if (!args?.where) {
      throw new Error('prisma-abstraction-alvamind: Where clause is required for soft delete');
    }
    const result = await this.update({
      where: args.where,
      data: {
        ...(args.data || {}),
        deletedAt: new Date(),
      },
    });
    this.currentTrx = undefined;
    return result;
  }
  protected softDeleteMany = (args: any) => {
    const result = this.updateMany({
      where: args.where,
      data: {
        ...(args.data || {}),
        deletedAt: new Date(),
      },
    });
    this.currentTrx = undefined;
    return result;
  };
  public async update(args: Parameters<InstanceType<T>[Model]['update']>[0]) {
    try {
      return await this.getClient().update(args);
    } finally {
      this.currentTrx = undefined;
    }
  }
  public async updateMany(args: Parameters<InstanceType<T>[Model]['updateMany']>[0]) {
    try {
      return await this.getClient().updateMany(args);
    } finally {
      this.currentTrx = undefined;
    }
  }
  public async upsert(args: Parameters<InstanceType<T>[Model]['upsert']>[0]) {
    try {
      return await this.getClient().upsert(args);
    } finally {
      this.currentTrx = undefined;
    }
  }
  public async count(args: Parameters<InstanceType<T>[Model]['count']>[0]) {
    try {
      return await this.getClient().count(args);
    } finally {
      this.currentTrx = undefined;
    }
  }
  public async $executeRaw(query: TemplateStringsArray | Sql, ...values: any[]): Promise<number> {
    try {
      if (!query) throw new Error('prisma-abstraction-alvamind: Query is required');
      const client = this.currentTrx ?? this.prisma;
      return await client.$executeRaw.apply(client, [query, ...values]);
    } finally {
      this.currentTrx = undefined;
    }
  }
  public async $queryRaw<P = any>(
    query: TemplateStringsArray | Sql,
    ...values: any[]
  ): Promise<P> {
    try {
      const client = this.currentTrx ?? this.prisma;
      return await client.$queryRaw.apply(client, [query, ...values]) as P;
    } finally {
      this.currentTrx = undefined;
    }
  }
  public async $transaction<P>(fn: (prisma: TransactionClient) => Promise<P>, options?: { timeout?: number }): Promise<P> {
    const timeout = options?.timeout ?? 5000;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('prisma-abstraction-alvamind: Transaction timeout')), timeout);
      });
      const result = await Promise.race([
        this.prisma.$transaction(fn),
        timeoutPromise
      ]);
      if (timeoutId) clearTimeout(timeoutId)
      return result;
    } catch (e) {
      throw e
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      this.currentTrx = undefined;
    }
  }
  public async isExist<
    Where extends Parameters<InstanceType<T>[Model]['findFirst']>[0] extends { where?: infer W } ? W : never,
    Select extends Parameters<InstanceType<T>[Model]['findFirst']>[0] extends { select?: infer S } ? S : never
  >(
    where: Where,
    select?: Select
  ): Promise<boolean> {
    const result = await this.getClient().findFirst({
      where,
      select: select ? select : { id: true } as any
    });
    return result !== null;
  }
  public async findManyWithPagination<
    Args extends Parameters<InstanceType<T>[Model]['findMany']>[0] = Parameters<InstanceType<T>[Model]['findMany']>[0]
  >(args: {
    page?: number;
    pageSize?: number;
    where?: Args extends { where?: infer W } ? W : never;
    orderBy?: Args extends { orderBy?: infer O } ? O : never;
    select?: Args extends { select?: infer S } ? S : never;
    include?: Args extends { include?: infer I } ? I : never;
  }) {
    const page = args.page || 1;
    const pageSize = args.pageSize || 10;
    const [total, items] = await Promise.all([
      this.count({ where: args.where }),
      this.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
        where: args.where,
        orderBy: args.orderBy,
        select: args.select,
        include: args.include
      })
    ]);
    this.currentTrx = undefined;
    return {
      items,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
        hasNextPage: page * pageSize < total,
        hasPreviousPage: page > 1
      }
    };
  }
  public async restoreById<
    Args extends Parameters<InstanceType<T>[Model]['update']>[0] = Parameters<InstanceType<T>[Model]['update']>[0]
  >(
    id: string,
    data?: Args extends { data?: infer D } ? Omit<D, 'deletedAt'> : never
  ): Promise<Awaited<ReturnType<InstanceType<T>[Model]['update']>>> {
    if (!getConfig().softDelete) {
      throw new Error('prisma-abstraction-alvamind: Restore operation is only available when softDelete is enabled');
    }
    const result = await this.update({
      where: { id: id as any },
      data: {
        ...data,
        deletedAt: null
      }
    });
    this.currentTrx = undefined;
    return result;
  }
}

// src/cached-repository.ts
import { Sql } from '@prisma/client/runtime/library';
import { BaseRepository } from './base-repository';
import { getConfig } from './config';
import { ModelNames, PrismaClientType, Cache, CacheOptions, CacheError, FlushPattern } from './types';
export abstract class CachedRepository<T extends PrismaClientType, Model extends ModelNames<T>> extends BaseRepository<T, Model> {
  protected defaultTTL: number;
  protected defaultCaching: boolean;
  constructor(
    protected cache: Cache,
    defaultTTL: number = 3600 // 1 hour default
  ) {
    super();
    const config = getConfig();
    this.defaultTTL = config.cacheConfig?.defaultTTL ?? defaultTTL;
    this.defaultCaching = config.cacheConfig?.defaultCaching ?? true;
  }
  protected async cacheRead<P>(
    operation: string,
    args: any,
    callback: () => Promise<P>,
    options?: CacheOptions
  ): Promise<P> {
    const shouldCache = options?.cache ?? this.defaultCaching;
    const ttl = options?.ttl ?? this.defaultTTL;
    if (!shouldCache) {
      return callback();
    }
    const cacheKey = this.getCacheKey(operation, args);
    try {
      const cached = await this.cache.get<P>(cacheKey);
      if (cached) {
        return cached;
      }
      const result = await callback();
      await this.cache.set(cacheKey, result, ttl);
      return result;
    } catch (error) {
      getConfig().logger?.error(`Cache operation failed: ${error}`);
      return callback();
    }
  }
  public override async findUnique(
    args: Parameters<InstanceType<T>[Model]['findUnique']>[0],
    options?: CacheOptions
  ) {
    const result = await this.cacheRead('findUnique', args, () => super.findUnique(args), options);
    return result;
  }
  public override async findMany(
    args: Parameters<InstanceType<T>[Model]['findMany']>[0],
    options?: CacheOptions
  ) {
    const result = await this.cacheRead('findMany', args, () => super.findMany(args), options);
    return result;
  }
  public override async findFirst(
    args: Parameters<InstanceType<T>[Model]['findFirst']>[0],
    options?: CacheOptions
  ) {
    return this.cacheRead('findFirst', args, () => super.findFirst(args), options);
  }
  public override async count(
    args: Parameters<InstanceType<T>[Model]['count']>[0],
    options?: CacheOptions
  ) {
    return this.cacheRead('count', args, () => super.count(args), options);
  }
  public override async $queryRaw<P = any>(
    query: TemplateStringsArray | Sql,
    ...values: any[]
  ): Promise<P> {
    const lastArg = values[values.length - 1];
    const options = lastArg && typeof lastArg === 'object' && 'cache' in lastArg ?
      values.pop() as CacheOptions :
      undefined;
    return this.cacheRead('$queryRaw', { query, values }, () => super.$queryRaw(query, ...values), options);
  }
  protected async invalidateAfterWrite(_operation: string, _args: any): Promise<void> {
    try {
      const modelPrefix = `${this.model.$name}:`;
      await this.cache.delete(`${modelPrefix}*`);
    } catch (error) {
      getConfig().logger?.error(`Cache invalidation failed: ${error}`);
    }
  }
  private getCacheKey(operation: string, args: any): string {
    return `${this.model.$name}:${operation}:${JSON.stringify(args)}`;
  }
  public override async create(
    args: Parameters<InstanceType<T>[Model]['create']>[0]
  ) {
    const result = await super.create(args);
    await this.invalidateAfterWrite('create', args);
    return result;
  }
  public override async createMany(
    args: Parameters<InstanceType<T>[Model]['createMany']>[0]
  ) {
    const result = await super.createMany(args);
    await this.invalidateAfterWrite('createMany', args);
    return result;
  }
  public override async delete(
    args: Parameters<InstanceType<T>[Model]['delete']>[0]
  ) {
    const result = await super.delete(args);
    await this.invalidateAfterWrite('delete', args);
    return result;
  }
  public override async deleteMany(
    args: Parameters<InstanceType<T>[Model]['deleteMany']>[0]
  ) {
    const result = await super.deleteMany(args);
    await this.invalidateAfterWrite('deleteMany', args);
    return result;
  }
  public override async $executeRaw(
    query: TemplateStringsArray | Sql,
    ...values: any[]
  ): Promise<number> {
    const result = await super.$executeRaw(query, ...values);
    await this.invalidateAfterWrite('$executeRaw', { query, values });
    return result;
  }
  public override async update(
    args: Parameters<InstanceType<T>[Model]['update']>[0]
  ) {
    const result = await super.update(args);
    await this.invalidateAfterWrite('update', args);
    return result;
  }
  public override async updateMany(
    args: Parameters<InstanceType<T>[Model]['updateMany']>[0]
  ) {
    const result = await super.updateMany(args);
    await this.invalidateAfterWrite('updateMany', args);
    return result;
  }
  public override async upsert(
    args: Parameters<InstanceType<T>[Model]['upsert']>[0]
  ) {
    const result = await super.upsert(args);
    await this.invalidateAfterWrite('upsert', args);
    return result;
  }
  public async flush(pattern: FlushPattern = 'all'): Promise<void> {
    try {
      if (pattern === 'all') {
        await this.cache.clear();
        return;
      }
      const { operation, args } = pattern;
      if (operation) {
        if (args) {
          const cacheKey = this.getCacheKey(operation, args);
          await this.cache.delete(cacheKey);
        } else {
          const operationPrefix = `${this.model.$name}:${operation}:`;
          await this.cache.delete(`${operationPrefix}*`);
        }
      } else {
        const modelPrefix = `${this.model.$name}:`;
        await this.cache.delete(`${modelPrefix}*`);
      }
    } catch (error) {
      getConfig().logger?.error(`Cache flush failed: ${error}`);
      throw new CacheError('Failed to flush cache', error as Error);
    }
  }
  public async flushAll(): Promise<void> {
    return this.flush('all');
  }
  public async flushOperation(operation: string): Promise<void> {
    return this.flush({ operation });
  }
  public async flushExact(operation: string, args: Record<string, any>): Promise<void> {
    return this.flush({ operation, args });
  }
}

// src/config.ts
import { Config } from './types';
import { PrismaClient } from '@prisma/client';
let prismaInstance: PrismaClient | null = null;
let globalConfig: Config = {
  softDelete: false,
  logger: {
    info: () => { },
    error: () => { },
    warn: () => { },
    debug: () => { },
  },
};
let initialized = false;
export function setPrismaClient(prisma: PrismaClient) {
  if (!prisma) {
    throw new Error('Invalid PrismaClient instance');
  }
  prismaInstance = prisma;
  initialized = true;
}
export function getPrismaClient(): PrismaClient {
  if (!initialized || !prismaInstance) {
    throw new Error(
      'prisma-abstraction-alvamind: PrismaClient not initialized. Please call setPrismaClient() before using repositories'
    );
  }
  return prismaInstance;
}
export function setConfig(config: Config) {
  if (config.softDelete === undefined) {
    config.softDelete = false;
  }
  if (!config.logger) {
    config.logger = {
      info: () => { },
      error: console.error,
      warn: console.warn,
      debug: () => { },
    };
  }
  globalConfig = { ...globalConfig, ...config };
}
export function getConfig(): Config {
  return globalConfig;
}

// src/index.ts
export * from './base-repository';
export * from './cached-repository';
export * from './types';
export * from './config';

// src/types.ts
import { PrismaClient } from '@prisma/client';
export type PrismaClientType = new () => any;
export type ModelNames<T extends PrismaClientType> = keyof Omit<InstanceType<T>, keyof Function>;
export type TransactionClient = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;
export interface CacheOperation {
  type: 'get' | 'set' | 'delete' | 'clear';
  key: string;
  timestamp: Date;
}
export interface Cache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}
export type FlushPattern = {
  operation?: string;
  args?: Record<string, any>;
} | 'all';
export interface CacheOptions {
  cache?: boolean;
  ttl?: number;
}
export interface GlobalCacheConfig {
  defaultCaching?: boolean;
  defaultTTL?: number;
}
export interface Config {
  logger?: Logger;
  softDelete?: boolean;
  cacheConfig?: GlobalCacheConfig;
  transactionOptions?: TransactionOptions;
}
export interface Logger {
  info(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  debug(message: string, ...args: any[]): void;
}
export interface Config {
  logger?: Logger;
  softDelete?: boolean;
  cacheOptions?: {
    ttl: number;
    prefix?: string;
  };
  transactionOptions?: TransactionOptions;
}
export interface TransactionOptions {
  timeout?: number;
  maxRetries?: number;
}
export class RepositoryError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'RepositoryError';
  }
}
export class CacheError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'CacheError';
  }
}

// test/main.test.ts
import { expect, describe, it, beforeAll, afterAll, beforeEach } from "bun:test";
import { PrismaClient } from '@prisma/client';
import { BaseRepository, CachedRepository, setPrismaClient, setConfig, Cache, CacheError, CacheOperation } from '../src';
import { execSync } from 'child_process';
import { randomUUID } from 'crypto';
import { setTimeout } from 'timers/promises';
const TEST_DB_NAME = `test_db_${randomUUID().replace(/-/g, '_')}`;
const DATABASE_URL = `postgresql://postgres:postgres@localhost:54321/${TEST_DB_NAME}`;
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
class UserRepository extends BaseRepository<typeof PrismaClient, 'user'> { }
class PostRepository extends BaseRepository<typeof PrismaClient, 'post'> { }
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
    if (key.endsWith('*')) {
      const prefix = key.slice(0, -1);
      const keysToDelete = Array.from(this.store.keys())
        .filter(storeKey => storeKey.startsWith(prefix));
      keysToDelete.forEach(k => this.store.delete(k));
    } else {
      this.store.delete(key);
    }
  }
  async clear(): Promise<void> {
    this.operations.push({ type: 'clear', key: '*', timestamp: new Date() });
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
  }
}
class CachedUserRepository extends CachedRepository<typeof PrismaClient, 'user'> {
  constructor(cache: TestCache) {
    super(cache); // TTL is optional
  }
}
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
    execDockerCommand(`psql -c "DROP DATABASE IF EXISTS ${TEST_DB_NAME}"`);
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
    execSync('docker compose up -d');
    await waitForDatabase();
    await createTestDatabase();
    await Bun.write('./prisma/schema.prisma', SCHEMA);
    process.env['DATABASE_URL'] = DATABASE_URL;
    execSync('bunx prisma generate', {
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL
      }
    });
    execSync('bunx prisma db push --force-reset', {
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL
      }
    });
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
    prisma.$on('query', (e: any) => {
      testLogger.debug('Query', e);
    });
    prisma.$on('error', (e: any) => {
      testLogger.error('Prisma Error', e);
    });
    setPrismaClient(prisma); // Initialize abstraction
  });
  beforeEach(async () => {
    try {
      await prisma.post.deleteMany({
        where: {}
      }).catch(() => { }); // Ignore if table doesn't exist
      await prisma.user.deleteMany({
        where: {}
      }).catch(() => { }); // Ignore if table doesn't exist
      testLogger.clear();
      testCache.clear();
      setConfig({ logger: testLogger });
    } catch (e) {
      console.error('Error in test setup:', e);
      throw e;
    }
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await dropTestDatabase();
    execSync('docker compose down');
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
  describe('Transaction Support', () => {
    it('should handle successful transactions', async () => {
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
        expect(user1.email).toBe('test.trx1@example.com');
        expect(user2.email).toBe('test.trx2@example.com');
      } catch (e) {
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
      }
      const user = await new UserRepository().findFirst({
        where: { email: 'test.rollback@example.com' }
      });
      expect(user).toBeNull();
    });
  });
  describe('Caching', () => {
    let repo: CachedUserRepository;
    beforeEach(() => {
      repo = new CachedUserRepository(testCache);
      testCache.clear();
    });
    describe('Cache Read Operations', () => {
      it('should cache findUnique results', async () => {
        const user = await repo.create({
          data: { email: 'test.cache@example.com', name: 'Cache User' }
        });
        await repo.findUnique({ where: { id: user.id } });
        expect(testCache.misses).toBe(1);
        expect(testCache.hits).toBe(0);
        await repo.findUnique({ where: { id: user.id } });
        expect(testCache.hits).toBe(1);
      });
      it('should cache findMany results', async () => {
        await repo.createMany({
          data: [
            { email: 'cache1@test.com', name: 'Cache User 1' },
            { email: 'cache2@test.com', name: 'Cache User 2' }
          ]
        });
        await repo.findMany({ where: { email: { contains: 'cache' } } });
        expect(testCache.misses).toBe(1);
        await repo.findMany({ where: { email: { contains: 'cache' } } });
        expect(testCache.hits).toBe(1);
      });
      it('should cache findFirst results', async () => {
        await repo.create({
          data: { email: 'first.cache@test.com', name: 'First Cache User' }
        });
        await repo.findFirst({ where: { email: 'first.cache@test.com' } });
        expect(testCache.misses).toBe(1);
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
        await repo.count({ where: { email: { contains: 'count' } } });
        expect(testCache.misses).toBe(1);
        await repo.count({ where: { email: { contains: 'count' } } });
        expect(testCache.hits).toBe(1);
      });
      it('should cache queryRaw results', async () => {
        await repo.$queryRaw`SELECT COUNT(*) FROM "User"`;
        expect(testCache.misses).toBe(1);
        await repo.$queryRaw`SELECT COUNT(*) FROM "User"`;
        expect(testCache.hits).toBe(1);
      });
    });
    describe('Cache Invalidation', () => {
      it('should invalidate cache on create', async () => {
        await repo.findMany({});
        testCache.clear();
        await repo.create({
          data: { email: 'new@test.com', name: 'New User' }
        });
        await repo.findMany({});
        expect(testCache.misses).toBe(1);
      });
      it('should invalidate cache on createMany', async () => {
        await repo.findMany({});
        testCache.clear();
        await repo.createMany({
          data: [
            { email: 'bulk1@test.com', name: 'Bulk 1' },
            { email: 'bulk2@test.com', name: 'Bulk 2' }
          ]
        });
        await repo.findMany({});
        expect(testCache.misses).toBe(1);
      });
      it('should invalidate cache on update', async () => {
        const user = await repo.create({
          data: { email: 'update@test.com', name: 'Update User' }
        });
        await repo.findUnique({ where: { id: user.id } });
        testCache.clear();
        await repo.update({
          where: { id: user.id },
          data: { name: 'Updated Name' }
        });
        await repo.findUnique({ where: { id: user.id } });
        expect(testCache.misses).toBe(1);
      });
      it('should invalidate cache on updateMany', async () => {
        await repo.findMany({});
        testCache.clear();
        await repo.updateMany({
          where: { email: { contains: 'test.com' } },
          data: { status: 'updated' }
        });
        await repo.findMany({});
        expect(testCache.misses).toBe(1);
      });
      it('should invalidate cache on delete', async () => {
        const user = await repo.create({
          data: { email: 'delete@test.com', name: 'Delete User' }
        });
        await repo.findUnique({ where: { id: user.id } });
        testCache.clear();
        await repo.delete({ where: { id: user.id } });
        await repo.findUnique({ where: { id: user.id } });
        expect(testCache.misses).toBe(1);
      });
      it('should invalidate cache on deleteMany', async () => {
        await repo.findMany({});
        testCache.clear();
        await repo.deleteMany({
          where: { email: { contains: 'test.com' } }
        });
        await repo.findMany({});
        expect(testCache.misses).toBe(1);
      });
      it('should invalidate cache on upsert', async () => {
        await repo.findMany({});
        testCache.clear();
        await repo.upsert({
          where: { email: 'upsert@test.com' },
          create: { email: 'upsert@test.com', name: 'Upsert User' },
          update: { name: 'Updated Upsert User' }
        });
        await repo.findMany({});
        expect(testCache.misses).toBe(1);
      });
      it('should invalidate cache on executeRaw', async () => {
        await repo.findMany({});
        testCache.clear();
        await repo.$executeRaw`UPDATE "User" SET "status" = 'active'`;
        await repo.findMany({});
        expect(testCache.misses).toBe(1);
      });
    });
    describe('Cache Edge Cases', () => {
      it('should handle cache errors gracefully', async () => {
        const user = await repo.create({
          data: { email: 'error@test.com', name: 'Error User' }
        });
        const originalGet = testCache.get;
        testCache.get = async () => {
          testCache.get = originalGet;
          throw new Error('Cache error');
        };
        const result = await repo.findUnique({ where: { id: user.id } });
        const typedResult = result as { id: string, email: string, name: string };
        expect(typedResult).toBeDefined();
        expect(typedResult.id).toBe(user.id);
        testCache.get = originalGet;
      });
      it('should handle null results correctly', async () => {
        await repo.findUnique({ where: { id: 'nonexistent' } });
        testCache.clear();
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
        const user = await repo.create({
          data: { email: 'flush@test.com', name: 'Flush Test' }
        });
        await repo.findUnique({ where: { id: user.id } });
        await repo.findMany({});
        expect(testCache.store.size).toBeGreaterThan(0);
        await repo.flushAll();
        expect(testCache.store.size).toBe(0);
      });
      it('should flush specific operation cache', async () => {
        const user = await repo.create({
          data: { email: 'flush-op@test.com', name: 'Flush Op Test' }
        });
        await repo.findUnique({ where: { id: user.id } });
        await repo.findMany({});
        const initialSize = testCache.store.size;
        await repo.flushOperation('findUnique');
        expect(testCache.store.size).toBeLessThan(initialSize);
        const findManyCacheKey = testCache.operations.find((op: CacheOperation) => op.type === 'set' && op.key.includes('findMany'))?.key;
        expect(testCache.store.has(findManyCacheKey!)).toBe(true);
      });
      it('should flush exact cache entry', async () => {
        const user = await repo.create({
          data: { email: 'flush-exact@test.com', name: 'Flush Exact Test' }
        });
        const args = { where: { id: user.id } };
        await repo.findUnique(args);
        await repo.findMany({});
        const initialSize = testCache.store.size;
        await repo.flushExact('findUnique', args);
        expect(testCache.store.size).toBe(initialSize - 1);
        const specificKey = repo['getCacheKey']('findUnique', args);
        expect(testCache.store.has(specificKey)).toBe(false);
      });
      it('should handle flush errors gracefully', async () => {
        const errorCache: TestCache = {
          ...testCache,
          get: testCache.get,
          set: testCache.set,
          delete: testCache.delete,
          clear: async () => { throw new Error('Clear failed'); }
        };
        const errorRepo = new CachedUserRepository(errorCache);
        expect(errorRepo.flushAll()).rejects.toThrow(CacheError);
      });
      it('should support pattern-based flushing', async () => {
        await repo.flushAll();
        await repo.findMany({ where: { status: 'active' } });
        await repo.findMany({ where: { status: 'inactive' } });
        await repo.findFirst({ where: { email: 'test@example.com' } });
        const initialSize = testCache.store.size;
        expect(initialSize).toBeGreaterThan(0);
        await repo.flush({ operation: 'findMany' });
        expect(testCache.store.size).toBe(initialSize - 2);
        const findFirstCacheKey = testCache.operations
          .find((op: CacheOperation) =>
            op.type === 'set' &&
            op.key.includes('findFirst'))?.key;
        expect(findFirstCacheKey).toBeDefined(); // This will now pass since `findFirst` is called before flush
        expect(testCache.store.has(findFirstCacheKey!)).toBe(true);
        const findManyCacheKey = testCache.operations
          .find((op: CacheOperation) =>
            op.type === 'set' &&
            op.key.includes('findMany'))?.key;
        if (findManyCacheKey) {
          expect(testCache.store.has(findManyCacheKey)).toBe(false);
        }
      });;
    })
  });
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
      await new UserRepository().create({
        data: { email: 'test.raw@example.com', name: 'Raw User' }
      });
      const affected = await new UserRepository().$executeRaw`
            UPDATE "User" SET "name" = 'Updated via Raw' WHERE email LIKE 'test.raw@%'
        `;
      expect(affected).toBeGreaterThan(0);
    });
  });
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
      setConfig({ softDelete: true });
      const user = await repo.create({
        data: { email: 'config@test.com', name: 'Config Test' }
      });
      await repo.delete({ where: { id: user.id } });
      const softDeleted = await prisma.user.findUnique({
        where: { id: user.id }
      });
      expect(softDeleted?.deletedAt).toBeDefined();
      setConfig({ softDelete: false });
      const user2 = await repo.create({
        data: { email: 'config2@test.com', name: 'Config Test 2' }
      });
      await repo.delete({ where: { id: user2.id } });
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
      const exists = await repo.isExist({ email: 'exists@test.com' });
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
      const firstPage = await repo.findManyWithPagination({
        page: 1,
        pageSize: 10
      });
      expect(firstPage.items).toHaveLength(10);
      expect(firstPage.meta.total).toBe(15);
      expect(firstPage.meta.hasNextPage).toBe(true);
      expect(firstPage.meta.hasPreviousPage).toBe(false);
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
        where: { status: 'active' },
        pageSize: 5
      });
      expect(result.items).toHaveLength(2);
      expect(result.meta.total).toBe(2);
    });
  });
  describe('Restore Operations', () => {
    beforeEach(() => {
      setConfig({ softDelete: true });
    });
    it('should restore a soft-deleted record', async () => {
      const repo = new UserRepository();
      const user = await repo.create({
        data: { email: 'restore@test.com', name: 'Restore Test' }
      });
      await repo.delete({
        where: { id: user.id }
      });
      const deletedUser = await prisma.user.findUnique({
        where: { id: user.id }
      });
      expect(deletedUser?.deletedAt).toBeDefined();
      const restored = await repo.restoreById(user.id);
      expect(restored.deletedAt).toBeNull();
      const restoredUser = await prisma.user.findUnique({
        where: { id: user.id }
      });
      expect(restoredUser?.deletedAt).toBeNull();
    });
    it('should return paginated results', async () => {
      const repo = new UserRepository();
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
      const firstPage = await repo.findManyWithPagination({
        page: 1,
        pageSize: 10
      });
      expect(firstPage.items).toHaveLength(10);
      expect(firstPage.meta.total).toBe(15);
      expect(firstPage.meta.hasNextPage).toBe(true);
      expect(firstPage.meta.hasPreviousPage).toBe(false);
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
      const user = await repo.create({
        data: { email: 'cache.control@test.com', name: 'Cache Control' }
      });
      await repo.findUnique(
        { where: { id: user.id } },
        { cache: false }
      );
      expect(testCache.misses).toBe(0); // Should not even attempt to use cache
      await repo.findUnique(
        { where: { id: user.id } },
        { cache: true, ttl: 60 }
      );
      expect(testCache.misses).toBe(1); // Should miss and then cache
      await repo.findUnique(
        { where: { id: user.id } }
      );
      expect(testCache.hits).toBe(1);
    });
    it('should respect global cache configuration', async () => {
      setConfig({ cacheConfig: { defaultCaching: false } });
      const repo = new CachedUserRepository(testCache);
      const user = await repo.create({
        data: { email: 'global.config@test.com', name: 'Global Config' }
      });
      await repo.findUnique({ where: { id: user.id } });
      expect(testCache.misses).toBe(0);
      await repo.findUnique(
        { where: { id: user.id } },
        { cache: true }
      );
      expect(testCache.misses).toBe(1);
    });
  });
});

// tsconfig.build.json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "dist",
    "declaration": true,
    "sourceMap": true,
    "module": "CommonJS",
    "target": "ES2019",
    "moduleResolution": "node",
    "allowImportingTsExtensions": false,
    "esModuleInterop": true
  },
  "include": ["src*"],
  "exclude": ["test", "dist", "node_modules"]
}

// tsconfig.json
{
  "compilerOptions": {
    "lib": ["ESNext"],
    "target": "ESNext",
    "module": "ESNext",
    "moduleDetection": "force",
    "jsx": "react-jsx",
    "allowJs": true,
    "moduleResolution": "bundler",
    "verbatimModuleSyntax": false,
    "strict": true,
    "skipLibCheck": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noPropertyAccessFromIndexSignature": true,
    "noEmit": true
  }
}

