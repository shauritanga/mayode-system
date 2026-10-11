import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * AuditInterceptor — records every successful mutating request into audit_logs.
 * Best-effort and non-blocking: a failure to write the audit trail never breaks
 * the underlying request.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const method: string = req.method;

    if (!MUTATING_METHODS.has(method)) {
      return next.handle();
    }

    // Derive a coarse entityType from the first path segment after the API prefix.
    const path: string = req.route?.path || req.url || '';
    const segments = path.split('/').filter(Boolean);
    const apiIdx = segments.findIndex((s: string) => s === 'v1');
    const entityType =
      apiIdx >= 0
        ? segments[apiIdx + 1] || 'unknown'
        : segments[0] || 'unknown';
    // Name the action after the route's own verb when it has one ("confirm", "settle", "close-short"),
    // otherwise after the HTTP method, so the audit log reads as sentences rather than "sales.post".
    const afterEntity =
      apiIdx >= 0 ? segments.slice(apiIdx + 2) : segments.slice(1);
    const last = afterEntity[afterEntity.length - 1];
    const routeVerb = last && !last.startsWith(':') ? last : undefined;
    const methodVerb =
      method === 'POST' ? 'create' : method === 'DELETE' ? 'delete' : 'update';
    const action = `${entityType}.${routeVerb ?? methodVerb}`;

    return next.handle().pipe(
      tap((response) => {
        const userId: string | undefined = req.user?.id;
        const entityId: string =
          (response && (response.id as string)) || req.params?.id || 'n/a';

        // Fire-and-forget; swallow errors so auditing never affects the response.
        this.prisma.auditLog
          .create({
            data: {
              userId,
              action,
              entityType,
              entityId,
              mamcosId: req.user?.mamcosId ?? null,
              newData: this.safeBody(req.body),
              ipAddress: req.ip || req.headers?.['x-forwarded-for'] || null,
            },
          })
          .catch(() => undefined);
      }),
    );
  }

  /** Strip obviously-sensitive fields before persisting the request body. */
  private safeBody(body: unknown): object | undefined {
    if (!body || typeof body !== 'object') return undefined;
    return this.redact(body) as object;
  }

  private redact(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => this.redact(item));
    if (!value || typeof value !== 'object') return value;
    const sensitive = [
      'password',
      'passwordHash',
      'refreshToken',
      'accessToken',
      'token',
      'apiKey',
      'keyHash',
      'secret',
      'authorization',
      'signature',
      'thumbprint',
      'nationalId',
    ];
    const clone: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(
      value as Record<string, unknown>,
    )) {
      clone[key] = sensitive.some((needle) =>
        key.toLowerCase().includes(needle.toLowerCase()),
      )
        ? '***'
        : this.redact(item);
    }
    return clone;
  }
}
