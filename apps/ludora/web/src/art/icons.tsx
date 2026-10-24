import type { SVGProps } from 'react';

/*
 * Ludora's own icons for things specific to the product: currencies, the
 * answer shapes, and the logo. General interface icons come from Lucide
 * (ISC licence).
 */

type IconProps = { size?: number; className?: string; title?: string };

function svgProps({ size = 20, className, title }: IconProps): SVGProps<SVGSVGElement> {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    className,
    role: title ? 'img' : undefined,
    'aria-label': title,
    'aria-hidden': title ? undefined : true,
    focusable: false,
  };
}

export function SparkIcon(p: IconProps) {
  return (
    <svg {...svgProps(p)}>
      <path d="M12 1.6L14.6 9.4L22.4 12L14.6 14.6L12 22.4L9.4 14.6L1.6 12L9.4 9.4Z" fill="#FFC233" stroke="#5A3A00" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12 5.4L13.4 10.6L12 12L10.6 10.6Z" fill="#FFF1C2" />
      <path d="M12 12L18.6 12L14 13.4Z" fill="#E09A00" />
    </svg>
  );
}

export function MoonstoneIcon(p: IconProps) {
  return (
    <svg {...svgProps(p)}>
      <path d="M12 2.2L20 6.8V17.2L12 21.8L4 17.2V6.8Z" fill="#A66BFF" stroke="#24104F" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12 2.2L20 6.8L12 11.4L4 6.8Z" fill="#C7A6FF" />
      <path d="M12 11.4L20 6.8V17.2L12 21.8Z" fill="#7F45E6" />
      <path d="M14.4 8.6A3.9 3.9 0 1 0 14.4 15.4A3.1 3.1 0 1 1 14.4 8.6Z" fill="#F6F0FF" />
    </svg>
  );
}

export function DustIcon(p: IconProps) {
  return (
    <svg {...svgProps(p)}>
      <path d="M9 2.6L10.6 7.4L15.4 9L10.6 10.6L9 15.4L7.4 10.6L2.6 9L7.4 7.4Z" fill="#1FD38F" stroke="#063F2B" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M17 11.6L18.1 14.9L21.4 16L18.1 17.1L17 20.4L15.9 17.1L12.6 16L15.9 14.9Z" fill="#8CF2C8" stroke="#063F2B" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M18.5 3.6L19.3 5.7L21.4 6.5L19.3 7.3L18.5 9.4L17.7 7.3L15.6 6.5L17.7 5.7Z" fill="#8CF2C8" stroke="#063F2B" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  );
}

export function TicketIcon(p: IconProps) {
  return (
    <svg {...svgProps(p)}>
      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H19.5A1.5 1.5 0 0 1 21 7.5V10A2 2 0 0 0 21 14V16.5A1.5 1.5 0 0 1 19.5 18H4.5A1.5 1.5 0 0 1 3 16.5V14A2 2 0 0 0 3 10Z" fill="#6CC2FF" stroke="#0A3157" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M15.5 6.8V17.2" stroke="#0A3157" strokeWidth="1.2" strokeDasharray="1.6 1.6" />
      <path d="M9.5 8.6V15.4M6.9 10.1L12.1 13.9M12.1 10.1L6.9 13.9" stroke="#F2FAFF" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function CurrencyIcon({ code, ...p }: IconProps & { code: string }) {
  switch (code) {
    case 'sparks':
      return <SparkIcon {...p} />;
    case 'moonstones':
      return <MoonstoneIcon {...p} />;
    case 'dust':
      return <DustIcon {...p} />;
    default:
      return <TicketIcon {...p} />;
  }
}

/** Answer shapes: sun, moon, leaf, flame, star, drop. Each answer has a shape and a letter as well as a colour. */
export const ANSWER_SHAPES = ['sun', 'moon', 'leaf', 'flame', 'star', 'drop'] as const;
export const ANSWER_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

export function AnswerShape({ index, size = 28, className }: { index: number; size?: number; className?: string }) {
  const s = ANSWER_SHAPES[index % ANSWER_SHAPES.length];
  const common = { fill: 'currentColor', stroke: 'none' };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden focusable={false}>
      {s === 'sun' && (
        <>
          <circle cx="12" cy="12" r="5" {...common} />
          <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
              <line key={a} x1={12 + 7.5 * Math.cos((a * Math.PI) / 180)} y1={12 + 7.5 * Math.sin((a * Math.PI) / 180)} x2={12 + 10 * Math.cos((a * Math.PI) / 180)} y2={12 + 10 * Math.sin((a * Math.PI) / 180)} />
            ))}
          </g>
        </>
      )}
      {s === 'moon' && <path d="M15.5 3.2A9 9 0 1 0 20.8 15.5A7 7 0 1 1 15.5 3.2Z" {...common} />}
      {s === 'leaf' && <path d="M4 20C4 10 10 4 20 4C20 14 14 20 4 20ZM4 20L12 12" {...common} stroke="currentColor" strokeWidth="0" />}
      {s === 'flame' && <path d="M12 2C13 6 17 8 17.5 12.5C18 17 15.5 21 12 21C8.5 21 6 18.5 6 15C6 12 8 10.5 9 8C9.5 10 10.5 11 11.5 11.5C10.5 8 11 5 12 2Z" {...common} />}
      {s === 'star' && <path d="M12 2.5L14.8 8.6L21.5 9.3L16.5 13.8L17.9 20.4L12 17L6.1 20.4L7.5 13.8L2.5 9.3L9.2 8.6Z" {...common} strokeLinejoin="round" />}
      {s === 'drop' && <path d="M12 2.5C14 6.5 19 10.5 19 15A7 7 0 0 1 5 15C5 10.5 10 6.5 12 2.5Z" {...common} />}
    </svg>
  );
}

/** The Ludora mark: a lantern-shaped Glim. */
/** Ludora's mark: a gold plate leaning forward like a broadcast caption, with a pressable bottom edge. */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden focusable={false}>
      <g transform="translate(32 32) skewX(-10) translate(-32 -32)">
        <rect x="9" y="5" width="46" height="54" rx="9" fill="var(--lantern-deep)" />
        <rect x="9" y="5" width="46" height="49" rx="9" fill="var(--lantern)" />
        <path d="M22 14h9.5v24.5H44V47H22z" fill="var(--on-accent)" />
      </g>
    </svg>
  );
}

export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      <LogoMark size={size + 6} />
      <span className="font-display font-extrabold text-text italic" style={{ fontSize: size * 1.15, lineHeight: 1 }}>
        Ludora
      </span>
    </span>
  );
}
