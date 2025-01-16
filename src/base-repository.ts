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
  private currentTrx?: TransactionClient;

  constructor() {
    const modelName = this.getModelName();
    this.prisma = getPrismaClient();
    this.model = this.prisma[modelName as keyof PrismaClient] as InstanceType<T>[Model];
    getConfig().logger?.info(`${String(modelName)} Repository initialized`);
  }

  private getModelName(): Model {
    const className = this.constructor.name;
    const modelName = className.replace('Repository', '').toLowerCase();
    return modelName as Model;
  }

  withTrx(trx: TransactionClient) {
    this.currentTrx = trx;
    return this;
  }

  protected getClient(): InstanceType<T>[Model] {
    return (this.currentTrx?.[this.model.$name as keyof TransactionClient] ?? this.model) as InstanceType<T>[Model];
  }

  public create = (args: Parameters<InstanceType<T>[Model]['create']>[0]) => {
    const result = this.getClient().create(args);
    this.currentTrx = undefined;
    return result;
  };

  public createMany = (args: Parameters<InstanceType<T>[Model]['createMany']>[0]) => {
    const result = this.getClient().createMany(args);
    this.currentTrx = undefined;
    return result;
  }

  public findMany = (args: Parameters<InstanceType<T>[Model]['findMany']>[0]) => {
    const result = this.getClient().findMany(args);
    this.currentTrx = undefined;
    return result;
  };

  public findFirst = (args: Parameters<InstanceType<T>[Model]['findFirst']>[0]) => {
    const result = this.getClient().findFirst(args);
    this.currentTrx = undefined;
    return result;
  };

  public findUnique = (args: Parameters<InstanceType<T>[Model]['findUnique']>[0]) => {
    const result = this.getClient().findUnique(args);
    this.currentTrx = undefined;
    return result;
  };

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

  protected softDelete = (args: any) => {
    const result = this.update({
      where: args.where,
      data: {
        ...(args.data || {}),
        deletedAt: new Date(),
      },
    });
    this.currentTrx = undefined;
    return result;
  };

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

  public update = (args: Parameters<InstanceType<T>[Model]['update']>[0]) => {
    const result = this.getClient().update(args);
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

  public async $transaction<P>(
    fn: (prisma: TransactionClient) => Promise<P>
  ): Promise<P> {
    const result = await this.prisma.$transaction(fn);
    this.currentTrx = undefined;
    return result;
  }

  public async $executeRaw(
    query: TemplateStringsArray | Sql,
    ...values: any[]
  ): Promise<number> {
    const client = this.currentTrx ?? this.prisma;
    const result = await client.$executeRaw.apply(client, [query, ...values]);
    this.currentTrx = undefined;
    return result;
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
