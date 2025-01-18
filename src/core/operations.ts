// src/core/operations.ts
import {
  PrismaDelegate,
  ModelNames,
  PrismaClientType,
  TransactionClient,
  ModelOperationTypes,
  RepositoryError
} from '../types';
import { PrismaClient } from '@prisma/client';
import { Sql } from '@prisma/client/runtime/library';
import { getConfig } from '../config/config';
import { withTimeout } from '../utils/utils';

export function createOperations<
  T extends PrismaClientType,
  Model extends ModelNames<T>
>(
  model: PrismaDelegate<T, Model>,
  prisma: PrismaClient,
  modelName: string,
  currentTrx?: TransactionClient
) {
  const getClient = () => {
    if (currentTrx) {
      return currentTrx[modelName as keyof TransactionClient] as PrismaDelegate<T, Model>;
    }
    return model;
  };

  const getPrismaClient = () => currentTrx ?? prisma;

  const executeWithTimeout = async <R>(
    operation: () => Promise<R>,
    operationName: string
  ): Promise<R> => {
    try {
      const timeout = getConfig().transactionOptions?.timeout ?? 5000;
      const result = await withTimeout(
        operation(),
        timeout,
        `Operation ${operationName} timed out after ${timeout}ms`
      );
      return result;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Transaction already closed')) {
        currentTrx = undefined;
        return operation();
      }
      throw new RepositoryError(
        `Operation ${operationName} failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  };

  const operations = {
    // @ts-ignore - Maintain Prisma's exact method shape
    create: async (args: Parameters<PrismaDelegate<T, Model>['create']>[0]) => {
      try {
        return await executeWithTimeout(
          () => getClient().create(args),
          'create'
        );
      } finally {
        currentTrx = undefined;
      }
    },


    createMany: async (args: Parameters<PrismaDelegate<T, Model>['createMany']>[0]) => {
      try {
        return await executeWithTimeout(
          () => getClient().createMany(args),
          'createMany'
        );
      } finally {
        currentTrx = undefined;
      }
    },

    // @ts-ignore - Maintain Prisma's exact method shape
    findMany: async (args: Parameters<PrismaDelegate<T, Model>['findMany']>[0]) => {
      try {
        return await executeWithTimeout(
          () => getClient().findMany(args),
          'findMany'
        );
      } finally {
        currentTrx = undefined;
      }
    },

    // @ts-ignore - Maintain Prisma's exact method shape
    findFirst: async (args: Parameters<PrismaDelegate<T, Model>['findFirst']>[0]) => {
      try {
        return await executeWithTimeout(
          () => getClient().findFirst(args),
          'findFirst'
        );
      } finally {
        currentTrx = undefined;
      }
    },

    // @ts-ignore - Maintain Prisma's exact method shape
    findUnique: async (args: Parameters<PrismaDelegate<T, Model>['findUnique']>[0]) => {
      try {
        return await executeWithTimeout(
          () => getClient().findUnique(args),
          'findUnique'
        );
      } finally {
        currentTrx = undefined;
      }
    },

    // @ts-ignore - Maintain Prisma's exact method shape
    update: async (args: Parameters<PrismaDelegate<T, Model>['update']>[0]) => {
      try {
        return await executeWithTimeout(
          () => getClient().update(args),
          'update'
        );
      } finally {
        currentTrx = undefined;
      }
    },

    // @ts-ignore - Maintain Prisma's exact method shape
    updateMany: async (args: Parameters<PrismaDelegate<T, Model>['updateMany']>[0]) => {
      try {
        return await executeWithTimeout(
          () => getClient().updateMany(args),
          'updateMany'
        );
      } finally {
        currentTrx = undefined;
      }
    },

    // @ts-ignore - Maintain Prisma's exact method shape
    delete: async (args: Parameters<PrismaDelegate<T, Model>['delete']>[0]) => {
      try {
        return await executeWithTimeout(
          async () => {
            if (getConfig().softDelete) {
              return await softDelete(args);
            }
            return await getClient().delete(args);
          },
          'delete'
        );
      } finally {
        currentTrx = undefined;
      }
    },

    // @ts-ignore - Maintain Prisma's exact method shape
    deleteMany: async (args: Parameters<PrismaDelegate<T, Model>['deleteMany']>[0]) => {
      try {
        return await executeWithTimeout(
          async () => {
            if (getConfig().softDelete) {
              return await softDeleteMany(args);
            }
            return await getClient().deleteMany(args);
          },
          'deleteMany'
        );
      } finally {
        currentTrx = undefined;
      }
    },

    // @ts-ignore - Maintain Prisma's exact method shape
    upsert: async (args: Parameters<PrismaDelegate<T, Model>['upsert']>[0]) => {
      try {
        return await executeWithTimeout(
          () => getClient().upsert(args),
          'upsert'
        );
      } finally {
        currentTrx = undefined;
      }
    },

    // @ts-ignore - Maintain Prisma's exact method shape
    count: async (args: Parameters<PrismaDelegate<T, Model>['count']>[0]) => {
      try {
        return await executeWithTimeout(
          () => getClient().count(args),
          'count'
        );
      } finally {
        currentTrx = undefined;
      }
    },

    // Raw operations
    $executeRaw: async (query: TemplateStringsArray | Sql, ...values: any[]): Promise<number> => {
      try {
        return await executeWithTimeout(
          async () => {
            if (!query) throw new Error('Query is required');
            const client = getPrismaClient();
            return await client.$executeRaw.apply(client, [query, ...values]);
          },
          '$executeRaw'
        );
      } finally {
        currentTrx = undefined;
      }
    },

    $queryRaw: async <P = any>(
      query: TemplateStringsArray | Sql,
      ...values: any[]
    ): Promise<P> => {
      try {
        return await executeWithTimeout(
          async () => {
            const client = getPrismaClient();
            return await client.$queryRaw.apply(client, [query, ...values]) as P;
          },
          '$queryRaw'
        );
      } finally {
        currentTrx = undefined;
      }
    },

    // Transaction operation
    $transaction: async <P>(
      fn: (prisma: TransactionClient) => Promise<P>,
      options?: { timeout?: number }
    ): Promise<P> => {
      const timeout = options?.timeout ?? getConfig().transactionOptions?.timeout ?? 5000;
      try {
        return await withTimeout(
          prisma.$transaction(fn),
          timeout,
          `Transaction timed out after ${timeout}ms`
        );
      } catch (error) {
        throw new RepositoryError(
          'Transaction failed',
          error instanceof Error ? error : undefined
        );
      } finally {
        currentTrx = undefined;
      }
    },
  };

  // Helper functions for soft delete
  async function softDelete(
    args: Parameters<PrismaDelegate<T, Model>['delete']>[0]
  ): Promise<ModelOperationTypes<T, Model>['delete']> {
    // @ts-ignore
    if (!args?.where) {
      throw new RepositoryError('Where clause is required for soft delete');
    }

    return getClient().update({
      // @ts-ignore
      where: args.where,
      data: {
        deletedAt: new Date(),
      },
    }) as Promise<ModelOperationTypes<T, Model>['delete']>;
  }

  async function softDeleteMany(
    args: Parameters<PrismaDelegate<T, Model>['deleteMany']>[0]
  ): Promise<ModelOperationTypes<T, Model>['deleteMany']> {
    return getClient().updateMany({
      // @ts-ignore
      where: args.where,
      data: {
        deletedAt: new Date(),
      },
    });
  }

  return operations;
}

export type Operations<
  T extends PrismaClientType,
  Model extends ModelNames<T>
> = ReturnType<typeof createOperations<T, Model>>;
