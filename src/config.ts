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
