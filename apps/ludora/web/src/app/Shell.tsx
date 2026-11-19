import { useId, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { DropdownMenu, Dialog as RDialog } from 'radix-ui';
import { useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  BookOpen,
  Brush,
  Castle,
  Gamepad2,
  Home,
  LayoutGrid,
  LogOut,
  Menu,
  Palette,
  Presentation,
  RefreshCw,
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
  Wallet,
  Wand2,
  X,
  ListOrdered,
} from 'lucide-react';
import { PencilRuler } from 'lucide-react';
import { useMe } from '../lib/session.ts';
import { useOverview } from '../lib/queries.ts';
import { api } from '../lib/api.ts';
import { Logo, LogoMark, SchoolCrest, SchoolLogo } from '../art/icons.tsx';
import { Glim } from '../art/glim/Glim.tsx';
import { Amount, Skeleton } from '../ui/primitives.tsx';
import { Button, buttonClass } from '../ui/Button.tsx';
import { toast } from 'sonner';
import { NotificationBell } from '../features/social/NotificationBell.tsx';
import { SearchLauncher } from '../features/search/SearchLauncher.tsx';
import { useSchool } from '../features/school/schoolData.ts';
import { SectionBoundary } from '../ui/SectionBoundary.tsx';
import { WhatsNewButton } from '../features/whatsnew/WhatsNew.tsx';
import { OfflineBanner } from './OfflineBanner.tsx';

/*
 * The frame around every page: the sidebar, the header and the phone's bottom
 * bar sit on the stage in both themes, like the chrome of a broadcast, so a
 * stage hero runs straight on from the header. The page itself follows the
 * theme. The current section is marked by a gold bar as well as its fill.
 *
 * Every section says what you do there: its name, and under it a short line in
 * words a nine-year-old knows (D59). The line is the link's description, not
 * part of its name, so a screen reader says "Game Maker, link, Invent a game
 * with code", and tests still find the link by its name.
 */

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  /** What you do there, in a few plain words, shown under the name. */
  hint?: string;
  end?: boolean;
  /** 'school' shows once this copy has houses, and before that to the people who can set them up. */
  show?: 'signedIn' | 'staff' | 'studio' | 'school' | 'teacher';
  /** Hidden while this feature flag is off for the viewer. */
  flag?: string;
  /** Left out of the desktop sidebar because the header already holds it there (the balances open the Wallet). */
  narrowOnly?: boolean;
}

const PRIMARY: NavItem[] = [
  { to: '/', label: 'Home', icon: <Home className="size-5" />, hint: 'Your start page', end: true },
];
const PLAY: NavItem[] = [
  { to: '/play', label: 'Join a game', icon: <Gamepad2 className="size-5" />, hint: 'Type the code from the board' },
  { to: '/host', label: 'Host a game', icon: <Presentation className="size-5" />, hint: 'Put a code on the board' },
  { to: '/modes', label: 'Game modes', icon: <LayoutGrid className="size-5" />, hint: 'All the ways to play' },
];
const MAKE: NavItem[] = [
  { to: '/make', label: 'Make', icon: <PencilRuler className="size-5" />, hint: 'Start here to make anything', show: 'signedIn' },
  { to: '/library', label: 'Question sets', icon: <BookOpen className="size-5" />, hint: 'Find a quiz or write one' },
  { to: '/game-maker', label: 'Game Maker', icon: <Wand2 className="size-5" />, hint: 'Invent a game with code' },
  { to: '/lessons', label: 'Lessons', icon: <ListOrdered className="size-5" />, hint: 'Plan several games in a row', show: 'teacher' },
];
const COLLECT: NavItem[] = [
  { to: '/collection', label: 'Collection', icon: <Sparkles className="size-5" />, hint: 'All the Glims you have found', show: 'signedIn' },
  { to: '/shop', label: 'Shop', icon: <ShoppingBag className="size-5" />, hint: 'Spend what you earn playing', show: 'signedIn' },
  { to: '/wallet', label: 'Wallet', icon: <Wallet className="size-5" />, hint: 'Your Sparks, in and out', show: 'signedIn', narrowOnly: true },
  { to: '/locker', label: 'Locker', icon: <Shirt className="size-5" />, hint: 'Dress up your buddy', show: 'signedIn' },
  { to: '/designs', label: 'My designs', icon: <Brush className="size-5" />, hint: 'Draw a Glim of your own', show: 'signedIn' },
  { to: '/quests', label: 'Quests', icon: <Target className="size-5" />, hint: 'Goals that win rewards', show: 'signedIn' },
];
const SOCIAL: NavItem[] = [
  { to: '/friends', label: 'Friends', icon: <Users className="size-5" />, hint: 'Play with people you know', show: 'signedIn', flag: 'social.friends' },
  { to: '/classes', label: 'Classes', icon: <School className="size-5" />, hint: 'Your classes and homework', show: 'signedIn' },
  { to: '/school', label: 'School', icon: <Castle className="size-5" />, hint: 'Houses and house points', show: 'school' },
  { to: '/leaderboards', label: 'Leaderboards', icon: <Trophy className="size-5" />, hint: 'See who is on top', show: 'signedIn' },
  { to: '/studio', label: 'Creator Studio', icon: <Palette className="size-5" />, hint: 'Make Glims for the shop', show: 'studio' },
  { to: '/staff', label: 'Staff', icon: <Shield className="size-5" />, hint: 'Tools to run Ludora', show: 'staff' },
];
const SETTINGS: NavItem = { to: '/settings', label: 'Settings', icon: <Settings className="size-5" />, hint: 'Sound, reading help and more' };

