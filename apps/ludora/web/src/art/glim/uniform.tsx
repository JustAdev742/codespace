import type { ReactNode } from 'react';
import type { BodyGeometry } from './bodies.ts';
import { UNIFORM_COLORS as U, UNIFORM_HAT, type Uniform } from './uniform.ts';

/*
 * The Hills Grammar uniform drawn on a Glim (see uniform.ts for what each one is). The garment,
 * shirt, tie and crest are drawn inside the body's outline, under the cel shading, so they take the
 * same light as the Glim and fit every body shape. The hats sit on the head like accessories, in
 * the same crisp outlined style.
 */

const OUT = '#0b1a13';
/** The crest's own colours (the school's logo files). */
const CREST_GREEN = '#004d32';
const CREST_RED = '#ee3124';
const CREST_SAGE = '#a2b5a9';
const GOLD = '#e6b450';

/*
 * The school's crest, drawn small enough to embroider on a Glim, measured from the school's own
 * logo file: the banner and its folded ends, the three chevrons with their stars, the red target in
 * its laurel and the motto ring, in the school's green and red on cream. 20 units wide around
 * (0, 0), from 11 above to 10 below; `tiny` keeps the shield and the target.
 */
const SHIELD = 'M0 -8.23L5.1 -5.24V-2.73L7.24 -1.49V1.06L9.2 2.23A9.35 9.35 0 0 1 -9.2 2.23L-7.24 1.06V-1.49L-5.1 -2.73V-5.24Z';
const BANNER = 'M-9 -11H9V-8.4H-9Z';
const RIBBON_ENDS = 'M-8.4 -7.65L-9.9 -6.85L-8 -4.95L-6.6 -5.9ZM8.4 -7.65L9.9 -6.85L8 -4.95L6.6 -5.9Z';
const RIBBON_FOLDS = 'M-9 -8.4H-6.6V-6.1ZM9 -8.4H6.6V-6.1Z';
const STAR = 'M0 -1L0.24 -0.33L0.95 -0.31L0.38 0.12L0.59 0.81L0 0.4L-0.59 0.81L-0.38 0.12L-0.95 -0.31L-0.24 -0.33Z';
const STARS: readonly (readonly [number, number, boolean])[] = [
  [-1.7, -5.85, false],
  [1.7, -5.85, false],
  [0, -4.35, true],
  [-2.6, -3.05, true],
  [2.6, -3.05, true],
];
const LAUREL = 'M-0.4 6.4C-3.7 6.3 -5 3.6 -4.4 1.5C-4 0.2 -3.1 -0.6 -2.3 -1.1M0.4 6.4C3.7 6.3 5 3.6 4.4 1.5C4 0.2 3.1 -0.6 2.3 -1.1';
/** Laurel leaves along the stem, left side: x, y, angle. The right side mirrors them. */
const LEAVES: readonly (readonly [number, number, number])[] = [
  [-1.9, 6.1, 200],
  [-3.4, 5.1, 225],
  [-4.4, 3.5, 250],
  [-4.7, 1.7, 275],
  [-4.1, 0, 300],
  [-3, -1, 320],
];
/** Letters and word gaps, as a dash pattern: STRIVE FOR EXCELLENCE, THE HILLS GRAMMAR SCHOOL. */
const letters = (words: readonly number[], dash: number, gap: number, space: number) =>
  words.map((n) => Array.from({ length: n }, () => `${dash} ${gap}`).join(' ').replace(/ [\d.]+$/, ` ${space}`)).join(' ');
const MOTTO = letters([6, 3, 10], 0.55, 0.32, 1.1);
const NAME = letters([3, 5, 7, 6], 0.52, 0.2, 0.75);
export const CREST_UP = 11 / 20;
export const CREST_DOWN = 9.95 / 20;

