// Development-only preview of every season and celebration's decorations. Served by Vite at /dev/seasons.html; not part of the app build.
import { createRoot } from 'react-dom/client';
import '../src/styles/app.css';
import { CELEBRATIONS, SEASONS } from '@ludora/content/seasons';
import { Stage } from '../src/ui/Stage.tsx';
import { SeasonGarland } from '../src/features/season/SeasonGarland.tsx';

const ALL = [...CELEBRATIONS.filter((c) => c.id !== 'new-year-day'), ...Object.values(SEASONS)];
const only = new URLSearchParams(location.search).get('only');

function Preview() {
  return (
    <div className="flex flex-col gap-4 bg-bg p-4">
      {ALL.filter((s) => !only || s.id === only).map((s) => (
        <Stage key={s.id} className="rounded-[var(--radius-l)] px-6 pt-[88px] pb-8">
          <SeasonGarland theme={s.theme} />
          <div className="relative z-10">
            <p className="text-sm text-text-2">
              <span className="font-bold" style={{ color: `hsl(${s.theme.hue} 90% 72%)` }}>
                {s.name}.
              </span>{' '}
              {s.tagline}
            </p>
            <p className="mt-2 font-display text-4xl font-extrabold">Hi, Swift Otter</p>
            <p className="text-xs text-text-3">{s.theme.decor.join(', ')}</p>
          </div>
        </Stage>
      ))}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Preview />);
