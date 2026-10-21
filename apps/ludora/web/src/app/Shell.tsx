import { useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { DropdownMenu, Dialog as RDialog } from 'radix-ui';
import { useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  BookOpen,
  Gamepad2,
  Home,
  LayoutGrid,
  LogOut,
  Menu,
  Presentation,
  School,
  Settings,
  Shield,
  ShoppingBag,
  Shirt,
  Sparkles,
  Swords,
  Target,
  Trophy,
  User,
  Users,
  X,
} from 'lucide-react';
import { useMe } from '../lib/session.ts';
import { useOverview } from '../lib/queries.ts';
import { api } from '../lib/api.ts';
import { Logo, LogoMark } from '../art/icons.tsx';
import { Glim } from '../art/glim/Glim.tsx';
import { Amount } from '../ui/primitives.tsx';
import { buttonClass } from '../ui/Button.tsx';
import { toast } from 'sonner';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
  show?: 'signedIn' | 'staff';
  /** Hidden while this feature flag is off for the viewer. */
  flag?: string;
}

const PRIMARY: NavItem[] = [
  { to: '/', label: 'Home', icon: <Home className="size-5" />, end: true },
  { to: '/play', label: 'Join a game', icon: <Gamepad2 className="size-5" /> },
  { to: '/host', label: 'Host', icon: <Presentation className="size-5" /> },
  { to: '/modes', label: 'Game modes', icon: <LayoutGrid className="size-5" /> },
  { to: '/library', label: 'Question sets', icon: <BookOpen className="size-5" /> },
];
const COLLECT: NavItem[] = [
  { to: '/collection', label: 'Collection', icon: <Sparkles className="size-5" />, show: 'signedIn' },
  { to: '/shop', label: 'Shop', icon: <ShoppingBag className="size-5" />, show: 'signedIn' },
  { to: '/locker', label: 'Locker', icon: <Shirt className="size-5" />, show: 'signedIn' },
  { to: '/quests', label: 'Quests', icon: <Target className="size-5" />, show: 'signedIn' },
];
const SOCIAL: NavItem[] = [
  { to: '/friends', label: 'Friends', icon: <Users className="size-5" />, show: 'signedIn', flag: 'social.friends' },
  { to: '/classes', label: 'Classes', icon: <School className="size-5" />, show: 'signedIn' },
  { to: '/leaderboards', label: 'Leaderboards', icon: <Trophy className="size-5" />, show: 'signedIn' },
  { to: '/staff', label: 'Staff', icon: <Shield className="size-5" />, show: 'staff' },
];

const MOBILE: NavItem[] = [
  { to: '/', label: 'Home', icon: <Home className="size-5" />, end: true },
  { to: '/play', label: 'Join', icon: <Gamepad2 className="size-5" /> },
  { to: '/host', label: 'Host', icon: <Presentation className="size-5" /> },
  { to: '/collection', label: 'Glims', icon: <Sparkles className="size-5" /> },
];

function NavLinkItem({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        `relative flex h-10 items-center gap-3 rounded-[12px] px-3 text-[15px] font-semibold transition-colors ${isActive ? 'bg-lantern text-on-accent shadow-[0_3px_0_var(--ink)]' : 'text-text-2 hover:bg-surface-2 hover:text-text'}`
      }
    >
      {({ isActive }) => (
        <>
          <span className={isActive ? 'text-on-accent' : 'text-text-3'}>{item.icon}</span>
          {item.label}
        </>
      )}
    </NavLink>
  );
}

