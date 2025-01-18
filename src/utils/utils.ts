// src/utils/utils.ts
import { AnyRecord, Primitive } from '../types';

/**
 * Cache key sanitization
 */
export function defaultSanitizeKey(key: string): string {
  if (!key) return key;

  // Ensure consistent casing
  key = key.toLowerCase();

  // Convert to base64url format (URL-safe Base64)
  return Buffer.from(key)
    .toString('base64url')
    .replace(/=+$/, ''); // Remove padding
}

/**
 * Type checking utilities
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isArray(value: unknown): value is Array<unknown> {
  return Array.isArray(value);
}

export function isPrimitive(value: unknown): value is Primitive {
  return (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

/**
 * Object manipulation utilities
 */
export function isEmpty(value: unknown): boolean {
  if (!value) return true;
  if (isArray(value)) return value.length === 0;
  if (isObject(value)) return Object.keys(value).length === 0;
  return false;
}

export function deepClone<T>(obj: T): T {
  if (isPrimitive(obj)) return obj;
  if (isArray(obj)) return obj.map(deepClone) as unknown as T;
  if (isObject(obj)) {
    const result: AnyRecord = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        result[key] = deepClone((obj as AnyRecord)[key]);
      }
    }
    return result as T;
  }
  return obj;
}


/**
 * String manipulation utilities
 */
export function camelToSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

export function snakeToCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Cache key utilities
 */
export function createCacheKey(parts: (string | number | boolean | null | undefined)[]): string {
  return defaultSanitizeKey(
    parts
      .map(part => (part === null || part === undefined ? '' : String(part)))
      .filter(Boolean)
      .join(':')
  );
}

export function parseCacheKey(key: string): string {
  try {
    return Buffer.from(key, 'base64url').toString();
  } catch {
    return key;
  }
}

/**
 * Validation utilities
 */
export function validateConfig(config: unknown): boolean {
  if (!isObject(config)) return false;
  return true;
}

/**
 * Error handling utilities
 */
export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

export function getErrorMessage(error: unknown): string {
  if (isError(error)) return error.message;
  if (typeof error === 'string') return error;
  return 'An unknown error occurred';
}

/**
 * Async utilities
 */
export function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms)
  );
}

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  errorMessage?: string
): Promise<T> {
  return Promise.race([
    promise,
    timeout(ms).catch(() => {
      throw new Error(errorMessage || `Operation timed out after ${ms}ms`);
    }),
  ]);
}

/**
 * Retry utilities
 */
export interface RetryOptions {
  maxAttempts?: number;
  backoff?: {
    initial: number;
    factor: number;
    maxDelay: number;
  };
  shouldRetry?: (error: Error) => boolean;
}

export async function retry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    backoff = { initial: 100, factor: 2, maxDelay: 1000 },
    shouldRetry = () => true,
  } = options;

  let lastError: Error | undefined;
  let attempt = 0;

  while (attempt < maxAttempts) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      attempt++;

      if (attempt >= maxAttempts || !shouldRetry(lastError)) {
        throw lastError;
      }

      const delay = Math.min(
        backoff.initial * Math.pow(backoff.factor, attempt - 1),
        backoff.maxDelay
      );

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Model name utilities
 */
export function normalizeModelName(name: string): string {
  return name.toLowerCase();
}

export function getModelNameFromConstructor(constructorString: string): string | null {
  const directRegex = /extends\s+BaseRepository\s*<[^,]*,\s*['"]([\w.]+)['"]\s*>/;
  const cachedRegex = /Repository\s*<[^,]*,\s*['"]([\w.]+)['"]\s*>/;

  const match = constructorString.match(directRegex) || constructorString.match(cachedRegex);
  return match ? match[1].toLowerCase() : null;
}

export function extractModelName(className: string): string {
  return className
    .replace(/Repository$/, '')
    .replace(/^Cached/, '')
    .toLowerCase();
}

/**
 * Transaction utilities
 */
export function isTransactionOperation(operation: string): boolean {
  return operation === '$transaction' || operation.startsWith('$');
}

/**
 * Cache pattern utilities
 */
export function createCachePattern(modelName: string, operation?: string): string {
  if (!operation) {
    return `${normalizeModelName(modelName)}:*`;
  }
  return `${normalizeModelName(modelName)}:${operation.toLowerCase()}:*`;
}

/**
 * Query sanitization
 */
export function sanitizeQuery(query: string): string {
  // Remove multiple whitespaces
  return query.replace(/\s+/g, ' ').trim();
}

export function hashQuery(query: string, params: unknown[] = []): string {
  const normalizedQuery = sanitizeQuery(query);
  const queryWithParams = `${normalizedQuery}:${JSON.stringify(params)}`;
  return defaultSanitizeKey(queryWithParams);
}
