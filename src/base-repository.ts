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
      // Add type check to prevent runtime errors
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
    // Remove 'Repository' and 'Cached' from the name
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

  // Add cleanup for transaction reference
  protected getClient(): InstanceType<T>[Model] {
    const client = this.currentTrx?.[this.model.$name as keyof TransactionClient] ?? this.model;
    if (!client) {
      throw new Error('prisma-abstraction-alvamind: Invalid prisma client state');
    }
    return client as InstanceType<T>[Model];
  }

  public async create(args: Parameters<InstanceType<T>[Model]['create']>[0]) {
    const result = await this.getClient().create(args);
    this.currentTrx = undefined;
    return result;
  }

  public async createMany(args: Parameters<InstanceType<T>[Model]['createMany']>[0]) {
    const result = await this.getClient().createMany(args);
    this.currentTrx = undefined;
    return result;
  }

  public async findMany(args: Parameters<InstanceType<T>[Model]['findMany']>[0]) {
    const result = await this.getClient().findMany(args);
    this.currentTrx = undefined;
    return result;
  }

  public async findFirst(args: Parameters<InstanceType<T>[Model]['findFirst']>[0]) {
    const result = await this.getClient().findFirst(args);
    this.currentTrx = undefined;
    return result;
  }

  public findUnique(args: Parameters<InstanceType<T>[Model]['findUnique']>[0]) {
    const client = this.getClient();
    const result = client.findUnique(args);
    this.currentTrx = undefined;
    return result;
  }

  public delete = (args: Parameters<InstanceType<T>[Model]['delete']>[0]) => {
    if (getConfig().softDelete) {
      return this.softDelete(args);
    }
    const result = this.getClient().delete(args);
    this.currentTrx = undefined;
    return result;
  };

  public deleteMany = (args: Parameters<InstanceType<T>[Model]['deleteMany']>[0]) => {
    if (getConfig().softDelete) {
      return this.softDeleteMany(args);
    }
    const result = this.getClient().deleteMany(args);
    this.currentTrx = undefined;
    return result;
  };

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

  public update(args: Parameters<InstanceType<T>[Model]['update']>[0]) {
    const client = this.getClient();
    const result = client.update(args);
    this.currentTrx = undefined;
    return result;
  };

  public updateMany = (args: Parameters<InstanceType<T>[Model]['updateMany']>[0]) => {
    const result = this.getClient().updateMany(args);
    this.currentTrx = undefined;
    return result;
  }

  public upsert = (args: Parameters<InstanceType<T>[Model]['upsert']>[0]) => {
    const result = this.getClient().upsert(args);
    this.currentTrx = undefined;
    return result;
  };

  public count = (args: Parameters<InstanceType<T>[Model]['count']>[0]) => {
    const result = this.getClient().count(args);
    this.currentTrx = undefined;
    return result;
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

      if (timeoutId) clearTimeout(timeoutId);
      this.currentTrx = undefined;
      return result;
    } catch (e) {
      if (timeoutId) clearTimeout(timeoutId);
      this.currentTrx = undefined;
      throw e;
    }
  }

  public async $executeRaw(query: TemplateStringsArray | Sql, ...values: any[]): Promise<number> {
    try {
      if (!query) throw new Error('prisma-abstraction-alvamind: Query is required');
      const client = this.currentTrx ?? this.prisma;
      const result = await client.$executeRaw.apply(client, [query, ...values]);
      this.currentTrx = undefined;
      return result;
    } catch (e) {
      this.currentTrx = undefined;
      throw e;
    }
  }

  public async $queryRaw<P = any>(
    query: TemplateStringsArray | Sql,
    ...values: any[]
  ): Promise<P> {
    const client = this.currentTrx ?? this.prisma;
    const result = await client.$queryRaw.apply(client, [query, ...values]);
    this.currentTrx = undefined;
    return result as P;
  }
}
