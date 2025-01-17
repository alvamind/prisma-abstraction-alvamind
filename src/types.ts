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

// src/types.ts
export interface Cache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<string[]>
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
  cacheConfig?: GlobalCacheConfig & {
    cacheKeySanitizer?: (key: string, args?: any) => string | undefined;
  };
  transactionOptions?: TransactionOptions;
}
export interface Logger {
  info(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  debug(message: string, ...args: any[]): void;
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

export type ModelOperationTypes<T extends PrismaClientType, Model extends ModelNames<T>> = {
  create: ReturnType<InstanceType<T>[Model]['create']>;
  createMany: ReturnType<InstanceType<T>[Model]['createMany']>;
  findMany: ReturnType<InstanceType<T>[Model]['findMany']>;
  findFirst: ReturnType<InstanceType<T>[Model]['findFirst']>;
  findUnique: ReturnType<InstanceType<T>[Model]['findUnique']>;
  update: ReturnType<InstanceType<T>[Model]['update']>;
  updateMany: ReturnType<InstanceType<T>[Model]['updateMany']>;
  delete: ReturnType<InstanceType<T>[Model]['delete']>;
  deleteMany: ReturnType<InstanceType<T>[Model]['deleteMany']>;
  upsert: ReturnType<InstanceType<T>[Model]['upsert']>;
  count: ReturnType<InstanceType<T>[Model]['count']>;
};
