/**
 * Roles and permissions. The server is the only place these are enforced;
 * the client uses the same table only to decide what to show.
 *
 * Every account is implicitly a `player`. Extra roles are stored per user in
 * the database and can only be granted by someone who outranks the role.
 */

export const ROLES = [
  'player',
  'trusted',
  'creator',
  'designer',
  'tester',
  'moderator',
  'support',
  'admin',
  'superadmin',
] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'sets.create',
  'sets.publish_public',
  'rooms.host',
  'staff.access',
  'users.read',
  'users.moderate',
  'users.edit',
  'roles.assign',
  'reports.handle',
  'rooms.manage',
  'modes.manage',
  'content.moderate',
  'catalog.manage',
  'shop.manage',
  'economy.view',
  'economy.configure',
  'economy.grant',
  'events.manage',
  'flags.manage',
  'system.view',
  'audit.read',
  'testing.tools',
  'testing.entitlements',
  'studio.use',
  'studio.publish',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_INFO: Record<Role, { label: string; description: string; rank: number }> = {
  player: { label: 'Player', description: 'Plays, hosts games and makes private sets.', rank: 0 },
  trusted: { label: 'Trusted player', description: 'Can publish sets to the public library.', rank: 1 },
  creator: { label: 'Content creator', description: 'Publishes sets and can be featured.', rank: 2 },
  designer: { label: 'Studio designer', description: 'Makes Glims, items and Lanterns in the Creator Studio and puts them in the shop.', rank: 2 },
  tester: { label: 'Tester', description: 'Uses staff testing tools on test accounts.', rank: 2 },
  moderator: { label: 'Moderator', description: 'Handles reports and moderates players and content.', rank: 3 },
  support: { label: 'Support', description: 'Looks up accounts, resets passwords, reads economy history.', rank: 3 },
  admin: { label: 'Administrator', description: 'Runs the platform: catalogue, shop, economy, modes and flags.', rank: 4 },
  superadmin: { label: 'Super administrator', description: 'Everything, including assigning administrators and test entitlements.', rank: 5 },
};

const PLAYER: Permission[] = ['sets.create', 'rooms.host'];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  player: PLAYER,
  trusted: [...PLAYER, 'sets.publish_public'],
  creator: [...PLAYER, 'sets.publish_public'],
  // The Creator Studio is its own page, not the staff panel: a designer has no other staff rights.
  designer: [...PLAYER, 'studio.use', 'studio.publish'],
  tester: [...PLAYER, 'staff.access', 'testing.tools'],
  moderator: [
    ...PLAYER,
    'staff.access',
    'users.read',
    'users.moderate',
    'reports.handle',
    'content.moderate',
    'rooms.manage',
  ],
  support: [...PLAYER, 'staff.access', 'users.read', 'users.edit', 'reports.handle', 'economy.view'],
  admin: PERMISSIONS.filter((p) => p !== 'testing.entitlements'),
  superadmin: [...PERMISSIONS],
};

export function permissionsFor(roles: readonly Role[]): Set<Permission> {
  const out = new Set<Permission>(ROLE_PERMISSIONS.player);
  for (const r of roles) for (const p of ROLE_PERMISSIONS[r] ?? []) out.add(p);
  return out;
}

export function hasPermission(roles: readonly Role[], permission: Permission): boolean {
  return permissionsFor(roles).has(permission);
}

export function highestRank(roles: readonly Role[]): number {
  return Math.max(0, ...roles.map((r) => ROLE_INFO[r]?.rank ?? 0));
}

/**
 * Whether `actorRoles` may grant or revoke `role`. Superadmins can grant any
 * role; everyone else needs `roles.assign` and must strictly outrank the role.
 */
export function canAssignRole(actorRoles: readonly Role[], role: Role): boolean {
  if (actorRoles.includes('superadmin')) return true;
  if (!hasPermission(actorRoles, 'roles.assign')) return false;
  return ROLE_INFO[role].rank < highestRank(actorRoles);
}

/** Whether the actor may act on (moderate, edit, re-role) a target account at all. */
export function outranks(actorRoles: readonly Role[], targetRoles: readonly Role[]): boolean {
  if (actorRoles.includes('superadmin')) return true;
  return highestRank(actorRoles) > highestRank(targetRoles);
}

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
