import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Response } from 'express';

interface CachedResponse {
  statusCode: number;
  body: any;
  timestamp: number;
}

// In-memory store for idempotency keys with 24-hour expiration
const TTL_MS = 24 * 60 * 60 * 1000;
const idempotencyStore = new Map<string, CachedResponse>();

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const res: Response = context.switchToHttp().getResponse();
    const idempotencyKey = req.headers['x-idempotency-key'] as string;

    if (!idempotencyKey || !['POST', 'PATCH', 'PUT'].includes(req.method)) {
      return next.handle();
    }

    const cached = idempotencyStore.get(idempotencyKey);
    const now = Date.now();

    if (cached && now - cached.timestamp < TTL_MS) {
      this.logger.log(
        `Idempotent replay served for key ${idempotencyKey} on ${req.method} ${req.url}`,
      );
      res.status(cached.statusCode);
      res.setHeader('X-Idempotent-Replay', 'true');
      return of(cached.body);
    }

    return next.handle().pipe(
      tap((body) => {
        idempotencyStore.set(idempotencyKey, {
          statusCode: res.statusCode || 200,
          body,
          timestamp: now,
        });

        // Periodic pruning of expired keys
        if (idempotencyStore.size > 5000) {
          for (const [key, value] of idempotencyStore.entries()) {
            if (now - value.timestamp >= TTL_MS) {
              idempotencyStore.delete(key);
            }
          }
        }
      }),
    );
  }
}
