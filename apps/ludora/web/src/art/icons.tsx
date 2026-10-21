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
      <path d="M12 1.8C12.9 7.6 16.4 11.1 22.2 12C16.4 12.9 12.9 16.4 12 22.2C11.1 16.4 7.6 12.9 1.8 12C7.6 11.1 11.1 7.6 12 1.8Z" fill="#FFB020" stroke="#7A4A00" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M12 6.5C12.4 9.3 14.7 11.6 17.5 12C14.7 12.4 12.4 14.7 12 17.5" fill="none" stroke="#FFE7A8" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function MoonstoneIcon(p: IconProps) {
  return (
    <svg {...svgProps(p)}>
      <path d="M12 2.5L19.5 7V17L12 21.5L4.5 17V7Z" fill="#9D85FF" stroke="#2B1A7A" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M14.6 8.2A4.4 4.4 0 1 0 14.6 15.8A3.5 3.5 0 1 1 14.6 8.2Z" fill="#F1ECFF" />
    </svg>
  );
}

export function DustIcon(p: IconProps) {
  return (
    <svg {...svgProps(p)}>
      <path d="M9 3C9.6 6.6 11.4 8.4 15 9C11.4 9.6 9.6 11.4 9 15C8.4 11.4 6.6 9.6 3 9C6.6 8.4 8.4 6.6 9 3Z" fill="#33D6A6" stroke="#0B5E46" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M17 12C17.4 14.4 18.6 15.6 21 16C18.6 16.4 17.4 17.6 17 20C16.6 17.6 15.4 16.4 13 16C15.4 15.6 16.6 14.4 17 12Z" fill="#7DF0CB" stroke="#0B5E46" strokeWidth="1.1" strokeLinejoin="round" />
      <circle cx="18.5" cy="5.5" r="1.6" fill="#7DF0CB" />
    </svg>
  );
}

export function TicketIcon(p: IconProps) {
  return (
    <svg {...svgProps(p)}>
      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H19.5A1.5 1.5 0 0 1 21 7.5V10A2 2 0 0 0 21 14V16.5A1.5 1.5 0 0 1 19.5 18H4.5A1.5 1.5 0 0 1 3 16.5V14A2 2 0 0 0 3 10Z" fill="#7CCBFF" stroke="#0D3F66" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M12 8.5V15.5M9 10L15 14M15 10L9 14" stroke="#F2FAFF" strokeWidth="1.4" strokeLinecap="round" />
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
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden focusable={false}>
      <path d="M32 6C35.5 6 37.5 8.2 37.5 10.5V14H26.5V10.5C26.5 8.2 28.5 6 32 6Z" fill="var(--lantern)" stroke="var(--ink)" strokeWidth="3" strokeLinejoin="round" />
      <path d="M16 31C16 21.6 23.2 14 32 14C40.8 14 48 21.6 48 31V39C48 49 40.8 57 32 57C23.2 57 16 49 16 39Z" fill="var(--lantern)" stroke="var(--ink)" strokeWidth="3" strokeLinejoin="round" />
      <path d="M22 26C24 21.5 27.5 19 31 18.5" stroke="#FFE7A8" strokeWidth="3" strokeLinecap="round" fill="none" />
      <circle cx="26" cy="35" r="3.4" fill="var(--ink)" />
      <circle cx="38" cy="35" r="3.4" fill="var(--ink)" />
      <path d="M26.5 43.5C29.6 46.4 34.4 46.4 37.5 43.5" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      <LogoMark size={size + 6} />
      <span className="font-display font-extrabold tracking-tight text-text" style={{ fontSize: size, lineHeight: 1 }}>
        ludora
      </span>
    </span>
  );
}
