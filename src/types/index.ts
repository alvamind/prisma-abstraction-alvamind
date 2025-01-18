// src/types/index.ts
import { PrismaClient } from '@prisma/client';
import { Sql } from '@prisma/client/runtime/library';

// Prisma Types
export type PrismaClientType = typeof PrismaClient;

export type ModelNames<T extends PrismaClientType> = keyof Omit<
  InstanceType<T>,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export type PrismaModel<T extends PrismaClientType, M extends ModelNames<T>> =
  InstanceType<T>[M];

export type PrismaDelegate<T extends PrismaClientType, M extends ModelNames<T>> =
  InstanceType<T>[M] extends { [K: string]: any }
  ? InstanceType<T>[M]
  : never;

export type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

// Operation Types
export type ModelOperationTypes<T extends PrismaClientType, M extends ModelNames<T>> = {
  create: Awaited<ReturnType<PrismaDelegate<T, M>['create']>>;
  createMany: Awaited<ReturnType<PrismaDelegate<T, M>['createMany']>>;
  findMany: Awaited<ReturnType<PrismaDelegate<T, M>['findMany']>>[];
  findFirst: Awaited<ReturnType<PrismaDelegate<T, M>['findFirst']>> | null;
  findUnique: Awaited<ReturnType<PrismaDelegate<T, M>['findUnique']>> | null;
  update: Awaited<ReturnType<PrismaDelegate<T, M>['update']>>;
  updateMany: Awaited<ReturnType<PrismaDelegate<T, M>['updateMany']>>;
  delete: Awaited<ReturnType<PrismaDelegate<T, M>['delete']>>;
  deleteMany: Awaited<ReturnType<PrismaDelegate<T, M>['deleteMany']>>;
  upsert: Awaited<ReturnType<PrismaDelegate<T, M>['upsert']>>;
  count: number;
};

// Cache Types
export interface Cache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
  operations?: CacheOperation[];
}

export interface CacheOptions {
  cache?: boolean;
  ttl?: number;
}

export interface CacheConfig {
  defaultCaching?: boolean;
  defaultTTL?: number;
  cacheKeySanitizer?: (key: string) => string | undefined;
}

export type CacheOperation = {
  type: 'get' | 'set' | 'delete' | 'clear';
  key: string;
  timestamp: Date;
};

export type FlushPattern =
  | {
    operation?: string;
    args?: Record<string, any>;
  }
  | 'all';

// Logger Types
export interface Logger {
  info(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  debug(message: string, ...args: any[]): void;
}

// Configuration Types
export interface TransactionOptions {
  timeout?: number;
  maxRetries?: number;
  isolationLevel?: 'ReadUncommitted' | 'ReadCommitted' | 'RepeatableRead' | 'Serializable';
}

export interface Config {
  logger?: Logger;
  softDelete?: boolean;
  cacheConfig?: CacheConfig;
  transactionOptions?: TransactionOptions;
}

// Repository Operation Types
export type RepositoryOperation<Args = any, Result = any> = (
  args: Args
) => Promise<Result>;

export interface PaginationOptions {
  page?: number;
  pageSize?: number;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedResult<T> {
  items: T[];
  meta: PaginationMeta;
}

// Query Types
export interface RawQueryOptions {
  timeout?: number;
  transaction?: TransactionClient;
}

export type SqlQuery = TemplateStringsArray | Sql;

// Error Types
export class RepositoryError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'RepositoryError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export class CacheError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'CacheError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export class TransactionError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'TransactionError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

// Utility Types
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends Array<infer U>
  ? Array<DeepPartial<U>>
  : T[P] extends ReadonlyArray<infer U>
  ? ReadonlyArray<DeepPartial<U>>
  : T[P] extends object
  ? DeepPartial<T[P]>
  : T[P];
};

export type RecursivePartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[]
  ? RecursivePartial<U>[]
  : T[P] extends object
  ? RecursivePartial<T[P]>
  : T[P];
};

// Builder Types
export interface RepositoryBuilderConfig<
  T extends PrismaClientType = typeof PrismaClient,
  Model extends ModelNames<T> = ModelNames<T>
> {
  cache?: {
    instance: Cache;
    defaultTTL?: number;
    defaultCaching?: boolean;
    cacheKeySanitizer?: (key: string) => string | undefined;
  };
  softDelete?: boolean;
  logger?: Logger;
  timeout?: number;
}

// Operation Context Types
export interface OperationContext {
  modelName: string;
  operationName: string;
  args: any[];
}

// Generic Types
export type AnyRecord = Record<string, any>;
export type Primitive = string | number | boolean | null | undefined;
