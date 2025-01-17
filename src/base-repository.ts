// src/base-repository.ts
import { PrismaClient } from '@prisma/client';
import { ModelNames, PrismaClientType, TransactionClient, PrismaDelegate, ModelOperationTypes } from './types';
import { getConfig, getPrismaClient } from './config';
import { Sql } from '@prisma/client/runtime/library';

export class BaseRepository<
  T extends PrismaClientType = typeof PrismaClient,
  Model extends ModelNames<T> = ModelNames<T>
> {
  protected model: PrismaDelegate<T, Model>;
  protected prisma: PrismaClient;
  protected currentTrx?: TransactionClient;

  constructor() {
    try {
      // Get the constructor's name and full definition
      const constructorStr = Object.getPrototypeOf(this).constructor.toString();

      // Two regex patterns: one for direct inheritance and one for cached
      const directRegex = /extends\s+BaseRepository\s*<[^,]*,\s*['"]([\w.]+)['"]\s*>/;
      const cachedRegex = /Repository\s*<[^,]*,\s*['"]([\w.]+)['"]\s*>/;

      let match = constructorStr.match(directRegex) || constructorStr.match(cachedRegex);

      if (!match?.[1]) {
        // Fallback to class name if no generic parameters found
        const className = this.constructor.name
          .replace(/Repository$/, '')
          .replace(/^Cached/, '')
          .toLowerCase();

        if (className) {
          match = [null, className];
        } else {
          throw new Error(
            'prisma-abstraction-alvamind: Could not determine model name. ' +
            'Make sure your repository class properly extends BaseRepository with generic parameters. ' +
            'Example: class UserRepository extends BaseRepository<PrismaClient, \'user\'>'
          );
        }
      }

      const modelName = match[1].toLowerCase();
      this.prisma = getPrismaClient();

      // Validate that the model exists in Prisma client
      const modelKey = modelName as keyof typeof this.prisma;
      if (!(modelKey in this.prisma) || typeof this.prisma[modelKey] !== 'object') {
        throw new Error(
          `prisma-abstraction-alvamind: Invalid model name "${modelName}". ` +
          'Make sure the model name matches your Prisma schema.'
        );
      }

      this.model = this.prisma[modelKey] as unknown as PrismaDelegate<T, Model>;
      getConfig().logger?.info(`prisma-abstraction-alvamind: ${modelName} Repository initialized`);

    } catch (error) {
      getConfig().logger?.error(
        `prisma-abstraction-alvamind: Repository initialization failed: ${error}`
      );
      throw error;
    }
  }

  protected getModelName(): Model {
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
  protected getClient<Client extends PrismaDelegate<T, Model>>(): Client {
    const client = (this.currentTrx?.[this.getModelName() as keyof TransactionClient] ?? this.model) as Client;
    if (!client) {
      throw new Error('prisma-abstraction-alvamind: Invalid prisma client state');
    }
    return client;
  }

  // @ts-ignore
  public create: PrismaDelegate<T, Model>['create'] = async (args: any) => {
    try {
      return await this.getClient().create(args);
    } finally {
      this.currentTrx = undefined;
    }
  };

  // @ts-ignore
  public createMany: PrismaDelegate<T, Model>['createMany'] = async (args: any) => {
    try {
      return await this.getClient().createMany(args);
    } finally {
      this.currentTrx = undefined;
    }
  }

  // @ts-ignore
  public findMany: PrismaDelegate<T, Model>['findMany'] = async (args: any) => {
    try {
      return await this.getClient().findMany(args);
    } finally {
      this.currentTrx = undefined;
    }
  };

  // @ts-ignore
  public findFirst: PrismaDelegate<T, Model>['findFirst'] = async (args: any) => {
    try {
      return await this.getClient().findFirst(args);
    } finally {
      this.currentTrx = undefined;
    }
  };

  // @ts-ignore
  public findUnique: PrismaDelegate<T, Model>['findUnique'] = async (args: any) => {
    try {
      return await this.getClient().findUnique(args);
    } finally {
      this.currentTrx = undefined;
    }
  };

  // @ts-ignore
  public delete: PrismaDelegate<T, Model>['delete'] = async (args: any) => {
    try {
      if (getConfig().softDelete) {
        return await this.softDelete(args);
      }
      return await this.getClient().delete(args);
    } finally {
      this.currentTrx = undefined;
    }
  };

  // @ts-ignore
  public deleteMany: PrismaDelegate<T, Model>['deleteMany'] = async (args: any) => {
    try {
      if (getConfig().softDelete) {
        return await this.softDeleteMany(args);
      }
      return await this.getClient().deleteMany(args);
    } finally {
      this.currentTrx = undefined;
    }
  };

  // Use ModelOperationTypes here
  protected async softDelete(args: any): Promise<ModelOperationTypes<T, Model>['delete']> {
    if (!args?.where) {
      throw new Error('prisma-abstraction-alvamind: Where clause is required for soft delete');
    }
    const result = await this.update({
      where: args.where,
      data: {
        ...(args.data || {}),
        deletedAt: new Date(),
      },
    })
    this.currentTrx = undefined;
    return result as any;
  }

  protected async softDeleteMany(args: any): Promise<ModelOperationTypes<T, Model>['deleteMany']> {
    const result = await this.updateMany({
      where: args.where,
      data: {
        ...(args.data || {}),
        deletedAt: new Date(),
      },
    });
    this.currentTrx = undefined;
    return result as any;
  };

  // @ts-ignore
  public update: PrismaDelegate<T, Model>['update'] = async (args: any) => {
    try {
      return await this.getClient().update(args);
    } finally {
      this.currentTrx = undefined;
    }
  };

  // @ts-ignore
  public updateMany: PrismaDelegate<T, Model>['updateMany'] = async (args: any) => {
    try {
      return await this.getClient().updateMany(args);
    } finally {
      this.currentTrx = undefined;
    }
  };

  // @ts-ignore
  public upsert: PrismaDelegate<T, Model>['upsert'] = async (args: any) => {
    try {
      return await this.getClient().upsert(args);
    } finally {
      this.currentTrx = undefined;
    }
  };

  // @ts-ignore
  public count: PrismaDelegate<T, Model>['count'] = async (args: any) => {
    try {
      return await this.getClient().count(args);
    } finally {
      this.currentTrx = undefined;
    }
  };

  public async $executeRaw(
    query: TemplateStringsArray | Sql,
    ...values: any[]
  ): Promise<number> {
    try {
      if (!query) throw new Error('prisma-abstraction-alvamind: Query is required');
      const client = this.currentTrx ?? this.prisma;
      return await client.$executeRaw.apply(client, [query, ...values]);
    } finally {
      this.currentTrx = undefined;
    }
  }

  public async $queryRaw<P = any>(
    query: TemplateStringsArray | Sql,
    ...values: any[]
  ): Promise<P> {
    try {
      const client = this.currentTrx ?? this.prisma;
      return await client.$queryRaw.apply(client, [query, ...values]) as P;
    } finally {
      this.currentTrx = undefined;
    }
  }

  public async $transaction<P>(
    fn: (prisma: TransactionClient) => Promise<P>,
    options?: { timeout?: number }
  ): Promise<P> {
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
      return result;
    } catch (e) {
      throw e;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      this.currentTrx = undefined;
    }
  }

  /* ====================================================== */

  public async isExist<
    Where extends Parameters<PrismaDelegate<T, Model>['findFirst']>[0] extends { where?: infer W } ? W : never,
    Select extends Parameters<PrismaDelegate<T, Model>['findFirst']>[0] extends { select?: infer S } ? S : never
  >(
    where: Where,
    select?: Select
  ): Promise<boolean> {
    const result = await this.getClient()['findFirst']({
      where,
      select: select ? select : { id: true } as any
    });
    return result !== null;
  }

  public async findManyWithPagination<
    Args extends Parameters<PrismaDelegate<T, Model>['findMany']>[0] = Parameters<PrismaDelegate<T, Model>['findMany']>[0]
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

    this.currentTrx = undefined;
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
    Args extends Parameters<PrismaDelegate<T, Model>['update']>[0] = Parameters<PrismaDelegate<T, Model>['update']>[0]
  >(
    id: string,
    data?: Args extends { data?: infer D } ? Omit<D, 'deletedAt'> : never
  ): Promise<ModelOperationTypes<T, Model>['update']> {
    if (!getConfig().softDelete) {
      throw new Error('prisma-abstraction-alvamind: Restore operation is only available when softDelete is enabled');
    }

    const result = await this.update({
      where: { id: id as any },
      data: {
        ...data,
        deletedAt: null
      }
    });

    this.currentTrx = undefined;
    return result;
  }

}