/** Headings in plain words, by what you do there. The first group (Home) has none. */
const GROUPS: [string | null, NavItem[]][] = [
  [null, PRIMARY],
  ['Play', PLAY],
  ['Make things', MAKE],
  ['Glims and rewards', COLLECT],
  ['With others', SOCIAL],
];

/** The phone's bottom bar: short names for sections the More sheet lists in full. */
const MOBILE: NavItem[] = [
  { to: '/', label: 'Home', icon: <Home className="size-5" />, end: true },
  { to: '/play', label: 'Join', icon: <Gamepad2 className="size-5" /> },
  { to: '/host', label: 'Host', icon: <Presentation className="size-5" /> },
  { to: '/collection', label: 'Glims', icon: <Sparkles className="size-5" /> },
];

/** A section link on the stage: its name and, under it, what you do there. 48px tall in the phone menu, 38px in the sidebar. */
function NavLinkItem({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const hintId = useId();
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      aria-describedby={item.hint ? hintId : undefined}
      className={({ isActive }) =>
        `relative flex min-h-12 items-center gap-3 rounded-[var(--radius-m)] px-3 py-1 transition-colors lg:min-h-[38px] lg:py-0.5 ${isActive ? 'bg-white/[0.12] text-text' : 'text-text-2 hover:bg-white/[0.06] hover:text-text'}`
      }
    >
      {({ isActive }) => (
        <>
          {isActive ? <span className="absolute inset-y-2 left-0 w-1 rounded-r-[3px] bg-lantern" aria-hidden /> : null}
          <span className={`shrink-0 ${isActive ? 'text-lantern' : 'text-text-3'}`}>{item.icon}</span>
          <span className="flex min-w-0 flex-col">
            <span className="text-[15px] leading-[18px] font-semibold">{item.label}</span>
            {/* Left out of the link's name and read as its description: aria-describedby still reads a hidden element. */}
            {item.hint ? (
              <span id={hintId} aria-hidden className={`truncate text-[12.5px] leading-[15px] ${isActive ? 'text-text-2' : 'text-text-3'}`}>
                {item.hint}
              </span>
            ) : null}
          </span>
        </>
      )}
    </NavLink>
  );
}

/**
 * Settings in the sidebar: the gear at the logo's right, named "Settings" for screen readers and in
 * its tooltip. There is no room beside the logo for the word; the account menu and the phone's More
 * sheet name it in full. The current page gets the same fill and gold as a section.
 */
