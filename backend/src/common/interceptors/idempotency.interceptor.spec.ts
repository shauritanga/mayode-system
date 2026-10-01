import { of, lastValueFrom } from 'rxjs';
import { IdempotencyInterceptor } from './idempotency.interceptor';

function setup() {
  const records = new Map();
  const prisma = {
    syncReceipt: {
      findUnique: jest.fn(async ({ where }) => records.get(where.key)),
      create: jest.fn(async ({ data }) => {
        records.set(data.key, data);
        return data;
      }),
    },
  };
  const request = {
    headers: { 'x-idempotency-key': 'field-request' },
    user: { id: 'officer' },
    method: 'POST',
    url: '/farmers',
    body: { firstName: 'Asha' },
  };
  const response = { statusCode: 201, status: jest.fn() };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  };
  return { prisma, request, context: context as any };
}
describe('Durable field synchronization receipts', () => {
  it('replays a stored response even after the interceptor is recreated', async () => {
    const { prisma, context } = setup();
    const first = { handle: jest.fn(() => of({ id: 'farmer' })) };
    await lastValueFrom(
      new IdempotencyInterceptor(prisma as any).intercept(context, first),
    );
    const retry = { handle: jest.fn(() => of({ id: 'duplicate' })) };
    await expect(
      lastValueFrom(
        new IdempotencyInterceptor(prisma as any).intercept(context, retry),
      ),
    ).resolves.toEqual({ id: 'farmer' });
    expect(retry.handle).not.toHaveBeenCalled();
  });
  it('isolates receipts by user and rejects changed payloads with the same key', async () => {
    const { prisma, context, request } = setup();
    const interceptor = new IdempotencyInterceptor(prisma as any);
    const handler = { handle: jest.fn(() => of({ id: 'farmer' })) };
    await lastValueFrom(interceptor.intercept(context, handler));
    request.body.firstName = 'Changed';
    await expect(
      lastValueFrom(interceptor.intercept(context, handler)),
    ).rejects.toThrow('different record');
    request.user.id = 'another';
    await lastValueFrom(interceptor.intercept(context, handler));
    expect(handler.handle).toHaveBeenCalledTimes(2);
  });
  it('serializes concurrent retries in one process', async () => {
    const { prisma, context } = setup();
    const interceptor = new IdempotencyInterceptor(prisma as any);
    const handler = { handle: jest.fn(() => of({ id: 'farmer' })) };
    await Promise.all([
      lastValueFrom(interceptor.intercept(context, handler)),
      lastValueFrom(interceptor.intercept(context, handler)),
    ]);
    expect(handler.handle).toHaveBeenCalledTimes(1);
  });
});