export function Crest({ x, y, w, tiny = false }: { x: number; y: number; w: number; tiny?: boolean }) {
  const s = w / 20;
  const line = { fill: 'none', stroke: CREST_GREEN, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const cut = { stroke: OUT, strokeWidth: tiny ? 2.8 : 1.4, strokeLinejoin: 'round' as const };
  const edge = { stroke: CREST_GREEN, strokeWidth: 0.55, strokeLinejoin: 'round' as const };
  return (
    <g transform={`translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${s.toFixed(3)})`}>
      {tiny ? null : (
        <>
          <path d={RIBBON_ENDS} fill={U.cream} {...cut} />
          <path d={RIBBON_ENDS} fill={U.cream} {...edge} />
        </>
      )}
      <path d={SHIELD} fill={U.cream} {...cut} />
      {tiny ? null : (
        <>
          <path d={SHIELD} fill={U.cream} {...edge} />
          <path d="M-5.1 -2.73L0 -5.7L5.1 -2.73M-9.2 2.23L0 -3.13L9.2 2.23" {...line} strokeWidth={0.5} />
          {STARS.map(([sx, sy, solid], i) => (
            <path key={i} d={STAR} transform={`translate(${sx} ${sy}) scale(0.68)`} fill={solid ? CREST_GREEN : U.cream} stroke={CREST_GREEN} strokeWidth={solid ? 0 : 0.35} />
          ))}
          {/* The motto ring, STRIVE FOR EXCELLENCE, as a run of letters. */}
          <path d="M-7.24 0.95A7.25 7.25 0 0 0 7.24 0.95" {...line} strokeWidth={0.5} />
          <path d="M-8.05 2.6A8.3 8.3 0 0 0 8.05 2.6" {...line} strokeWidth={1.15} strokeLinecap="butt" strokeDasharray={MOTTO} />
          <path d={LAUREL} {...line} strokeWidth={0.45} />
          {LEAVES.flatMap(([lx, ly, a], i) => [
            <ellipse key={`l${i}`} cx={lx} cy={ly} rx={1.05} ry={0.5} transform={`rotate(${a} ${lx} ${ly})`} fill={CREST_GREEN} />,
            <ellipse key={`r${i}`} cx={-lx} cy={ly} rx={1.05} ry={0.5} transform={`rotate(${180 - a} ${-lx} ${ly})`} fill={CREST_GREEN} />,
          ])}
          <path d="M0 6.2L-0.5 7.1H0.5Z" fill={CREST_GREEN} />
        </>
      )}
      <circle cx={0} cy={2.28} r={tiny ? 4.2 : 3.34} fill={CREST_RED} />
      {tiny ? (
        <circle cx={0} cy={2.28} r={2.2} fill="none" stroke={U.cream} strokeWidth={1.3} />
      ) : (
        <g fill="none" stroke={U.cream} strokeWidth={0.32}>
          <circle cx={0} cy={2.28} r={2.55} />
          <circle cx={0} cy={2.28} r={1.6} />
          <circle cx={0} cy={2.28} r={0.75} />
        </g>
      )}
      {tiny ? null : (
        <>
          <path d={RIBBON_FOLDS} fill={CREST_SAGE} {...edge} />
          {/* The banner, THE HILLS GRAMMAR SCHOOL. */}
          <path d={BANNER} fill={U.cream} {...cut} />
          <path d={BANNER} fill={U.cream} {...edge} />
          <path d="M-8.1 -9.7H8.4" stroke={CREST_GREEN} strokeWidth={1.2} strokeDasharray={NAME} />
        </>
      )}
    </g>
  );
}

/**
 * The garment, for inside the body's clip: blazer or polo, the shirt, tie and collar, the crest.
 * `neckwear` (the player's own scarf or bow) leaves the collar and tie out. `tiny` drops fine detail.
 *
 * The neckline wraps round the body like a collar round a ball seen from a little above: low at
 * the front, under the mouth, and rising towards the sides, under the cheeks. The neck details
 * (V, lapels, collar, tie) are drawn around (0, 0) at the front of the neckline, scaled to the body.
 */
/** Where the garment and its crest go on a body. */
function layout(uniform: Uniform, geo: BodyGeometry) {
  const cx = geo.face.x;
  const [x0, , x1, y1] = geo.box;
  const half = (x1 - x0) / 2;
  const top = geo.neck - 7;
  const room = y1 - top;
  const isBlazer = uniform !== 'kinder' && uniform !== 'sport' && uniform !== 'sport-junior';
  // The crest on the left breast (the right as we look), clear of the lapel, kept inside the body.
  const crestW = Math.max(5.6, Math.min(isBlazer ? 8.4 : 7.6, (room - 3) * 0.55));
  const crestX = cx + Math.max(isBlazer ? 13 : 10.5, Math.min(isBlazer ? 18 : 14, half * 0.46));
  const crestY = Math.min(top + (isBlazer ? 4.6 : 3.4) + crestW * CREST_UP, y1 - 1.5 - crestW * CREST_DOWN);
  return { cx, x0, x1, top, room, isBlazer, crestW, crestX, crestY };
}

export function UniformGarment({ uniform, geo, tiny, neckwear, back = false, housePin = null }: { uniform: Uniform; geo: BodyGeometry; tiny: boolean; neckwear: boolean; back?: boolean; housePin?: number | null }) {
  const { cx, x0, x1, top, room, isBlazer } = layout(uniform, geo);
  const side = Math.max(geo.face.y + 8, top - 8);
  const k = Math.max(0.85, Math.min(1.2, room / 17));
  const outline = { stroke: OUT, strokeWidth: 0.9 / k, strokeLinejoin: 'round' as const };
  /** The neckline from the left side to the right, open at the front between l and r. */
  const neckline = (w: number) =>
    `M${x0 - 6} ${side - 2}C${x0 + 4} ${side + 2} ${cx - w - 10} ${top} ${cx - w} ${top}H${cx + w}C${cx + w + 10} ${top} ${x1 - 4} ${side + 2} ${x1 + 6} ${side - 2}`;
  const neck = (children: ReactNode) => <g transform={`translate(${cx} ${top}) scale(${k.toFixed(3)})`}>{children}</g>;

  if (back) {
    // The back, for the far side of a 3D Glim: the garment and its collar, with the blazer's centre seam.
    const grey = uniform === 'senior-grey' || uniform === 'junior-grey';
    const fill = uniform === 'kinder' ? U.poloRed : uniform === 'sport' || uniform === 'sport-junior' ? U.poloGreen : grey ? U.blazerGrey : U.blazerGreen;
    const deep = uniform === 'kinder' ? U.poloRedDeep : uniform === 'sport' || uniform === 'sport-junior' ? U.poloGreenDeep : grey ? U.blazerGreyDeep : U.blazerGreenDeep;
    return (
      <g>
        <path d={`${neckline(0)}V140H${x0 - 6}Z`} fill={fill} />
        <path d={neckline(0)} fill="none" stroke={deep} strokeWidth={3.2} />
        <path d={neckline(0)} fill="none" stroke={OUT} strokeWidth={1.4} opacity={0.8} transform="translate(0 -1.6)" />
        {isBlazer ? <path d={`M${cx} ${top + 2.4}V140`} stroke={deep} strokeWidth={0.9} /> : null}
      </g>
    );
  }

  if (!isBlazer) {
    const fill = uniform === 'kinder' ? U.poloRed : U.poloGreen;
    const deep = uniform === 'kinder' ? U.poloRedDeep : U.poloGreenDeep;
    return (
      <g>
        <path d={`${neckline(4)}V140H${x0 - 6}Z`} fill={fill} />
        <path d={neckline(4)} fill="none" stroke={OUT} strokeWidth={1.6} opacity={0.8} />
        {neck(
          <>
            {/* The placket and its two buttons, under a flat polo collar. */}
            <path d="M-2 0H2V11H-2Z" fill={deep} {...outline} />
            {tiny ? null : (
              <>
                <circle cx={0} cy={5.4} r={0.85} fill={U.cream} />
                <circle cx={0} cy={8.6} r={0.85} fill={U.cream} />
              </>
            )}
            <path d="M-0.8 -1.4C-6 -2.6 -12.4 -1.8 -13.6 2.4L-2 6.6Z" fill={fill} {...outline} />
            <path d="M0.8 -1.4C6 -2.6 12.4 -1.8 13.6 2.4L2 6.6Z" fill={fill} {...outline} />
            {tiny ? null : <path d="M-1.6 5.2L-11.6 2M1.6 5.2L11.6 2" stroke={deep} strokeWidth={0.7} opacity={0.6} />}
          </>,
        )}
      </g>
    );
  }

  const grey = uniform === 'senior-grey' || uniform === 'junior-grey';
  const blazer = grey ? U.blazerGrey : U.blazerGreen;
  const lapel = grey ? U.blazerGreyDeep : U.blazerGreenDeep;
  const senior = uniform === 'senior-green' || uniform === 'senior-grey';
  const tie = senior ? U.blazerGreen : U.pullover;
  // In neck units: the V of the open blazer, the red pullover inside it, the shirt inside that.
  const vw = 11;
  const lapels = (m: 1 | -1) => `M${m * vw} 0L${m * 0.4} 18L${m * 3.6} 18.4L${m * 13.4} 8.2L${m * 16} 7.2L${m * 14} 2.4Z`;
  return (
    <g>
      <path d={`${neckline(vw * k)}V140H${x0 - 6}Z`} fill={blazer} />
      {neck(
        <>
          <path d="M-8.6 0L0 15.6L8.6 0Z" fill={U.pullover} />
          <path d="M-5.6 0L0 11L5.6 0Z" fill={U.cream} />
          {tiny ? null : <path d="M-8.6 0L0 15.6L8.6 0" fill="none" stroke={U.pulloverDeep} strokeWidth={1.1} />}
          {!neckwear && uniform !== 'junior-green' ? (
            <>
              {/* The tie: the blade, until it goes under the pullover, then the knot. */}
              <path d="M-1.8 4.6H1.8L3.2 14H-3.2Z" fill={tie} {...outline} />
              {tiny ? null : senior ? (
                <>
                  <path d="M-2.5 8.4L2.6 5.9M-3 12.6L3.1 9.6" stroke={U.pullover} strokeWidth={1.5} />
                  <path d="M-2.8 10.5L2.9 7.8" stroke={U.cream} strokeWidth={0.4} />
                </>
              ) : (
                <>
                  <path d="M0 6.4L2.5 9.6L0 12.8L-2.5 9.6Z" fill={U.blazerGreen} />
                  <path d="M-2.2 6.6L2.6 12.6M2.2 6.6L-2.6 12.6" stroke={U.cream} strokeWidth={0.45} />
                </>
              )}
              <path d="M-2.2 1.6H2.2L1.5 4.8H-1.5Z" fill={tie} {...outline} />
              {/* Collar points either side of the knot. */}
              <path d="M-2 -0.8L-9.4 -1.2L-5.4 6Z" fill={U.cream} {...outline} />
              <path d="M2 -0.8L9.4 -1.2L5.4 6Z" fill={U.cream} {...outline} />
            </>
          ) : null}
          {!neckwear && uniform === 'junior-green' ? (
            <>
              {/* The junior girls' rounded collar, open at the neck. */}
              <path d="M-0.5 0.6C-5.4 -1.8 -11 -0.8 -10.4 3.8C-9.8 7.6 -4 7.4 -0.5 0.6Z" fill={U.cream} {...outline} />
              <path d="M0.5 0.6C5.4 -1.8 11 -0.8 10.4 3.8C9.8 7.6 4 7.4 0.5 0.6Z" fill={U.cream} {...outline} />
            </>
          ) : null}
          {/* Lapels and the blazer's button below the V. */}
          <path d={lapels(-1)} fill={lapel} {...outline} />
          <path d={lapels(1)} fill={lapel} {...outline} />
          {tiny ? null : (
            <path d="M-12 2.8L-1.6 16.6M12 2.8L1.6 16.6" stroke={blazer} strokeWidth={0.7} opacity={0.55} />
          )}
          {tiny ? null : <circle cx={0} cy={21} r={1.3} fill={grey ? '#2b3550' : '#0f2219'} stroke={OUT} strokeWidth={0.5} />}
          {/* The house pin on the left lapel, in the house's colour (school.ts houseFill), a small shield. */}
          {housePin !== null && !tiny ? <path d="M5.6 9.2h3.6v2.1c0 1.4-0.9 2.3-1.8 2.8c-0.9-0.5-1.8-1.4-1.8-2.8Z" fill={`hsl(${housePin} 80% 64%)`} stroke={OUT} strokeWidth={0.5} /> : null}
          {/* School pins on the left lapel. */}
          {senior && !tiny ? (
            <>
              <circle cx={12.4} cy={4.6} r={1} fill={GOLD} stroke={OUT} strokeWidth={0.4} />
              <circle cx={10} cy={7.4} r={0.85} fill={GOLD} stroke={OUT} strokeWidth={0.4} />
            </>
          ) : null}
        </>,
      )}
      <path d={neckline(vw * k)} fill="none" stroke={OUT} strokeWidth={1.6} opacity={0.8} />
    </g>
  );
}

/**
 * The crest on the breast pocket, for inside the body's clip but over the cel shading, so the
 * school's crest stays clear and bright on the shaded side of the body.
 */
export function UniformBadge({ uniform, geo, tiny }: { uniform: Uniform; geo: BodyGeometry; tiny: boolean }) {
  const { isBlazer, crestW, crestX, crestY } = layout(uniform, geo);
  const grey = uniform === 'senior-grey' || uniform === 'junior-grey';
  return (
    <g>
      {isBlazer && !tiny ? (
        <path d={`M${crestX - crestW * 0.6} ${crestY + crestW * CREST_DOWN + 0.9}H${crestX + crestW * 0.6}`} stroke={grey ? U.blazerGreyDeep : U.blazerGreenDeep} strokeWidth={1.1} strokeLinecap="round" />
      ) : null}
      <Crest x={crestX} y={crestY} w={crestW} tiny={tiny} />
    </g>
  );
}

/** The uniform's hat, where a Glim's own hat would sit: the bucket hat or the sports cap, crest at the front. */
export function UniformHat({ uniform, geo, back = false }: { uniform: Uniform; geo: BodyGeometry; back?: boolean }) {
  const kind = UNIFORM_HAT[uniform];
  if (!kind) return null;
  const s = Math.min(1.4, Math.max(0.95, geo.headW / 40));
  const st = { stroke: OUT, strokeWidth: 2.6, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  const green = U.poloGreen;
  const deep = U.poloGreenDeep;
  return (
    <g transform={`translate(${geo.top.x} ${geo.top.y + 4}) scale(${s.toFixed(3)})`}>
      {kind === 'bucket' ? (
        <>
          <path d="M-15.5 1C-16 -11 -10 -19 0 -19C10 -19 16 -11 15.5 1Z" fill={green} {...st} />
          <path d="M-15.6 -2.4H15.6V1.2H-15.6Z" fill={deep} />
          <path d="M-17 -0.4C-9 -2.6 9 -2.6 17 -0.4L25.5 8.6C14 4.6 -14 4.6 -25.5 8.6Z" fill={green} {...st} />
          <path d="M-20.5 4.8C-10 2.2 10 2.2 20.5 4.8M-23 7C-12 4 12 4 23 7" fill="none" stroke="#3f7e5f" strokeWidth={0.8} strokeDasharray="1.6 1.2" />
          {back ? null : <Crest x={0} y={-9.4} w={11.5} />}
          <ellipse cx={-9.6} cy={-13.4} rx={3} ry={1.6} transform="rotate(-38 -9.6 -13.4)" fill="#fff" opacity={0.35} />
        </>
      ) : (
        <>
          <path d="M-19 3C-19 -13 -10 -20 0 -20C10 -20 19 -13 19 3Z" fill={green} {...st} />
          <path d="M-3 -19.6C-6 -13 -7 -5 -7 2.6M10.5 -16C12.8 -10 13.4 -4 13.4 2.6" fill="none" stroke={deep} strokeWidth={1.2} />
          <circle cx={0} cy={-20.4} r={2.4} fill={deep} stroke={OUT} strokeWidth={1.4} />
          {back ? (
            <>
              {/* From behind: the peak's edge where it shows past the crown, and the strap with the gap above it. */}
              <path d="M-17 1.5C-6 -0.5 15 -0.5 29 5.5C21 11 -4 10 -17 5.2Z" fill={deep} {...st} />
              <path d="M-19 3C-19 -6 19 -6 19 3Z" fill={green} />
              <path d="M-6 3C-6 -3.4 6 -3.4 6 3Z" fill={deep} stroke={OUT} strokeWidth={1.4} strokeLinejoin="round" />
            </>
          ) : (
            <>
              {/* The peak, out to the front and side. */}
              <path d="M-17 1.5C-6 -0.5 15 -0.5 29 5.5C21 11 -4 10 -17 5.2Z" fill={deep} {...st} />
              <path d="M-13 4.2C-2 3 12 3.4 24 6.4" fill="none" stroke="#3f7e5f" strokeWidth={0.8} strokeDasharray="1.6 1.2" />
              <Crest x={2.6} y={-8.4} w={12} />
            </>
          )}
          <ellipse cx={-10.4} cy={-13.6} rx={3} ry={1.6} transform="rotate(-38 -10.4 -13.6)" fill="#fff" opacity={0.35} />
        </>
      )}
    </g>
  );
}
