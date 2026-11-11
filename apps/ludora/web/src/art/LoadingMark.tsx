/*
 * The loading screen: Ludora's mark, its gold plate catching a sweep of
 * light, and three dots taking turns. Pure CSS; under reduced motion the
 * light and the dots hold still (the app-wide rule stops every animation).
 */
const CSS = `@keyframes ld-sweep{0%{transform:translateX(-70px) skewX(-18deg)}60%,100%{transform:translateX(80px) skewX(-18deg)}}@keyframes ld-dot{0%,80%,100%{opacity:.35;transform:none}40%{opacity:1;transform:translateY(-3px)}}.ld-sweep{animation:ld-sweep 1.6s var(--ease-out,ease-out) infinite}.ld-dot{animation:ld-dot 1.2s ease-in-out infinite}.ld-dot:nth-child(2){animation-delay:.15s}.ld-dot:nth-child(3){animation-delay:.3s}`;

export function LoadingMark({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="grid min-h-[40vh] place-items-center p-8">
      <style>{CSS}</style>
      <div className="flex flex-col items-center gap-4" aria-hidden>
        <svg width="64" height="64" viewBox="0 0 64 64">
          <defs>
            <clipPath id="ld-plate">
              <rect x="9" y="5" width="46" height="54" rx="9" />
            </clipPath>
          </defs>
          <g transform="translate(32 32) skewX(-10) translate(-32 -32)">
            <rect x="9" y="5" width="46" height="54" rx="9" fill="var(--lantern-deep)" />
            <rect x="9" y="5" width="46" height="49" rx="9" fill="var(--lantern)" />
            <path d="M22 14h9.5v24.5H44V47H22z" fill="var(--on-accent)" />
            <g clipPath="url(#ld-plate)">
              <rect className="ld-sweep" x="0" y="0" width="14" height="64" fill="#fff" opacity="0.45" />
            </g>
          </g>
        </svg>
        <div className="flex gap-1.5">
          <span className="ld-dot size-2 rounded-full bg-lantern" />
          <span className="ld-dot size-2 rounded-full bg-lantern" />
          <span className="ld-dot size-2 rounded-full bg-lantern" />
        </div>
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}
