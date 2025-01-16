// src/config.ts
import { Config } from './types';
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
