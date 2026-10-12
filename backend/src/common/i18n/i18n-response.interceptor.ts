import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { languageFromHeader, translateMessage } from './translate';

/** The response fields that carry wording written by the server (advice, alert text, task titles, labels). */
const TEXT_FIELDS = new Set(['message', 'title', 'guidance', 'label', 'unit', 'previewMessage', 'recommendation', 'body', 'subtitle', 'description']);

function translateDeep(value: unknown, depth = 0): unknown {
  if (depth > 12 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => translateDeep(v, depth + 1));
  if (Object.getPrototypeOf(value) !== Object.prototype) return value; // Dates, Buffers, streams…
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = typeof v === 'string' && TEXT_FIELDS.has(k) ? translateMessage(v, 'sw') : translateDeep(v, depth + 1);
  }
  return out;
}

/**
 * For Swahili requests, translates the server-written wording in a response. Only exact catalog matches
 * change, so anything a person typed (a farm name, a note) comes back exactly as saved.
 */
@Injectable()
export class I18nResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    if (languageFromHeader(req?.headers?.['accept-language']) !== 'sw') return next.handle();
    return next.handle().pipe(map((data) => translateDeep(data)));
  }
}