function SettingsChip() {
  return (
    <NavLink
      to={SETTINGS.to}
      aria-label={SETTINGS.label}
      title={`${SETTINGS.label}: ${SETTINGS.hint}`}
      className={({ isActive }) =>
        `absolute top-0 right-0 grid size-10 place-items-center overflow-hidden rounded-full border transition-colors ${isActive ? 'border-transparent bg-white/[0.12] text-lantern' : 'border-white/15 text-text-2 hover:bg-white/[0.06] hover:text-text'}`
      }
    >
      {({ isActive }) => (
        <>
          {isActive ? <span className="absolute inset-x-3 bottom-1 h-[3px] rounded-full bg-lantern" aria-hidden /> : null}
          <Settings className="size-5" aria-hidden />
        </>
      )}
    </NavLink>
  );
}

function NavGroups({ onNavigate }: { onNavigate?: () => void }) {
  const me = useMe();
  const signedIn = Boolean(me.data?.user);
  const staff = Boolean(me.data?.permissions.includes('staff.access'));
  const studio = Boolean(me.data?.permissions.includes('studio.use'));
  const school = useSchool();
  const groupId = useId();
  const hasSchool = Boolean(school.data && (school.data.houses.length > 0 || school.data.can.manage || school.data.can.viewUsage));
  const flagOn = (key?: string) => !key || me.data?.flags?.[key] !== false;
  const visible = (i: NavItem) => flagOn(i.flag) && (!i.show || (i.show === 'signedIn' ? signedIn : i.show === 'teacher' ? me.data?.user?.accountType === 'teacher' : i.show === 'studio' ? studio : i.show === 'school' ? hasSchool : staff));
  return (
    <nav aria-label="Main" className="flex flex-col gap-4 lg:gap-2">
      {GROUPS.map(([title, all], g) => [title, all.filter(visible), g] as const)
        .filter(([, items]) => items.length)
        .map(([title, items, g]) => (
          // Each group is a list named by its heading. The heading is not a page heading, so it adds nothing to a page's outline.
          <div key={title ?? 'main'} className="flex flex-col">
            {title ? (
              <div id={`${groupId}-${g}`} className="px-3 pb-0.5 text-xs leading-4 font-semibold text-text-3">
                {title}
              </div>
            ) : null}
            <ul className="flex flex-col gap-px" aria-labelledby={title ? `${groupId}-${g}` : undefined}>
              {items.map((i) => (
                <li key={i.to} className={i.narrowOnly ? 'lg:hidden' : undefined}>
                  <NavLinkItem item={i} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          </div>
        ))}
    </nav>
  );
}

function EnvironmentBadge() {
  const me = useMe();
  const env = me.data?.environment;
  if (!env || env === 'production') return null;
  // Signed out on a phone the header already holds the logo, a school's crest, search, Sign in and
  // Create account; the badge is about test balances, which a signed-out visitor does not have.
  const tight = me.data?.user ? '' : 'max-sm:hidden';
  return (
    <span className={`rounded-[var(--radius-s)] border border-dashed border-lantern/80 px-2 py-0.5 text-xs font-bold text-lantern ${tight}`} title="Test environment: balances and test tools here do not affect the live game.">
      {env === 'sandbox' ? 'Sandbox' : env === 'development' ? 'Dev' : env}
    </span>
  );
}

const MENU_ITEM = 'flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[var(--radius-m)] px-3 text-sm font-semibold outline-none data-[highlighted]:bg-surface-2';

function AccountMenu() {
  const me = useMe();
  const overview = useOverview();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const user = me.data?.user;
  // Signing in or up from the header comes back to this page, not to home.
  const here = `${location.pathname}${location.search}`;
  const back = here === '/' ? '' : `?next=${encodeURIComponent(here)}`;
  // Until the account check answers, the header stays neutral: a signed-in player never sees the signed-out buttons.
  if (!me.data) {
    if (me.isError) {
      return (
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-text-2 md:inline">Your account did not load.</span>
          <Button size="sm" icon={<RefreshCw className="size-4" aria-hidden />} loading={me.isFetching} onClick={() => void me.refetch()}>
            Try again
          </Button>
        </div>
      );
    }
    return <Skeleton className="h-11 w-24 rounded-full sm:w-44" />;
  }
  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Link to={`/signin${back}`} className={buttonClass('ghost', 'sm')}>
          Sign in
        </Link>
        <Link to={`/signup${back}`} className={buttonClass('primary', 'sm')}>
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
    // Not modal: the menu keeps focus while open without hiding the page from assistive technology behind it.
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger className="flex h-11 items-center gap-2 rounded-full border border-line bg-raised pr-2 pl-1 hover:bg-surface-2 sm:pr-3" aria-label={`${user.displayName}, Lv ${user.level.level}, account menu`}>
        <span className="grid size-9 place-items-center overflow-hidden rounded-full bg-surface-3">{avatar ? <Glim art={avatar.art} accessories={avatar.accessories} dress={avatar.uniform ?? null} rarity={avatar.rarity} size={38} /> : <User className="size-4" />}</span>
        {/* The space keeps the visible "Name Lv 1" readable as words, so it matches the label (WCAG 2.5.3). */}
        <span className="hidden max-w-[10rem] truncate text-sm font-semibold sm:block">{user.displayName}</span>{' '}
        {/* The player's level on gold, like a HUD: ink on gold is 11:1. */}
        <span className="rounded-[var(--radius-s)] bg-lantern px-1.5 font-display text-[15px] leading-6 font-bold text-on-accent tabular">Lv {user.level.level}</span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} className="z-50 min-w-60 rounded-[var(--radius-l)] border border-line bg-raised p-1.5 shadow-[0_18px_40px_-12px_rgb(2_5_20/0.6)]">
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
            <DropdownMenu.Item key={i.to} onSelect={() => navigate(i.to)} className={`${MENU_ITEM} text-text-2 data-[highlighted]:text-text`}>
              {i.icon}
              {i.label}
            </DropdownMenu.Item>
          ))}
          {user.isGuest ? (
            <DropdownMenu.Item onSelect={() => navigate('/signup')} className={`${MENU_ITEM} text-lantern`}>
              <Sparkles className="size-4" />
              Save progress with an account
            </DropdownMenu.Item>
          ) : null}
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item onSelect={() => void signOut()} className={`${MENU_ITEM} text-text-2 data-[highlighted]:text-text`}>
            <LogOut className="size-4" />
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function Balances() {
  const me = useMe();
  const overview = useOverview();
  const b = overview.data?.balances;
  if (!me.data?.user) return null;
  // Never zeros it does not know: a placeholder while loading, and nothing if the load failed.
  if (!b) return overview.isLoading ? <Skeleton className="hidden h-11 w-36 rounded-[var(--radius-m)] sm:block" /> : null;
  return (
    // A HUD readout of the two currencies, and the way into the Wallet on a wide screen. The name comes from the numbers shown, with the currency names added for screen readers (WCAG 2.5.3).
    <Link to="/wallet" title="Your wallet" className="hidden h-11 items-center gap-3.5 rounded-[var(--radius-m)] border border-line bg-raised px-3 text-text no-underline hover:bg-surface-2 sm:flex">
      <Amount currency="sparks" value={b.sparks ?? 0} />
      <span className="sr-only"> Sparks and </span>
      <Amount currency="moonstones" value={b.moonstones ?? 0} />
      <span className="sr-only"> Moonstones. Open your wallet</span>
    </Link>
  );
}

