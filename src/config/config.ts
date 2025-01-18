// src/config/config.ts
import { PrismaClient } from '@prisma/client';
import { Config, Logger } from '../types';

// Default logger implementation
const defaultLogger: Logger = {
  info: () => { },
  error: console.error,
  warn: console.warn,
  debug: () => { },
};

// Default configuration
const defaultConfig: Config = {
  softDelete: false,
  logger: defaultLogger,
  cacheConfig: {
    defaultCaching: true,
    defaultTTL: 3600,
  },
  transactionOptions: {
    timeout: 5000,
    maxRetries: 3,
  }
};

// Singleton instance management
let prismaInstance: PrismaClient | null = null;
let globalConfig: Config = { ...defaultConfig };
let initialized = false;

/**
 * Initialize or set the PrismaClient instance
 */
export function setPrismaClient(prisma: PrismaClient): PrismaClient {
  if (!prisma) {
    throw new Error(
      'prisma-abstraction-alvamind: Invalid PrismaClient instance'
    );
  }

  if (prismaInstance) {
    globalConfig.logger?.warn(
      'prisma-abstraction-alvamind: PrismaClient instance is being overwritten'
    );
  }

  prismaInstance = prisma;
  initialized = true;

  globalConfig.logger?.info(
    'prisma-abstraction-alvamind: PrismaClient instance initialized'
  );

  return prisma;
}

/**
 * Get the current PrismaClient instance
 */
export function getPrismaClient(): PrismaClient {
  if (!initialized || !prismaInstance) {
    throw new Error(
      'prisma-abstraction-alvamind: PrismaClient not initialized. ' +
      'Please call setPrismaClient() before using repositories'
    );
  }
  return prismaInstance;
}

/**
 * Set global configuration
 */
export function setConfig(config: Partial<Config>): void {
  // Merge with existing config, handling nested objects
  globalConfig = {
    ...globalConfig,
    ...config,
    // Merge cacheConfig if it exists
    cacheConfig: config.cacheConfig
      ? {
        ...globalConfig.cacheConfig,
        ...config.cacheConfig,
      }
      : globalConfig.cacheConfig,
    // Merge transactionOptions if it exists
    transactionOptions: config.transactionOptions
      ? {
        ...globalConfig.transactionOptions,
        ...config.transactionOptions,
      }
      : globalConfig.transactionOptions,
    logger: config.logger ? { ...defaultLogger, ...config.logger } : globalConfig.logger
  };

  // Validate configuration
  validateConfig(globalConfig);

  globalConfig.logger?.info(
    'prisma-abstraction-alvamind: Configuration updated'
  );
}

/**
 * Get current configuration
 */
export function getConfig(): Config {
  return globalConfig;
}

/**
 * Reset configuration to defaults
 */
export function resetConfig(): void {
  globalConfig = { ...defaultConfig };
  globalConfig.logger?.info(
    'prisma-abstraction-alvamind: Configuration reset to defaults'
  );
}

/**
 * Update specific configuration option
 */
export function updateConfig<K extends keyof Config>(
  key: K,
  value: Config[K]
): void {
  globalConfig[key] = value;
  validateConfig(globalConfig);
  globalConfig.logger?.info(
    `prisma-abstraction-alvamind: Configuration updated for ${key}`
  );
}

/**
 * Validate configuration
 */
function validateConfig(config: Config): void {
  // Validate cache configuration
  if (config.cacheConfig) {
    if (
      config.cacheConfig.defaultTTL !== undefined &&
      (typeof config.cacheConfig.defaultTTL !== 'number' ||
        config.cacheConfig.defaultTTL <= 0)
    ) {
      throw new Error(
        'prisma-abstraction-alvamind: Invalid cache TTL configuration. ' +
        'TTL must be a positive number'
      );
    }
  }

  // Validate transaction options
  if (config.transactionOptions) {
    if (
      config.transactionOptions.timeout !== undefined &&
      (typeof config.transactionOptions.timeout !== 'number' ||
        config.transactionOptions.timeout <= 0)
    ) {
      throw new Error(
        'prisma-abstraction-alvamind: Invalid transaction timeout configuration. ' +
        'Timeout must be a positive number'
      );
    }

    if (
      config.transactionOptions.maxRetries !== undefined &&
      (typeof config.transactionOptions.maxRetries !== 'number' ||
        config.transactionOptions.maxRetries < 0)
    ) {
      throw new Error(
        'prisma-abstraction-alvamind: Invalid transaction maxRetries configuration. ' +
        'MaxRetries must be a non-negative number'
      );
    }
  }
}

/**
 * Get specific configuration value
 */
export function getConfigValue<K extends keyof Config>(key: K): Config[K] {
  return globalConfig[key];
}

/**
 * Check if feature is enabled
 */
export function isFeatureEnabled(feature: keyof Config): boolean {
  return !!globalConfig[feature];
}

/**
 * Get logger instance
 */
export function getLogger(): Logger {
  return globalConfig.logger || defaultLogger;
}

/**
 * Set logger instance
 */
export function setLogger(logger: Partial<Logger>): void {
  globalConfig.logger = {
    ...defaultLogger,
    ...logger,
  };
}

/**
 * Configuration management interface
 */
export const ConfigManager = {
  set: setConfig,
  get: getConfig,
  reset: resetConfig,
  update: updateConfig,
  getValue: getConfigValue,
  isFeatureEnabled,
  getLogger,
  setLogger,
  setPrismaClient,
  getPrismaClient,
};

// Export default instance
export default ConfigManager;
