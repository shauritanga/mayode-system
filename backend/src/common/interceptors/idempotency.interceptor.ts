import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ConflictException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { Observable, from, lastValueFrom } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly pending = new Map<
    string,
    Promise<{ statusCode: number; body: any }>
  >();
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const token = req.headers['x-idempotency-key'];
    if (
      !token ||
      !req.user?.id ||
      !['POST', 'PATCH', 'PUT'].includes(req.method)
    )
      return next.handle();
    const key = createHash('sha256')
      .update(
        `${req.user.id}:${req.method}:${req.originalUrl || req.url}:${token}`,
      )
      .digest('hex');
    const fingerprint = createHash('sha256')
      .update(JSON.stringify(req.body ?? {}))
      .digest('hex');
    const run = async () => {
      const cached = await this.prisma.syncReceipt.findUnique({
        where: { key },
      });
      if (cached) {
        if (cached.fingerprint !== fingerprint)
          throw new ConflictException(
            'This sync key was already used for a different record.',
          );
        return cached;
      }
      const body = await lastValueFrom(next.handle());
      const result = {
        key,
        fingerprint,
        statusCode: res.statusCode || 200,
        body: JSON.parse(JSON.stringify(body ?? null)),
      };
      await this.prisma.syncReceipt.create({ data: result });
      return result;
    };
    const result = async () => {
      // Serialize same-process retries. Durable receipts survive server restarts.
      const existing = this.pending.get(key);
      if (existing) await existing;
      const work = run();
      this.pending.set(key, work);
      try {
        const saved = await work;
        res.status(saved.statusCode);
        return saved.body;
      } finally {
        if (this.pending.get(key) === work) this.pending.delete(key);
      }
    };
    return from(result());
  }
}
