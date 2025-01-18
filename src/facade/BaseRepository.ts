// src/facade/BaseRepository.ts
import { PrismaClient } from '@prisma/client';
import {
  ModelNames,
  PrismaClientType,
  TransactionClient,
  PrismaDelegate,
  ModelOperationTypes,
  RepositoryError
} from '../types';
import { getConfig, getPrismaClient } from '../config/config';
import { createOperations } from '../core/operations';
import { Sql } from '@prisma/client/runtime/library';

export class BaseRepository<
  T extends PrismaClientType = typeof PrismaClient,
  Model extends ModelNames<T> = ModelNames<T>
> {
  protected model!: PrismaDelegate<T, Model>;
  protected prisma: PrismaClient;
  protected currentTrx?: TransactionClient;
  protected operations!: ReturnType<typeof createOperations<T, Model>>;
  protected modelName: string;

  constructor() {
    try {
      this.prisma = getPrismaClient();
      this.modelName = this.getModelNameFromConstructor();
      this.initializeModel();
      this.initializeOperations();
      getConfig().logger?.info(`Repository initialized for model: ${this.modelName}`);
    } catch (error) {
      getConfig().logger?.error(`Repository initialization failed: ${error}`);
      throw error;
    }
  }

  private initializeModel() {
    const modelKey = this.modelName as keyof typeof this.prisma;
    if (!(modelKey in this.prisma) || typeof this.prisma[modelKey] !== 'object') {
      throw new Error(`Invalid model name "${this.modelName}"`);
    }
    this.model = this.prisma[modelKey] as unknown as PrismaDelegate<T, Model>;
  }

  protected initializeOperations() {
    this.operations = createOperations<T, Model>(
      this.model,
      this.prisma,
      this.modelName,
      this.currentTrx
    );
  }

  private getModelNameFromConstructor(): string {
    const constructorStr = Object.getPrototypeOf(this).constructor.toString();
    const directRegex = /extends\s+BaseRepository\s*<[^,]*,\s*['"]([\w.]+)['"]\s*>/;
    const cachedRegex = /Repository\s*<[^,]*,\s*['"]([\w.]+)['"]\s*>/;

    let match = constructorStr.match(directRegex) || constructorStr.match(cachedRegex);

    if (!match?.[1]) {
      const className = this.constructor.name
        .replace(/Repository$/, '')
        .replace(/^Cached/, '')
        .toLowerCase();

      if (className) {
        match = [null, className];
      } else {
        throw new Error('Could not determine model name');
      }
    }

    return match[1].toLowerCase();
  }

  public trx(trx: TransactionClient): this {
    this.currentTrx = trx;
    this.initializeOperations();
    return this;
  }

  // Core CRUD operations with proper method signatures
  // @ts-ignore - Maintain Prisma's exact method shape
  public create: PrismaDelegate<T, Model>['create'] = async (args) => {
    return this.operations.create(args);
  };

  // @ts-ignore - Maintain Prisma's exact method shape
  public createMany: PrismaDelegate<T, Model>['createMany'] = async (args) => {
    return this.operations.createMany(args);
  };

  // @ts-ignore - Maintain Prisma's exact method shape
  public findMany: PrismaDelegate<T, Model>['findMany'] = async (args) => {
    return this.operations.findMany(args);
  };

  // @ts-ignore - Maintain Prisma's exact method shape
  public findFirst: PrismaDelegate<T, Model>['findFirst'] = async (args) => {
    return this.operations.findFirst(args);
  };

  // @ts-ignore - Maintain Prisma's exact method shape
  public findUnique: PrismaDelegate<T, Model>['findUnique'] = async (args) => {
    return this.operations.findUnique(args);
  };

  // @ts-ignore - Maintain Prisma's exact method shape
  public update: PrismaDelegate<T, Model>['update'] = async (args) => {
    return this.operations.update(args);
  };

  // @ts-ignore - Maintain Prisma's exact method shape
  public updateMany: PrismaDelegate<T, Model>['updateMany'] = async (args) => {
    return this.operations.updateMany(args);
  };

  // @ts-ignore - Maintain Prisma's exact method shape
  public delete: PrismaDelegate<T, Model>['delete'] = async (args) => {
    return this.operations.delete(args);
  };

  // @ts-ignore - Maintain Prisma's exact method shape
  public deleteMany: PrismaDelegate<T, Model>['deleteMany'] = async (args) => {
    return this.operations.deleteMany(args);
  };

  // @ts-ignore - Maintain Prisma's exact method shape
  public upsert: PrismaDelegate<T, Model>['upsert'] = async (args) => {
    return this.operations.upsert(args);
  };

  // @ts-ignore - Maintain Prisma's exact method shape
  public count: PrismaDelegate<T, Model>['count'] = async (args) => {
    return this.operations.count(args);
  };

  // Raw query operations
  public async $executeRaw(query: TemplateStringsArray | Sql, ...values: any[]): Promise<number> {
    try {
      if (!query) throw new Error('Query is required');
      const client = this.currentTrx ?? this.prisma;
      return await client.$executeRaw.apply(client, [query, ...values]);
    } finally {
      this.currentTrx = undefined;
    }
  }

  public async $queryRaw<P = any>(query: TemplateStringsArray | Sql, ...values: any[]): Promise<P> {
    try {
      const client = this.currentTrx ?? this.prisma;
      return await client.$queryRaw.apply(client, [query, ...values]) as P;
    } finally {
      this.currentTrx = undefined;
    }
  }

  // Transaction operation
  public async $transaction<P>(
    fn: (prisma: TransactionClient) => Promise<P>,
    options?: { timeout?: number }
  ): Promise<P> {
    const timeout = options?.timeout ?? getConfig().transactionOptions?.timeout ?? 5000;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Transaction timeout')), timeout);
      });

      const result = await Promise.race([
        this.prisma.$transaction(fn),
        timeoutPromise
      ]);

      if (timeoutId) clearTimeout(timeoutId);
      return result;
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      throw new RepositoryError(
        `Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    } finally {
      this.currentTrx = undefined;
    }
  }

  // Helper methods
  public async isExist<
    Where extends Parameters<PrismaDelegate<T, Model>['findFirst']>[0] extends { where?: infer W } ? W : never,
    Select extends Parameters<PrismaDelegate<T, Model>['findFirst']>[0] extends { select?: infer S } ? S : never
  >(
    where: Where,
    select?: Select
  ): Promise<boolean> {
    const result = await this.findFirst({
      where,
      select: select ? select : { id: true } as any
    });
    return result !== null;
  }

  public async findManyWithPagination<
    Args extends Parameters<PrismaDelegate<T, Model>['findMany']>[0]
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
    Args extends Parameters<PrismaDelegate<T, Model>['update']>[0]
  >(
    id: string,
    data?: Args extends { data?: infer D } ? Omit<D, 'deletedAt'> : never
  ): Promise<ModelOperationTypes<T, Model>['update']> {
    if (!getConfig().softDelete) {
      throw new Error('Restore operation is only available when softDelete is enabled');
    }

    return this.update({
      where: { id: id as any },
      data: {
        ...data,
        deletedAt: null
      }
    });
  }
}