function NavGroups({ onNavigate }: { onNavigate?: () => void }) {
  const me = useMe();
  const signedIn = Boolean(me.data?.user);
  const staff = Boolean(me.data?.permissions.includes('staff.access'));
  const flagOn = (key?: string) => !key || me.data?.flags?.[key] !== false;
  const visible = (i: NavItem) => flagOn(i.flag) && (!i.show || (i.show === 'signedIn' ? signedIn : staff));
  const groups: [string | null, NavItem[]][] = [
    [null, PRIMARY],
    ['Collect', COLLECT.filter(visible)],
    ['Together', SOCIAL.filter(visible)],
  ];
  return (
    <nav aria-label="Main" className="flex flex-col gap-5">
      {groups
        .filter(([, items]) => items.length)
        .map(([title, items]) => (
          <div key={title ?? 'main'} className="flex flex-col gap-0.5">
            {title ? <div className="px-3 pb-1 text-xs font-semibold text-text-3">{title}</div> : null}
            {items.map((i) => (
              <NavLinkItem key={i.to} item={i} onNavigate={onNavigate} />
            ))}
          </div>
        ))}
    </nav>
  );
}

function EnvironmentBadge() {
  const me = useMe();
  const env = me.data?.environment;
  if (!env || env === 'production') return null;
  return (
    <span className="rounded-full border-2 border-dashed border-lantern px-2 py-0.5 text-xs font-bold text-lantern" title="Test environment: balances and test tools here do not affect the live game.">
      {env === 'sandbox' ? 'Sandbox' : env === 'development' ? 'Dev' : env}
    </span>
  );
}

function AccountMenu() {
  const me = useMe();
  const overview = useOverview();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = me.data?.user;
  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Link to="/signin" className={buttonClass('ghost', 'sm')}>
          Sign in
        </Link>
        <Link to="/signup" className={buttonClass('primary', 'sm')}>
          Create account
        </Link>
      </div>
    );
  }
  const signOut = async () => {
    await api.post('/api/auth/logout');
    await qc.invalidateQueries();
    toast.success('Signed out');
    navigate('/');
  };
  const avatar = overview.data?.avatar;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex items-center gap-2 rounded-full border border-line bg-raised py-1 pr-3 pl-1 hover:bg-surface-2" aria-label={`${user.displayName}, Lv ${user.level.level}, account menu`}>
        <span className="grid size-8 place-items-center overflow-hidden rounded-full bg-surface-3">{avatar ? <Glim art={avatar.art} accessories={avatar.accessories} rarity={avatar.rarity} size={34} /> : <User className="size-4" />}</span>
        <span className="hidden max-w-[10rem] truncate text-sm font-semibold sm:block">{user.displayName}</span>
        <span className="rounded-full bg-dusk/25 px-1.5 text-xs font-bold text-link tabular">Lv {user.level.level}</span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} className="z-50 min-w-56 rounded-[14px] border border-line bg-raised p-1.5 shadow-xl">
          <div className="px-3 py-2">
            <div className="font-semibold">{user.displayName}</div>
            <div className="text-xs text-text-3">{user.isGuest ? 'Guest account' : `@${user.username}`}</div>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          {[
            { to: `/profile/${user.id}`, label: 'Profile', icon: <User className="size-4" /> },
            { to: '/me', label: 'My stats', icon: <Swords className="size-4" /> },
            { to: '/reports', label: 'Games I hosted', icon: <BarChart3 className="size-4" /> },
            { to: '/locker', label: 'Locker', icon: <Shirt className="size-4" /> },
            { to: '/settings', label: 'Settings', icon: <Settings className="size-4" /> },
          ].map((i) => (
            <DropdownMenu.Item key={i.to} onSelect={() => navigate(i.to)} className="flex cursor-pointer items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm font-semibold text-text-2 outline-none data-[highlighted]:bg-surface-2 data-[highlighted]:text-text">
              {i.icon}
              {i.label}
            </DropdownMenu.Item>
          ))}
          {user.isGuest ? (
            <DropdownMenu.Item onSelect={() => navigate('/signup')} className="flex cursor-pointer items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm font-semibold text-lantern outline-none data-[highlighted]:bg-surface-2">
              <Sparkles className="size-4" />
              Save progress with an account
            </DropdownMenu.Item>
          ) : null}
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item onSelect={() => void signOut()} className="flex cursor-pointer items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm font-semibold text-text-2 outline-none data-[highlighted]:bg-surface-2 data-[highlighted]:text-text">
            <LogOut className="size-4" />
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function Balances() {
  const overview = useOverview();
  const b = overview.data?.balances;
  if (!b) return null;
  return (
    <Link to="/shop" className="hidden items-center gap-3 rounded-full border border-line bg-raised px-3 py-1.5 hover:bg-surface-2 sm:flex" aria-label={`${b.sparks ?? 0} Sparks and ${b.moonstones ?? 0} Moonstones. Open the shop`}>
      <Amount currency="sparks" value={b.sparks ?? 0} size="sm" />
      <Amount currency="moonstones" value={b.moonstones ?? 0} size="sm" />
    </Link>
  );
}

