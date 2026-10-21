import type { AvatarLite, ItemArt } from '@ludora/shared';
import { Glim } from '../../art/glim/Glim.tsx';
import { BannerArt, FrameRing } from '../../art/cosmetics.tsx';

export interface CardEquipment {
  frame?: ItemArt | undefined;
  banner?: ItemArt | undefined;
  title?: ItemArt | undefined;
  theme?: ItemArt | undefined;
}

/** The player's card: banner, framed buddy, name, title and level. Used in the locker and on profiles. */
export function ProfileCard({ name, level, avatar, equipment, compact = false }: { name: string; level?: number; avatar: AvatarLite | null; equipment: CardEquipment; compact?: boolean }) {
  const frame = equipment.frame?.kind === 'frame' ? equipment.frame : null;
  const banner = equipment.banner?.kind === 'banner' ? equipment.banner : null;
  const title = equipment.title?.kind === 'title' ? equipment.title.text : null;
  const theme = equipment.theme?.kind === 'theme' ? equipment.theme : null;
  const size = compact ? 96 : 132;
  const buddy = avatar ? <Glim art={avatar.art} accessories={avatar.accessories} size={size * 0.86} bob /> : null;
  return (
    <div className="overflow-hidden rounded-[var(--radius-l)] border border-line bg-raised" style={theme ? { borderColor: `hsl(${theme.accentHue} 80% 65%)`, background: `color-mix(in oklab, hsl(${theme.hue} 60% 50%) 14%, var(--bg-raised))` } : undefined}>
      <div className={`relative ${compact ? 'h-20' : 'h-28'} bg-surface-3`} style={theme ? { background: `linear-gradient(120deg, hsl(${theme.hue} 65% 45%), hsl(${theme.accentHue} 75% 55%))` } : undefined}>
        {banner ? <BannerArt pattern={banner.pattern} hue={banner.hue} accentHue={banner.accentHue} className="absolute inset-0 h-full w-full" /> : null}
      </div>
      <div className="relative flex flex-col items-center px-5 pb-5" style={{ marginTop: -size / 2 }}>
        <div className="rounded-full bg-raised p-1">
          {frame ? (
            <FrameRing style={frame.style} hue={frame.hue} accentHue={frame.accentHue} size={size}>
              <span className="grid size-full place-items-center bg-surface-2">{buddy}</span>
            </FrameRing>
          ) : (
            <span className="grid place-items-center rounded-full bg-surface-2" style={{ width: size, height: size }}>
              {buddy}
            </span>
          )}
        </div>
        <div className="mt-2 text-center">
          <div className="font-display text-2xl font-extrabold">{name}</div>
          {title ? <div className="mt-1 inline-block rounded-full border-2 border-ink bg-surface-3 px-3 py-0.5 font-display text-sm font-bold">{title}</div> : null}
          {level ? <div className="mt-1 text-sm text-text-3">Level {level}</div> : null}
        </div>
      </div>
    </div>
  );
}
