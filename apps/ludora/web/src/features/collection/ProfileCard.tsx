import type { AvatarLite, ItemArt } from '@ludora/shared';
import { Glim } from '../../art/glim/Glim.tsx';
import { BannerArt, FrameRing } from '../../art/cosmetics.tsx';

export interface CardEquipment {
  frame?: ItemArt | undefined;
  banner?: ItemArt | undefined;
  title?: ItemArt | undefined;
  theme?: ItemArt | undefined;
}

/**
 * The player's card: banner, framed buddy, name, title and level. Used in the
 * locker and on profiles. Without a banner the card shows the stage; a theme
 * tints the card and the area behind the buddy.
 */
export function ProfileCard({ name, level, avatar, equipment, compact = false }: { name: string; level?: number; avatar: AvatarLite | null; equipment: CardEquipment; compact?: boolean }) {
  const frame = equipment.frame?.kind === 'frame' ? equipment.frame : null;
  const banner = equipment.banner?.kind === 'banner' ? equipment.banner : null;
  const title = equipment.title?.kind === 'title' ? equipment.title.text : null;
  const theme = equipment.theme?.kind === 'theme' ? equipment.theme : null;
  const size = compact ? 104 : 150;
  const buddy = avatar ? <Glim art={avatar.art} accessories={avatar.accessories} rarity={avatar.rarity} pose="wave" size={Math.round(size * 0.86)} /> : null;
  return (
    <div className="lift overflow-hidden rounded-[var(--radius-l)] border border-line bg-raised" style={theme ? { background: `color-mix(in oklab, hsl(${theme.hue} 60% 50%) 16%, var(--bg-raised))` } : undefined}>
      <div className={`relative ${compact ? 'h-24' : 'h-32'}`}>
        {banner ? (
          <BannerArt pattern={banner.pattern} hue={banner.hue} accentHue={banner.accentHue} className="absolute inset-0 h-full w-full" />
        ) : theme ? (
          <div className="absolute inset-0" style={{ background: `linear-gradient(160deg, hsl(${theme.hue} 62% 44%) 0%, hsl(${theme.hue} 58% 30%) 60%, hsl(${theme.accentHue} 70% 40%) 100%)` }} aria-hidden />
        ) : (
          <div className="stage absolute inset-0" aria-hidden />
        )}
      </div>
      <div className="relative flex flex-col items-center px-5 pb-5" style={{ marginTop: -size / 2 }}>
        <div className="rounded-full bg-raised p-1.5 shadow-[0_10px_24px_-10px_rgb(2_5_20/0.65)]" style={theme ? { background: `color-mix(in oklab, hsl(${theme.hue} 60% 50%) 16%, var(--bg-raised))` } : undefined}>
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
        <div className="mt-3 flex flex-col items-center gap-2 text-center">
          <div className={`font-display leading-tight font-extrabold break-words ${compact ? 'text-[1.75rem]' : 'text-[2.2rem]'}`}>{name}</div>
          {title ? (
            <div className="plate plate-gold max-w-full text-base">
              <span className="truncate">{title}</span>
            </div>
          ) : null}
          {level ? (
            <div className="rounded-full border border-line bg-surface-2 px-3 py-0.5 text-sm font-bold text-text-2">
              Level <span className="font-display text-base text-text tabular">{level}</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