export function Shell() {
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-lantern focus:px-3 focus:py-2 focus:text-on-accent">
        Skip to content
      </a>
      <aside className="stage-plain on-stage sticky top-0 hidden h-dvh flex-col gap-6 overflow-y-auto px-3 py-5 lg:flex">
        <Link to="/" className="px-2" aria-label="Ludora home">
          <Logo size={26} />
        </Link>
        <NavGroups />
        <div className="mt-auto flex flex-col gap-0.5">
          <NavLinkItem item={{ to: '/settings', label: 'Settings', icon: <Settings className="size-5" /> }} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-bg/90 px-4 backdrop-blur-sm sm:px-6">
          <Link to="/" className="lg:hidden" aria-label="Ludora home">
            <LogoMark size={34} />
          </Link>
          <EnvironmentBadge />
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <Balances />
            <AccountMenu />
          </div>
        </header>
        <main id="main" key={location.pathname.split('/')[1]} className="mx-auto w-full max-w-[1200px] flex-1 px-4 pt-6 pb-28 sm:px-6 lg:pb-12">
          <Outlet />
        </main>
      </div>

      <nav aria-label="Quick" className="stage-plain on-stage fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 pb-[env(safe-area-inset-bottom)] lg:hidden">
        {MOBILE.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${isActive ? 'text-lantern' : 'text-text-2'}`}>
            {({ isActive }) => (
              <>
                <span className={`grid h-7 w-12 place-items-center rounded-full transition-colors ${isActive ? 'bg-lantern text-on-accent' : ''}`}>{i.icon}</span>
                {i.label}
              </>
            )}
          </NavLink>
        ))}
        <RDialog.Root open={moreOpen} onOpenChange={setMoreOpen}>
          <RDialog.Trigger className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold text-text-2">
            <span className="grid h-7 w-12 place-items-center">
              <Menu className="size-5" />
            </span>
            More
          </RDialog.Trigger>
          <RDialog.Portal>
            <RDialog.Overlay className="fixed inset-0 z-40 bg-[var(--scrim)]" />
            <RDialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-[22px] border-t border-line bg-raised p-4 pb-[calc(16px+env(safe-area-inset-bottom))] focus:outline-none">
              <div className="mb-3 flex items-center justify-between">
                <RDialog.Title className="font-display text-lg font-bold">Everything</RDialog.Title>
                <RDialog.Close className="rounded-[10px] p-2 text-text-3 hover:bg-surface-2" aria-label="Close">
                  <X className="size-5" />
                </RDialog.Close>
              </div>
              <RDialog.Description className="sr-only">All sections of Ludora</RDialog.Description>
              <NavGroups onNavigate={() => setMoreOpen(false)} />
              <div className="mt-4">
                <NavLinkItem item={{ to: '/settings', label: 'Settings', icon: <Settings className="size-5" /> }} onNavigate={() => setMoreOpen(false)} />
              </div>
            </RDialog.Content>
          </RDialog.Portal>
        </RDialog.Root>
      </nav>
    </div>
  );
}
