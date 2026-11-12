import { Suspense, useEffect } from 'react';
import { createBrowserRouter, Outlet, ScrollRestoration, useRouteError, isRouteErrorResponse, Link } from 'react-router';
import { Shell } from './Shell.tsx';
import { PrefsSync } from './PrefsSync.tsx';
import { buttonClass } from '../ui/Button.tsx';
import { Stage } from '../ui/Stage.tsx';
import { LogoMark } from '../art/icons.tsx';
import { LoadingMark } from '../art/LoadingMark.tsx';
import { Glim } from '../art/glim/Glim.tsx';
import type { GlimArt } from '@ludora/shared';

/* The error page's Glims: one out looking for a missing page, one holding a spanner after a fault. */
const SEARCHER: GlimArt = { kind: 'glim', body: 'lantern', hue: 32, accentHue: 270, saturation: 84, eyes: 'curious', mouth: 'o', pattern: 'belly', topper: 'flame', cheeks: true, brows: 'surprised', tail: 'tassel' };
const MENDER: GlimArt = { kind: 'glim', body: 'box', hue: 212, accentHue: 44, saturation: 62, eyes: 'half', mouth: 'wobble', pattern: 'circuit', topper: 'bolt', cheeks: false, brows: 'soft' };

const page = (load: () => Promise<{ default: React.ComponentType }>) => async () => ({ Component: (await load()).default });

function Root() {
  return (
    <>
      <PrefsSync />
      <ScrollRestoration />
      <Suspense fallback={<LoadingMark />}>
        <Outlet />
      </Suspense>
    </>
  );
}

function RouteError() {
  const err = useRouteError();
  useEffect(() => {
    if (!(isRouteErrorResponse(err) && err.status === 404)) {
      // Report unexpected client errors so staff can see them in System health.
      void fetch('/api/client-errors', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-ludora-csrf': '1' },
        body: JSON.stringify({ message: String((err as Error)?.message ?? err).slice(0, 500), stack: String((err as Error)?.stack ?? '').slice(0, 3000), url: location.pathname }),
      }).catch(() => {});
    }
  }, [err]);
  const notFound = isRouteErrorResponse(err) && err.status === 404;
  // On the stage, which needs no theme: this page replaces everything, the theme sync included.
  return (
    <Stage as="main" className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 py-10 text-center">
      <div className="flex items-end gap-1" aria-hidden>
        <LogoMark size={44} />
        <Glim art={notFound ? SEARCHER : MENDER} size={120} pose={notFound ? 'wave' : 'idle'} uniform={false} className="shrink-0" />
      </div>
      <h1 className="font-display text-[2.6rem] leading-none font-bold sm:text-5xl">{notFound ? 'Page not found' : 'Something went wrong'}</h1>
      <p className="max-w-[46ch] text-lg text-text-2">
        {notFound
          ? 'The link may be old, or the page may have moved. Everything else is where you left it.'
          : 'Ludora hit a problem showing this page, and it has been reported. Your games, Glims and sets are safe. Reloading usually fixes it; if not, go back or start again from home.'}
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        {notFound ? (
          <Link to="/" className={buttonClass('primary', 'lg')}>
            Go home
          </Link>
        ) : (
          <>
            <button type="button" className={buttonClass('primary', 'lg')} onClick={() => location.reload()}>
              Reload the page
            </button>
            {history.length > 1 ? (
              <button type="button" className={buttonClass('secondary', 'lg')} onClick={() => history.back()}>
                Go back
              </button>
            ) : null}
            <Link to="/" className={buttonClass('secondary', 'lg')}>
              Go home
            </Link>
          </>
        )}
      </div>
      {notFound ? null : (
        <p className="max-w-[46ch] text-sm text-text-3">
          In a game? Reload the page to get back in while the game is still running.
        </p>
      )}
    </Stage>
  );
}

