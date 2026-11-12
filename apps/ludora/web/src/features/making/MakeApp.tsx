import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { LoadingMark } from '../../art/LoadingMark.tsx';
import NotFound from '../errors/NotFound.tsx';
import MakePage from './MakePage.tsx';

/* /make and the pages under it: the Make page, the quick maker and organising in bulk. */

const QuickMake = lazy(() => import('./QuickMake.tsx'));
const Organise = lazy(() => import('./Organise.tsx'));

export default function MakeApp() {
  return (
    <Suspense fallback={<LoadingMark />}>
      <Routes>
        <Route index element={<MakePage />} />
        <Route path="quick" element={<QuickMake />} />
        <Route path="organise" element={<Organise />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
