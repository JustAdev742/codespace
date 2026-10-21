import { Suspense, useEffect } from 'react';
import { createBrowserRouter, Outlet, ScrollRestoration, useRouteError, isRouteErrorResponse, Link } from 'react-router';
import { Shell } from './Shell.tsx';
import { PrefsSync } from './PrefsSync.tsx';
import { Spinner } from '../ui/primitives.tsx';
import { buttonClass } from '../ui/Button.tsx';
import { LogoMark } from '../art/icons.tsx';

const page = (load: () => Promise<{ default: React.ComponentType }>) => async () => ({ Component: (await load()).default });

function Root() {
  return (
    <>
      <PrefsSync />
      <ScrollRestoration />
      <Suspense fallback={<Spinner />}>
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
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <LogoMark size={64} />
      <h1 className="font-display text-3xl font-extrabold">{notFound ? 'Nothing here' : 'That page tripped over'}</h1>
      <p className="text-text-2">{notFound ? 'The link may be old, or the page has moved.' : 'Something went wrong while showing this page. Reloading usually fixes it.'}</p>
      <div className="flex gap-2">
        <Link to="/" className={buttonClass('primary', 'lg')}>
          Go home
        </Link>
        {!notFound ? (
          <button type="button" className={buttonClass('secondary', 'lg')} onClick={() => location.reload()}>
            Reload
          </button>
        ) : null}
      </div>
    </main>
  );
}

export const router = createBrowserRouter([
  {
    element: <Root />,
    errorElement: <RouteError />,
    // Shown while the first page's code loads; without it the router warns on every visit.
    hydrateFallbackElement: <Spinner label="Loading Ludora" />,
    children: [
      { path: 'signin', lazy: page(() => import('../features/auth/SignIn.tsx')) },
      { path: 'signup', lazy: page(() => import('../features/auth/SignUp.tsx')) },
      { path: 'recover', lazy: page(() => import('../features/auth/Recover.tsx')) },
      { path: 'play', lazy: page(() => import('../features/play/Join.tsx')) },
      { path: 'join/:code', lazy: page(() => import('../features/play/Join.tsx')) },
      { path: 'room/:code', lazy: page(() => import('../features/room/RoomPage.tsx')) },
      {
        element: <Shell />,
        children: [
          { index: true, lazy: page(() => import('../features/home/Home.tsx')) },
          { path: 'host', lazy: page(() => import('../features/host/HostSetup.tsx')) },
          { path: 'modes', lazy: page(() => import('../features/modes/ModesPage.tsx')) },
          { path: 'modes/:id', lazy: page(() => import('../features/modes/ModeDetail.tsx')) },
          { path: 'library', lazy: page(() => import('../features/sets/Library.tsx')) },
          { path: 'sets/new', lazy: page(() => import('../features/sets/SetEditor.tsx')) },
          { path: 'sets/:id', lazy: page(() => import('../features/sets/SetDetail.tsx')) },
          { path: 'sets/:id/edit', lazy: page(() => import('../features/sets/SetEditor.tsx')) },
          { path: 'shop', lazy: page(() => import('../features/shop/Shop.tsx')) },
          { path: 'collection', lazy: page(() => import('../features/collection/Collection.tsx')) },
          { path: 'locker', lazy: page(() => import('../features/collection/Locker.tsx')) },
          { path: 'quests', lazy: page(() => import('../features/quests/Quests.tsx')) },
          { path: 'profile/:id', lazy: page(() => import('../features/profile/Profile.tsx')) },
          { path: 'me', lazy: page(() => import('../features/profile/MyStats.tsx')) },
          { path: 'friends', lazy: page(() => import('../features/social/Friends.tsx')) },
          { path: 'classes', lazy: page(() => import('../features/classes/Classes.tsx')) },
          { path: 'classes/:id', lazy: page(() => import('../features/classes/ClassDetail.tsx')) },
          { path: 'settings', lazy: page(() => import('../features/settings/Settings.tsx')) },
          { path: 'staff/*', lazy: page(() => import('../features/admin/StaffApp.tsx')) },
          { path: '*', lazy: page(() => import('../features/errors/NotFound.tsx')) },
        ],
      },
    ],
  },
]);
