import type { FastifyReply, FastifyRequest } from 'fastify';
import { type Permission, type Role, permissionsFor } from '@ludora/shared';
import { forbidden, unauthenticated } from '../lib/errors.ts';
import type { Preferences } from '../modules/users/preferences.ts';

export interface AuthUser {
  id: string;
  username: string | null;
  displayName: string;
  isGuest: boolean;
  accountType: string;
  ageBand: string | null;
  isTestAccount: boolean;
  status: string;
  level: number;
  xp: number;
  friendCode: string;
  preferences: Preferences;
  mutedUntil: Date | null;
}

export interface AuthContext {
  user: AuthUser;
  roles: Role[];
  permissions: Set<Permission>;
  sessionId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

export function makeAuthContext(user: AuthUser, roles: Role[], sessionId: string): AuthContext {
  return { user, roles, permissions: permissionsFor(roles), sessionId };
}

export function requireAuth(req: FastifyRequest): AuthContext {
  if (!req.auth) throw unauthenticated();
  return req.auth;
}

/** Registered (non-guest) accounts only. */
export function requireAccount(req: FastifyRequest): AuthContext {
  const auth = requireAuth(req);
  if (auth.user.isGuest) throw forbidden('Create a free account to do that. Your progress comes with you.');
  return auth;
}

export function requirePermission(req: FastifyRequest, permission: Permission): AuthContext {
  const auth = requireAuth(req);
  if (!auth.permissions.has(permission)) throw forbidden();
  return auth;
}

export function noStore(reply: FastifyReply) {
  reply.header('cache-control', 'no-store');
}
