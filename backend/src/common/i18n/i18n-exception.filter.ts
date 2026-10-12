import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { languageFromHeader, translateMessage } from './translate';

/**
 * Answers errors in the language the app asked for. Plain English stays the default and is what other
 * clients (the web dashboards) receive; the error body keeps its shape, only `message` is translated.
 */
@Catch(HttpException)
export class I18nExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request>();
    const status = exception.getStatus();
    const raw = exception.getResponse();
    const body: Record<string, unknown> =
      typeof raw === 'string' ? { statusCode: status, message: raw } : { ...(raw as object) };

    const lang = languageFromHeader(req.headers?.['accept-language']);
    const message = body.message;
    if (typeof message === 'string') body.message = translateMessage(message, lang);
    else if (Array.isArray(message)) body.message = message.map((m) => (typeof m === 'string' ? translateMessage(m, lang) : m));

    res.status(status).json(body);
  }
}
