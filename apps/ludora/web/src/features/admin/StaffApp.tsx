import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { NavLink, Route, Routes } from 'react-router';
import {
  Activity,
  BarChart3,
  Boxes,
  CalendarRange,
  Flag,
  FlaskConical,
  Gamepad2,
  LayoutDashboard,
  LibraryBig,
  Radio,
  ScrollText,
  ShieldAlert,
  ShoppingBag,
  Users,
} from 'lucide-react';
import type { Permission } from '@ludora/shared';
import { useMe } from '../../lib/session.ts';
import { ButtonLink } from '../../ui/Button.tsx';
import { EmptyState, Spinner } from '../../ui/primitives.tsx';

interface Section {
  path: string;
  label: string;
  icon: ReactNode;
  permission: Permission;
  page: ComponentType;
  /** Extra routes under the section, e.g. a detail page. */
  children?: { path: string; page: ComponentType }[];
}

const page = (load: () => Promise<{ default: ComponentType }>) => lazy(load);

export const SECTIONS: Section[] = [
  { path: '', label: 'Overview', icon: <LayoutDashboard className="size-4" />, permission: 'staff.access', page: page(() => import('./Overview.tsx')) },
  {
    path: 'users',
    label: 'Players',
    icon: <Users className="size-4" />,
    permission: 'users.read',
    page: page(() => import('./Users.tsx')),
    children: [{ path: ':id', page: page(() => import('./UserDetail.tsx')) }],
  },
  { path: 'reports', label: 'Reports', icon: <ShieldAlert className="size-4" />, permission: 'reports.handle', page: page(() => import('./Reports.tsx')) },
  { path: 'content', label: 'Question sets', icon: <LibraryBig className="size-4" />, permission: 'content.moderate', page: page(() => import('./Content.tsx')) },
  { path: 'rooms', label: 'Live rooms', icon: <Radio className="size-4" />, permission: 'rooms.manage', page: page(() => import('./Rooms.tsx')) },
  { path: 'modes', label: 'Game modes', icon: <Gamepad2 className="size-4" />, permission: 'modes.manage', page: page(() => import('./Modes.tsx')) },
  { path: 'economy', label: 'Economy', icon: <BarChart3 className="size-4" />, permission: 'economy.view', page: page(() => import('./Economy.tsx')) },
  { path: 'catalog', label: 'Catalogue', icon: <Boxes className="size-4" />, permission: 'catalog.manage', page: page(() => import('./Catalog.tsx')) },
  { path: 'shop', label: 'Shop', icon: <ShoppingBag className="size-4" />, permission: 'shop.manage', page: page(() => import('./ShopAdmin.tsx')) },
  { path: 'events', label: 'Events', icon: <CalendarRange className="size-4" />, permission: 'events.manage', page: page(() => import('./Events.tsx')) },
  { path: 'flags', label: 'Feature flags', icon: <Flag className="size-4" />, permission: 'flags.manage', page: page(() => import('./Flags.tsx')) },
  { path: 'testing', label: 'Testing', icon: <FlaskConical className="size-4" />, permission: 'testing.tools', page: page(() => import('./Testing.tsx')) },
  { path: 'system', label: 'System health', icon: <Activity className="size-4" />, permission: 'system.view', page: page(() => import('./System.tsx')) },
  { path: 'audit', label: 'Audit log', icon: <ScrollText className="size-4" />, permission: 'audit.read', page: page(() => import('./Audit.tsx')) },
];

const ENV_NOTE: Record<string, { label: string; text: string; tone: string }> = {
  production: { label: 'Production', text: 'Changes here affect real players straight away. Every action is recorded in the audit log.', tone: 'border-ember/60 bg-ember/10' },
  sandbox: { label: 'Sandbox', text: 'A test copy of Ludora. Test tools and QA scenarios are switched on.', tone: 'border-lantern/60 bg-lantern/10' },
  development: { label: 'Development', text: 'Your local copy. Test tools and QA scenarios are switched on.', tone: 'border-lantern/60 bg-lantern/10' },
  test: { label: 'Test', text: 'Automated test environment.', tone: 'border-lantern/60 bg-lantern/10' },
};

/**
 * The staff area. The menu only lists what the signed-in person may use,
 * but that is a convenience: every staff endpoint checks its permission on
 * the server, so a hidden page is not a locked one and a visible page
 * cannot do more than the API allows.
 */
export default function StaffApp() {
  const me = useMe();
  if (me.isLoading) return <Spinner />;
  const perms = new Set(me.data?.permissions ?? []);
  if (!perms.has('staff.access')) {
    return (
      <EmptyState title="Staff only" action={<ButtonLink to="/" variant="primary">Back to Ludora</ButtonLink>}>
        This area is for Ludora staff. If you should have access, ask an administrator to give your account a staff role.
      </EmptyState>
    );
  }
  const sections = SECTIONS.filter((s) => perms.has(s.permission));
  const env = ENV_NOTE[me.data?.environment ?? 'development'] ?? ENV_NOTE.development!;
  return (
    <div className="flex flex-col gap-4">
      <div className={`rounded-[var(--radius-m)] border px-4 py-2.5 text-sm ${env.tone}`} role="note">
        <span className="font-semibold text-text">{env.label}.</span> <span className="text-text-2">{env.text}</span>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[208px_1fr]">
        <nav aria-label="Staff" className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <ul className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:thin] lg:flex-col lg:overflow-visible lg:pb-0">
            {sections.map((s) => (
              <li key={s.path} className="shrink-0">
                <NavLink
                  to={s.path ? `/staff/${s.path}` : '/staff'}
                  end={!s.path}
                  className={({ isActive }) =>
                    `flex h-9 items-center gap-2 rounded-[10px] px-3 text-sm font-semibold whitespace-nowrap transition-colors ${isActive ? 'bg-surface-2 text-text' : 'text-text-2 hover:bg-surface-2 hover:text-text'}`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span className={isActive ? 'text-lantern' : 'text-text-3'}>{s.icon}</span>
                      {s.label}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0">
          <Suspense fallback={<Spinner />}>
            <Routes>
              {sections.map((s) => {
                const Page = s.page;
                if (!s.path) return <Route key="index" index element={<Page />} />;
                return (
                  <Route key={s.path} path={s.path}>
                    <Route index element={<Page />} />
                    {(s.children ?? []).map((c) => {
                      const Child = c.page;
                      return <Route key={c.path} path={c.path} element={<Child />} />;
                    })}
                  </Route>
                );
              })}
              <Route path="*" element={<NoAccess />} />
            </Routes>
          </Suspense>
        </div>
      </div>
    </div>
  );
}

function NoAccess() {
  return (
    <EmptyState title="Not available to you" action={<ButtonLink to="/staff">Staff overview</ButtonLink>}>
      This staff page does not exist, or your role does not include it.
    </EmptyState>
  );
}
