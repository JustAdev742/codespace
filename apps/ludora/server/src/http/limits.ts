import type { FastifyRequest } from 'fastify';

/** Per IP. A request the browser has already abandoned has no address left, and the default key would throw on it. */
export const ipKey = (req: FastifyRequest) => `ip:${req.ip || 'gone'}`;

/**
 * Signed-in requests (guests included) count against the account instead of the IP:
 * a class behind one school IP would otherwise share a single budget.
 */
export const requestKey = (req: FastifyRequest) => (req.auth ? `user:${req.auth.user.id}` : ipKey(req));

/** Only the API is limited. Static files are cheap, and a single page load fetches dozens of them. */
export const notApi = (req: FastifyRequest) => !req.url.startsWith('/api/');
