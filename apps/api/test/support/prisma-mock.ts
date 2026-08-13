import type { PrismaService } from '../../src/infra/prisma/prisma.service';

const DELEGATES = [
  'user',
  'session',
  'device',
  'otpChallenge',
  'role',
  'userRole',
  'branch',
] as const;

type Delegate = (typeof DELEGATES)[number];

const METHODS = [
  'findUnique',
  'findFirst',
  'findMany',
  'create',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'count',
  'upsert',
  'createMany',
] as const;

type MockedDelegates = Record<Delegate, Record<(typeof METHODS)[number], jest.Mock>>;

export type PrismaMock = MockedDelegates & { $transaction: jest.Mock } & PrismaService;

/**
 * A hand-rolled Prisma double for unit tests. `$transaction` hands the callback
 * the same mock, so a test sees every write a transactional code path makes.
 */
export function createPrismaMock(): PrismaMock {
  const delegates: Partial<MockedDelegates> = {};
  for (const delegate of DELEGATES) {
    delegates[delegate] = Object.fromEntries(
      METHODS.map((method) => [method, jest.fn()]),
    ) as MockedDelegates[Delegate];
  }

  const mock = { ...delegates, $transaction: jest.fn() } as unknown as PrismaMock;

  mock.$transaction.mockImplementation(
    async (argument: unknown): Promise<unknown> =>
      typeof argument === 'function'
        ? (argument as (tx: unknown) => Promise<unknown>)(mock)
        : Promise.all(argument as Promise<unknown>[]),
  );

  return mock;
}
