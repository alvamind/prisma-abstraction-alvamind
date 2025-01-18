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
  const getClient = <Client extends PrismaDelegate<T, Model>>(): Client => {
    if (currentTrx) {
      return currentTrx[modelName as keyof TransactionClient] as Client;
    }
    return model as Client;
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
        // Re-execute without transaction
        currentTrx = undefined;
        return operation();
      }
      throw new RepositoryError(
        `Operation ${operationName} failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  };

  // Core operations using model delegate
  const operations = {
    create: async (
      args: Parameters<PrismaDelegate<T, Model>['create']>[0]
    ): Promise<ModelOperationTypes<T, Model>['create']> => {
      return executeWithTimeout(
        async () => getClient().create(args),
        'create'
      );
    },

    createMany: async (
      args: Parameters<PrismaDelegate<T, Model>['createMany']>[0]
    ): Promise<ModelOperationTypes<T, Model>['createMany']> => {
      return executeWithTimeout(
        async () => getClient().createMany(args),
        'createMany'
      );
    },

    findMany: async (
      args: Parameters<PrismaDelegate<T, Model>['findMany']>[0]
    ): Promise<ModelOperationTypes<T, Model>['findMany']> => {
      return executeWithTimeout(
        async () => getClient().findMany(args),
        'findMany'
      );
    },

    findFirst: async (
      args: Parameters<PrismaDelegate<T, Model>['findFirst']>[0]
    ): Promise<ModelOperationTypes<T, Model>['findFirst']> => {
      return executeWithTimeout(
        async () => getClient().findFirst(args),
        'findFirst'
      );
    },

    findUnique: async (
      args: Parameters<PrismaDelegate<T, Model>['findUnique']>[0]
    ): Promise<ModelOperationTypes<T, Model>['findUnique']> => {
      return executeWithTimeout(
        async () => getClient().findUnique(args),
        'findUnique'
      );
    },

    update: async (
      args: Parameters<PrismaDelegate<T, Model>['update']>[0]
    ): Promise<ModelOperationTypes<T, Model>['update']> => {
      return executeWithTimeout(
        async () => getClient().update(args),
        'update'
      );
    },

    updateMany: async (
      args: Parameters<PrismaDelegate<T, Model>['updateMany']>[0]
    ): Promise<ModelOperationTypes<T, Model>['updateMany']> => {
      return executeWithTimeout(
        async () => getClient().updateMany(args),
        'updateMany'
      );
    },

    delete: async (
      args: Parameters<PrismaDelegate<T, Model>['delete']>[0]
    ): Promise<ModelOperationTypes<T, Model>['delete']> => {
      return executeWithTimeout(
        async () => {
          if (getConfig().softDelete) {
            return softDelete(args);
          }
          return getClient().delete(args);
        },
        'delete'
      );
    },

    deleteMany: async (
      args: Parameters<PrismaDelegate<T, Model>['deleteMany']>[0]
    ): Promise<ModelOperationTypes<T, Model>['deleteMany']> => {
      return executeWithTimeout(
        async () => {
          if (getConfig().softDelete) {
            return softDeleteMany(args);
          }
          return getClient().deleteMany(args);
        },
        'deleteMany'
      );
    },

    upsert: async (
      args: Parameters<PrismaDelegate<T, Model>['upsert']>[0]
    ): Promise<ModelOperationTypes<T, Model>['upsert']> => {
      return executeWithTimeout(
        async () => getClient().upsert(args),
        'upsert'
      );
    },

    count: async (
      args: Parameters<PrismaDelegate<T, Model>['count']>[0]
    ): Promise<number> => {
      return executeWithTimeout(
        async () => getClient().count(args),
        'count'
      );
    },

    // Raw operations using prisma instance
    $executeRaw: async (query: TemplateStringsArray | Sql, ...values: any[]): Promise<number> => {
      return executeWithTimeout(
        async () => {
          if (!query) throw new Error('Query is required');
          const client = getPrismaClient();
          return await client.$executeRaw.apply(client, [query, ...values]);
        },
        '$executeRaw'
      );
    },

    $queryRaw: async <P = any>(
      query: TemplateStringsArray | Sql,
      ...values: any[]
    ): Promise<P> => {
      return executeWithTimeout(
        async () => {
          const client = getPrismaClient();
          return await client.$queryRaw.apply(client, [query, ...values]) as P;
        },
        '$queryRaw'
      );
    },

    // Transaction operation using prisma instance
    $transaction: async <P>(
      fn: (prisma: TransactionClient) => Promise<P>,
      options?: { timeout?: number }
    ): Promise<P> => {
      const timeout = options?.timeout ?? getConfig().transactionOptions?.timeout ?? 5000;
      return executeWithTimeout(
        async () => {
          try {
            return await prisma.$transaction(fn);
          } catch (error) {
            throw new RepositoryError(
              'Transaction failed',
              error instanceof Error ? error : undefined
            );
          }
        },
        '$transaction'
      );
    },
  };

  // Helper functions for soft delete
  async function softDelete(
    args: Parameters<PrismaDelegate<T, Model>['delete']>[0]
  ): Promise<ModelOperationTypes<T, Model>['delete']> {
    if (!args?.where) {
      throw new RepositoryError('Where clause is required for soft delete');
    }

    return getClient().update({
      where: args.where,
      data: {
        ...(args.data || {}),
        deletedAt: new Date(),
      },
    }) as Promise<ModelOperationTypes<T, Model>['delete']>;
  }

  async function softDeleteMany(
    args: Parameters<PrismaDelegate<T, Model>['deleteMany']>[0]
  ): Promise<ModelOperationTypes<T, Model>['deleteMany']> {
    return getClient().updateMany({
      where: args.where,
      data: {
        ...(args.data || {}),
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