export const router = createBrowserRouter([
  {
    element: <Root />,
    errorElement: <RouteError />,
    // Shown while the first page's code loads; without it the router warns on every visit.
    hydrateFallbackElement: <LoadingMark label="Loading Ludora" />,
    children: [
      { path: 'signin', lazy: page(() => import('../features/auth/SignIn.tsx')) },
      { path: 'signup', lazy: page(() => import('../features/auth/SignUp.tsx')) },
      { path: 'recover', lazy: page(() => import('../features/auth/Recover.tsx')) },
      { path: 'play', lazy: page(() => import('../features/play/Join.tsx')) },
      { path: 'join/:code', lazy: page(() => import('../features/play/Join.tsx')) },
      { path: 'room/:code', lazy: page(() => import('../features/room/RoomPage.tsx')) },
      { path: 'school/watch/:code', lazy: page(() => import('../features/school/Watch.tsx')) },
      {
        element: <Shell />,
        children: [
          { index: true, lazy: page(() => import('../features/home/Home.tsx')) },
          { path: 'host', lazy: page(() => import('../features/host/HostSetup.tsx')) },
          { path: 'make/*', lazy: page(() => import('../features/making/MakeApp.tsx')) },
          { path: 'today', lazy: page(() => import('../features/making/Today.tsx')) },
          { path: 'lessons', lazy: page(() => import('../features/lessons/LessonsPage.tsx')) },
          { path: 'lessons/runs/:runId', lazy: page(() => import('../features/lessons/LessonReport.tsx')) },
          { path: 'lessons/:id', lazy: page(() => import('../features/lessons/LessonEditor.tsx')) },
          { path: 'lessons/:id/print', lazy: page(() => import('../features/lessons/LessonPrint.tsx')) },
          { path: 'modes', lazy: page(() => import('../features/modes/ModesPage.tsx')) },
          { path: 'modes/:id', lazy: page(() => import('../features/modes/ModeDetail.tsx')) },
          { path: 'library', lazy: page(() => import('../features/sets/Library.tsx')) },
          { path: 'sets/new', lazy: page(() => import('../features/sets/SetEditor.tsx')) },
          { path: 'sets/bin', lazy: page(() => import('../features/sets/Bin.tsx')) },
          { path: 'sets/shared/:token', lazy: page(() => import('../features/sets/SharedSet.tsx')) },
          { path: 'sets/:id/print', lazy: page(() => import('../features/sets/PrintSet.tsx')) },
          { path: 'sets/:id', lazy: page(() => import('../features/sets/SetDetail.tsx')) },
          { path: 'sets/:id/edit', lazy: page(() => import('../features/sets/SetEditor.tsx')) },
          { path: 'shop', lazy: page(() => import('../features/shop/Shop.tsx')) },
          { path: 'collection', lazy: page(() => import('../features/collection/Collection.tsx')) },
          { path: 'locker', lazy: page(() => import('../features/collection/Locker.tsx')) },
          { path: 'quests', lazy: page(() => import('../features/quests/Quests.tsx')) },
          { path: 'studio', lazy: page(() => import('../features/studio/Studio.tsx')) },
          { path: 'designs', lazy: page(() => import('../features/designs/DesignStudio.tsx')) },
          { path: 'games', lazy: page(() => import('../features/games/Games.tsx')) },
          { path: 'mode-studio', lazy: page(() => import('../features/modestudio/ModeStudioHome.tsx')) },
          { path: 'mode-studio/:id', lazy: page(() => import('../features/modestudio/ModeStudio.tsx')) },
          { path: 'profile/:id', lazy: page(() => import('../features/profile/Profile.tsx')) },
          { path: 'me', lazy: page(() => import('../features/profile/MyStats.tsx')) },
          { path: 'mistakes', lazy: page(() => import('../features/profile/Mistakes.tsx')) },
          { path: 'notifications', lazy: page(() => import('../features/social/Notifications.tsx')) },
          { path: 'collection/:id', lazy: page(() => import('../features/collection/GlimPage.tsx')) },
          { path: 'friends', lazy: page(() => import('../features/social/Friends.tsx')) },
          { path: 'classes', lazy: page(() => import('../features/classes/Classes.tsx')) },
          { path: 'classes/:id', lazy: page(() => import('../features/classes/ClassDetail.tsx')) },
          { path: 'classes/:id/assignments/:aid', lazy: page(() => import('../features/classes/AssignmentReport.tsx')) },
          { path: 'classes/:id/students/:uid', lazy: page(() => import('../features/classes/StudentReport.tsx')) },
          { path: 'classes/:id/tools', lazy: page(() => import('../features/classes/ClassTools.tsx')) },
          { path: 'leaderboards', lazy: page(() => import('../features/social/Leaderboards.tsx')) },
          { path: 'reports', lazy: page(() => import('../features/reports/HostedGames.tsx')) },
          { path: 'reports/term', lazy: page(() => import('../features/reports/TermOverview.tsx')) },
          { path: 'reports/data', lazy: page(() => import('../features/reports/ReportData.tsx')) },
          { path: 'reports/compare', lazy: page(() => import('../features/reports/Compare.tsx')) },
          { path: 'reports/sets/:setId', lazy: page(() => import('../features/reports/SetReport.tsx')) },
          { path: 'reports/students', lazy: page(() => import('../features/reports/Students.tsx')) },
          { path: 'reports/students/:key', lazy: page(() => import('../features/reports/Students.tsx').then((m) => ({ default: m.StudentAcross }))) },
          { path: 'reports/:gameId', lazy: page(() => import('../features/reports/GameReport.tsx')) },
          { path: 'school', lazy: page(() => import('../features/school/SchoolPage.tsx')) },
          { path: 'school/manage', lazy: page(() => import('../features/school/Manage.tsx')) },
          { path: 'school/classes', lazy: page(() => import('../features/school/TeachClasses.tsx')) },
          { path: 'school/classes/:id', lazy: page(() => import('../features/school/ClassHouses.tsx')) },
          { path: 'school/tournaments/:id', lazy: page(() => import('../features/school/TournamentPage.tsx')) },
          { path: 'settings', lazy: page(() => import('../features/settings/Settings.tsx')) },
          { path: 'privacy', lazy: page(() => import('../features/legal/Privacy.tsx')) },
          { path: 'terms', lazy: page(() => import('../features/legal/Terms.tsx')) },
          { path: 'staff/*', lazy: page(() => import('../features/admin/StaffApp.tsx')) },
          { path: '*', lazy: page(() => import('../features/errors/NotFound.tsx')) },
        ],
      },
    ],
  },
]);
