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
 * locker and on profiles. Without a banner the card shows the dusk sky; a theme
 * tints the card and the sky behind the buddy.
 */
export function ProfileCard({ name, level, avatar, equipment, compact = false }: { name: string; level?: number; avatar: AvatarLite | null; equipment: CardEquipment; compact?: boolean }) {
  const frame = equipment.frame?.kind === 'frame' ? equipment.frame : null;
  const banner = equipment.banner?.kind === 'banner' ? equipment.banner : null;
  const title = equipment.title?.kind === 'title' ? equipment.title.text : null;
  const theme = equipment.theme?.kind === 'theme' ? equipment.theme : null;
  const size = compact ? 104 : 150;
  const buddy = avatar ? <Glim art={avatar.art} accessories={avatar.accessories} rarity={avatar.rarity} pose="wave" size={Math.round(size * 0.86)} bob /> : null;
  return (
    <div
      className="overflow-hidden rounded-[24px] border-[2.5px] border-ink bg-raised shadow-[0_5px_0_var(--ink)]"
      style={theme ? { background: `color-mix(in oklab, hsl(${theme.hue} 60% 50%) 16%, var(--bg-raised))` } : undefined}
    >
      <div className={`relative border-b-[2.5px] border-ink ${compact ? 'h-24' : 'h-32'}`}>
        {banner ? (
          <BannerArt pattern={banner.pattern} hue={banner.hue} accentHue={banner.accentHue} className="absolute inset-0 h-full w-full" />
        ) : theme ? (
          <div className="absolute inset-0" style={{ background: `hsl(${theme.hue} 62% 42%)` }} aria-hidden>
            <span className="absolute top-4 left-6 size-2 rounded-full" style={{ background: `hsl(${theme.accentHue} 90% 75%)` }} />
            <span className="absolute top-9 right-10 size-1.5 rounded-full" style={{ background: `hsl(${theme.accentHue} 90% 75%)` }} />
          </div>
        ) : (
          <div className="stage absolute inset-0" aria-hidden />
        )}
      </div>
      <div className="relative flex flex-col items-center px-5 pb-5" style={{ marginTop: -size / 2 }}>
        <div className="rounded-full border-[2.5px] border-ink bg-raised p-1 shadow-[0_4px_0_var(--ink)]">
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
          <div className={`font-display leading-tight font-extrabold break-words ${compact ? 'text-2xl' : 'text-3xl'}`}>{name}</div>
          {title ? <div className="rounded-full border-2 border-ink bg-lantern px-3 py-0.5 font-display text-sm font-bold text-on-accent shadow-[0_2px_0_var(--ink)]">{title}</div> : null}
          {level ? <div className="rounded-full bg-surface-3 px-3 py-0.5 text-sm font-bold text-text-2">Level {level}</div> : null}
        </div>
      </div>
    </div>
  );
}
