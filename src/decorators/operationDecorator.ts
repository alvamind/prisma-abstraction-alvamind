// src/decorators/operationDecorator.ts
import { ModelNames, PrismaClientType, PrismaDelegate } from '../types';

export type OperationFunction<T extends PrismaClientType, Model extends ModelNames<T>> =
  (args: any) => Promise<ReturnType<PrismaDelegate<T, Model>[keyof PrismaDelegate<T, Model>]>>;

export type OperationContext = {
  modelName: string;
  operationName: string;
  args: any[];
};

export type DecoratorFunction<T extends PrismaClientType, Model extends ModelNames<T>> =
  (operation: OperationFunction<T, Model>, context: OperationContext) => Promise<any>;

export type OperationDecorator<T extends PrismaClientType, Model extends ModelNames<T>> = {
  (
    baseOperation: OperationFunction<T, Model>,
    context: OperationContext
  ): Promise<ReturnType<typeof baseOperation>>;
}

export function createOperationDecorator<T extends PrismaClientType, Model extends ModelNames<T>>(
  decorator: DecoratorFunction<T, Model>
): OperationDecorator<T, Model> {
  return async (baseOperation, context) => {
    return decorator(baseOperation, context);
  };
}

export function composeDecorators<T extends PrismaClientType, Model extends ModelNames<T>>(
  ...decorators: OperationDecorator<T, Model>[]
): OperationDecorator<T, Model> {
  return async (operation, context) => {
    return decorators.reduceRight(
      (decorated, decorator) =>
        async (...args) => decorator(
          async () => decorated(...args),
          { ...context, args }
        ),
      operation
    )(context.args);
  };
}

export function wrapOperation<
  T extends PrismaClientType,
  Model extends ModelNames<T>
>(
  operation: OperationFunction<T, Model>,
  decorator: OperationDecorator<T, Model>,
  context: OperationContext
): OperationFunction<T, Model> {
  return async (...args: any[]) => {
    return decorator(
      operation,
      { ...context, args }
    );
  };
}

// Helper type for method chaining
export type DecoratedOperation<
  T extends PrismaClientType,
  Model extends ModelNames<T>,
  K extends keyof PrismaDelegate<T, Model>
> = (
  ...args: Parameters<PrismaDelegate<T, Model>[K]>
) => Promise<ReturnType<PrismaDelegate<T, Model>[K]>>;

export type ChainableOperation<
  T extends PrismaClientType,
  Model extends ModelNames<T>,
  K extends keyof PrismaDelegate<T, Model>
> = {
  operation: DecoratedOperation<T, Model, K>;
  // @ts-ignore
  chain: <R>(
    decorator: OperationDecorator<T, Model>
  ) => ChainableOperation<T, Model, K>;
};

export function createChainableOperation<
  T extends PrismaClientType,
  Model extends ModelNames<T>,
  K extends keyof PrismaDelegate<T, Model>
>(
  baseOperation: DecoratedOperation<T, Model, K>,
  context: OperationContext
): ChainableOperation<T, Model, K> {
  const chain = (
    decorator: OperationDecorator<T, Model>
  ): ChainableOperation<T, Model, K> => {
    const wrappedOperation = wrapOperation(
      baseOperation as unknown as OperationFunction<T, Model>,
      decorator,
      context
    ) as unknown as DecoratedOperation<T, Model, K>;

    return createChainableOperation(wrappedOperation, context);
  };

  return {
    operation: baseOperation,
    chain
  };
}

// Helper for creating a decorated operation factory
export function createDecoratedOperationFactory<
  T extends PrismaClientType,
  Model extends ModelNames<T>
>(modelName: string) {
  return <K extends keyof PrismaDelegate<T, Model>>(
    operationName: K,
    baseOperation: DecoratedOperation<T, Model, K>
  ): ChainableOperation<T, Model, K> => {
    return createChainableOperation(
      baseOperation,
      {
        modelName,
        operationName: operationName as string,
        args: []
      }
    );
  };
}