export function Shell() {
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-[var(--radius-s)] focus:bg-lantern focus:px-3 focus:py-2 focus:font-semibold focus:text-on-accent">
        Skip to content
      </a>
      <aside className="stage-plain on-stage sticky top-0 hidden h-dvh flex-col gap-4 overflow-y-auto border-r border-white/[0.06] px-3 py-3.5 lg:flex">
        {/* Settings sits beside the logo, so the sections below fit a 768px-tall laptop without scrolling (D59). */}
        <div className="relative">
          <Link to="/" className="inline-flex rounded-[var(--radius-s)] px-2" aria-label="Ludora home">
            {/* On a school's copy its logo starts the header beside this (D60), so the sidebar fits as in Ludora's own look. */}
            <Logo size={26} school={false} />
          </Link>
          <SettingsChip />
        </div>
        <NavGroups />
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* On the stage in both themes, the same navy as the top of the sidebar, so the chrome reads as one frame. */}
        <header className="on-stage chrome-bar sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-white/10 bg-[color-mix(in_oklab,var(--stage-1)_96%,transparent)] px-4 backdrop-blur-sm sm:px-6">
          <Link to="/" className="flex items-center gap-2 rounded-[var(--radius-s)] lg:hidden" aria-label="Ludora home">
            <LogoMark size={34} />
            <SchoolCrest size={30} />
          </Link>
          {/* A school's copy: its colour logo starts the header on a wide screen, level with Ludora's mark in the sidebar. */}
          <SchoolLogo height={38} className="hidden lg:inline-flex" />
          <EnvironmentBadge />
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <SearchLauncher />
            <WhatsNewButton />
            <Balances />
            <NotificationBell />
            <AccountMenu />
          </div>
        </header>
        <OfflineBanner />
        <main id="main" key={location.pathname.split('/')[1]} className="mx-auto w-full max-w-[1200px] flex-1 px-4 pt-6 pb-10 sm:px-6">
          <SectionBoundary name="this page" resetKey={location.pathname}>
            <Outlet />
          </SectionBoundary>
        </main>
        {/* Clear of the phone's bottom bar. */}
        <footer className="mx-auto flex w-full max-w-[1200px] flex-wrap gap-x-5 gap-y-2 px-4 pb-28 text-sm text-text-3 sm:px-6 lg:pb-8">
          <Link to="/privacy" className="hover:text-text">
            Privacy policy
          </Link>
          <Link to="/terms" className="hover:text-text">
            Terms of use
          </Link>
        </footer>
      </div>

      <nav aria-label="Quick" className="stage-plain on-stage fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-white/10 pb-[env(safe-area-inset-bottom)] lg:hidden">
        {MOBILE.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => `relative flex min-h-14 flex-col items-center justify-center gap-0.5 py-2 text-xs font-semibold ${isActive ? 'text-lantern' : 'text-text-2 hover:text-text'}`}>
            {({ isActive }) => (
              <>
                {/* The current section: a gold bar along the top edge, as well as the gold label. */}
                {isActive ? <span className="absolute inset-x-3 top-0 h-[3px] rounded-b-[3px] bg-lantern" aria-hidden /> : null}
                <span className="grid h-7 place-items-center">{i.icon}</span>
                {i.label}
              </>
            )}
          </NavLink>
        ))}
        <RDialog.Root open={moreOpen} onOpenChange={setMoreOpen}>
          <RDialog.Trigger className="flex min-h-14 flex-col items-center justify-center gap-0.5 py-2 text-xs font-semibold text-text-2 hover:text-text">
            <span className="grid h-7 place-items-center">
              <Menu className="size-5" />
            </span>
            More
          </RDialog.Trigger>
          <RDialog.Portal>
            <RDialog.Overlay className="fixed inset-0 z-40 bg-[var(--scrim)]" />
            {/* The sheet rises from the bottom bar and keeps its stage colours. */}
            <RDialog.Content className="stage-plain on-stage fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-[var(--radius-l)] border-t border-white/10 p-4 pb-[calc(16px+env(safe-area-inset-bottom))] focus:outline-none">
              <div className="mb-3 flex items-center justify-between">
                <RDialog.Title className="px-1 font-display text-2xl font-bold">Menu</RDialog.Title>
                <RDialog.Close className="-mr-1 grid size-11 place-items-center rounded-[var(--radius-m)] text-text-3 hover:bg-white/[0.08] hover:text-text" aria-label="Close">
                  <X className="size-5" />
                </RDialog.Close>
              </div>
              <RDialog.Description className="sr-only">All sections of Ludora</RDialog.Description>
              <NavGroups onNavigate={() => setMoreOpen(false)} />
              <div className="mt-4">
                <NavLinkItem item={SETTINGS} onNavigate={() => setMoreOpen(false)} />
              </div>
            </RDialog.Content>
          </RDialog.Portal>
        </RDialog.Root>
      </nav>
    </div>
  );
}
