import type { ErrorCode } from '@ludora/shared';

/** An error with a status code and a message safe to show the person who caused it. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, fields?: Record<string, string>) => new AppError(400, 'bad_request', message, fields);
export const unauthenticated = (message = 'Sign in to do that.') => new AppError(401, 'unauthenticated', message);
export const forbidden = (message = 'You do not have permission to do that.') => new AppError(403, 'forbidden', message);
export const notFound = (message = 'That could not be found.') => new AppError(404, 'not_found', message);
export const conflict = (message: string, fields?: Record<string, string>) => new AppError(409, 'conflict', message, fields);
export const insufficientFunds = (message: string) => new AppError(409, 'insufficient_funds', message);
export const notAvailable = (message: string) => new AppError(409, 'not_available', message);
export const tooMany = (message = 'Too many attempts. Wait a minute and try again.') => new AppError(429, 'rate_limited', message);
