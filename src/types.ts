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
