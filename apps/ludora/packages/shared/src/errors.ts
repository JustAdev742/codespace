/**
 * Error codes returned by the API and the game server. Messages are written
 * for the person reading them; codes are for code.
 */
export const ERROR_CODES = [
  'bad_request',
  'validation_failed',
  'unauthenticated',
  'forbidden',
  'not_found',
  'conflict',
  'rate_limited',
  'insufficient_funds',
  'not_available',
  'room_not_found',
  'room_full',
  'room_locked',
  'room_closed',
  'room_requires_account',
  'name_taken',
  'not_host',
  'invalid_state',
  'account_suspended',
  'internal',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; fields?: Record<string, string> };
}
