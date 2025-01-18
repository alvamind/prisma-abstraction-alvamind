// // src/decorators/transaction.ts
// import { ModelNames, PrismaClientType, TransactionClient, RepositoryError } from '../types';
// import { OperationDecorator } from './operationDecorator';
// import { getConfig } from '../config/config';
// import { retry, RetryOptions } from '../utils/utils';

// export interface TransactionOptions {
//   timeout?: number;
//   maxRetries?: number;
//   isolationLevel?: 'ReadUncommitted' | 'ReadCommitted' | 'RepeatableRead' | 'Serializable';
// }

// export function createTransactionDecorator<
//   T extends PrismaClientType,
//   Model extends ModelNames<T>
// >(
//   currentTrx?: TransactionClient
// ): OperationDecorator<T, Model> {
//   return async (operation, context) => {
//     try {
//       return await operation(...context.args);
//     } finally {
//       // Reset transaction after operation
//       currentTrx = undefined;
//     }
//   };
// }

// export async function executeTransaction<P>(
//   fn: (trx: TransactionClient) => Promise<P>,
//   options: TransactionOptions = {},
//   prismaClient: PrismaClientType
// ): Promise<P> {
//   const {
//     timeout = getConfig().transactionOptions?.timeout ?? 5000,
//     maxRetries = getConfig().transactionOptions?.maxRetries ?? 3,
//     isolationLevel
//   } = options;

//   const retryOptions: RetryOptions = {
//     maxAttempts: maxRetries,
//     backoff: {
//       initial: 100,
//       factor: 2,
//       maxDelay: 1000
//     },
//     shouldRetry: (error: Error) => {
//       // Add specific transaction retry conditions here
//       return error.message.includes('deadlock') ||
//         error.message.includes('serialization') ||
//         error.message.includes('timeout');
//     }
//   };

//   return retry(
//     async () => {
//       let timeoutId: ReturnType<typeof setTimeout> | undefined;

//       try {
//         const timeoutPromise = new Promise<never>((_, reject) => {
//           timeoutId = setTimeout(
//             () => reject(new Error('Transaction timeout')),
//             timeout
//           );
//         });

//         const trxOptions: any = { timeout };
//         if (isolationLevel) {
//           trxOptions.isolationLevel = isolationLevel;
//         }

//         const result = await Promise.race([
//           prismaClient.$transaction(fn, trxOptions),
//           timeoutPromise
//         ]);

//         if (timeoutId) clearTimeout(timeoutId);
//         return result;

//       } catch (error) {
//         if (timeoutId) clearTimeout(timeoutId);
//         throw new RepositoryError(
//           `Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
//           error instanceof Error ? error : undefined
//         );
//       }
//     },
//     retryOptions
//   );
// }

// // Helper function to determine if client is in transaction
// export function isInTransaction(client: any): boolean {
//   return client?.$transaction !== undefined;
// }

// // Helper function to get the appropriate client (transaction or regular)
// export function getTransactionClient<
//   T extends PrismaClientType,
//   Model extends ModelNames<T>
// >(
//   regular: T[Model],
//   transaction?: TransactionClient
// ): T[Model] {
//   if (!transaction) {
//     return regular;
//   }

//   const modelName = (regular as any)['$name'] as keyof TransactionClient;
//   return transaction[modelName] as T[Model];
// }

// // Type helper for operations that support transactions
// export type WithTransaction<T> = T & {
//   trx(transaction: TransactionClient): WithTransaction<T>;
// };

// // Helper to make an operation support transactions
// export function withTransaction<T extends Function>(
//   operation: T
// ): WithTransaction<T> {
//   let currentTrx: TransactionClient | undefined;

//   const transactionalOperation = function (this: any, ...args: any[]) {
//     const client = currentTrx || this;
//     return operation.apply(client, args);
//   } as WithTransaction<T>;

//   transactionalOperation.trx = function (transaction: TransactionClient) {
//     currentTrx = transaction;
//     return transactionalOperation;
//   };

//   return transactionalOperation;
// }
