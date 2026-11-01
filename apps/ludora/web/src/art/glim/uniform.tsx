import type { BodyGeometry } from './bodies.ts';
import { UNIFORM_HAT, type Uniform } from './uniform.ts';

/*
 * The Hills Grammar uniform drawn on a Glim (see uniform.ts for what each one is). The garment is
 * drawn inside the body's outline, under the cel shading, so it takes the same light as the Glim
 * and fits every body shape. The collar and tie sit on the neck anchor and the hats on the head,
 * like accessories, in the same crisp outlined style.
 */

const OUT = '#06170f';
const GREEN = '#15593d';
const GREEN_DEEP = '#0c3d2a';
const GREEN_LIGHT = '#3f8a63';
const RED = '#d6262e';
const RED_DEEP = '#a01a22';
const CREST_RED = '#ee3124';
const CREAM = '#f4ead6';
const MAROON = '#7a1f2e';

/** The badge on the hats and blazer: the crest's red target, ringed in white. */
function Badge({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill="#fff" stroke={OUT} strokeWidth={r * 0.28} />
      <circle cx={x} cy={y} r={r * 0.7} fill={CREST_RED} />
      <circle cx={x} cy={y} r={r * 0.44} fill="#fff" />
      <circle cx={x} cy={y} r={r * 0.2} fill={CREST_RED} />
    </g>
  );
}

/** The garment, for inside the body's clip. `tiny` drops the small details. */
export function UniformGarment({ uniform, geo, tiny }: { uniform: Uniform; geo: BodyGeometry; tiny: boolean }) {
  const cx = geo.face.x;
  const n = geo.neck;
  const top = `M-10 ${n + 3}Q${cx} ${n - 7} 130 ${n + 3}V140H-10Z`;
  const seam = `M-10 ${n + 3}Q${cx} ${n - 7} 130 ${n + 3}`;
  const vee = `M${cx - 8.5} ${n - 3.4}L${cx + 8.5} ${n - 3.4}L${cx} ${n + 9}Z`;
  const fill = uniform === 'junior' ? RED : GREEN;
  return (
    <g>
      <path d={top} fill={fill} />
      {uniform === 'junior' ? (
        <>
          {/* Pullover: a cream shirt in the V, ribbing along the neckline. */}
          <path d={vee} fill={CREAM} />
          <path d={`M${cx - 8.5} ${n - 3.4}L${cx} ${n + 9}L${cx + 8.5} ${n - 3.4}`} fill="none" stroke={RED_DEEP} strokeWidth={2.2} strokeLinejoin="round" />
        </>
      ) : null}
      {uniform === 'senior' ? (
        <>
          {/* Blazer: cream shirt in the V, lapels piped in red, the crest badge on the pocket. */}
          <path d={vee} fill={CREAM} />
          <path d={`M${cx - 8.5} ${n - 3.4}L${cx} ${n + 9}L${cx - 4} ${n + 11}L${cx - 13} ${n - 1}Z`} fill={GREEN_DEEP} />
          <path d={`M${cx + 8.5} ${n - 3.4}L${cx} ${n + 9}L${cx + 4} ${n + 11}L${cx + 13} ${n - 1}Z`} fill={GREEN_DEEP} />
          <path d={`M${cx - 8.5} ${n - 3.4}L${cx} ${n + 9}L${cx + 8.5} ${n - 3.4}`} fill="none" stroke={RED} strokeWidth={1.4} strokeLinejoin="round" />
          {tiny ? null : <Badge x={cx + 15} y={n + 7} r={2.6} />}
        </>
      ) : null}
      {uniform === 'sport' && !tiny ? (
        <>
          {/* Polo: the white and red chest stripes. */}
          <path d={`M-10 ${n + 6.5}H130`} stroke="#fff" strokeWidth={1.8} />
          <path d={`M-10 ${n + 9.4}H130`} stroke={RED} strokeWidth={1.8} />
        </>
      ) : null}
      <path d={seam} fill="none" stroke={OUT} strokeWidth={1.8} opacity={0.75} />
    </g>
  );
}

/** Collar and tie (or the polo's collar), on the neck anchor. */
export function UniformCollar({ uniform, geo }: { uniform: Uniform; geo: BodyGeometry }) {
  const st = { stroke: OUT, strokeWidth: 1.5, strokeLinejoin: 'round' as const };
  if (uniform === 'sport') {
    return (
      <g transform={`translate(${geo.face.x} ${geo.neck})`}>
        <path d="M-1 -3.5C-5 -5 -11 -3.5 -12 0L-2.5 2.5Z" fill={GREEN} {...st} />
        <path d="M1 -3.5C5 -5 11 -3.5 12 0L2.5 2.5Z" fill={GREEN} {...st} />
        <path d="M-10.5 -0.6L-3 1.6M10.5 -0.6L3 1.6" stroke="#fff" strokeWidth={1} strokeLinecap="round" />
        <path d="M0 2.5V8" stroke={OUT} strokeWidth={1.2} />
        <circle cx={0} cy={4.4} r={0.9} fill="#fff" />
        <circle cx={0} cy={7} r={0.9} fill="#fff" />
      </g>
    );
  }
  const tie = uniform === 'senior' ? RED : MAROON;
  const stripe = uniform === 'senior' ? GREEN : '#e9e3d4';
  return (
    <g transform={`translate(${geo.face.x} ${geo.neck})`}>
      <path d="M-1.5 -3.5L-9.5 -4.5L-6 2.5Z" fill={CREAM} {...st} />
      <path d="M1.5 -3.5L9.5 -4.5L6 2.5Z" fill={CREAM} {...st} />
      <path d="M-1.7 1.4L1.7 1.4L2.9 10.6L0 13.4L-2.9 10.6Z" fill={tie} {...st} />
      <path d={uniform === 'senior' ? 'M-2.4 6.6L2.3 3.4M-2.7 10.4L2.8 6.6' : 'M-2.2 5.6L2.2 3.6M-2.6 8.8L2.5 6.8M-1.6 11.8L2.7 10'} stroke={stripe} strokeWidth={uniform === 'senior' ? 1.5 : 0.9} />
      <path d="M-2.4 -2.4H2.4L1.8 1.6H-1.8Z" fill={tie} {...st} />
    </g>
  );
}

/** The uniform's hat, where a Glim's own hat would sit. */
export function UniformHat({ uniform, geo }: { uniform: Uniform; geo: BodyGeometry }) {
  const kind = UNIFORM_HAT[uniform];
  if (!kind) return null;
  const s = Math.min(1.4, Math.max(0.95, geo.headW / 40));
  const st = { stroke: OUT, strokeWidth: 2.6, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  return (
    <g transform={`translate(${geo.top.x} ${geo.top.y + 4}) scale(${s.toFixed(3)})`}>
      {kind === 'bucket' ? (
        <>
          <path d="M-17 2C-17 -13 -10 -20 0 -20C10 -20 17 -13 17 2Z" fill={GREEN} {...st} />
          <path d="M-17.4 -1.6H17.4V2.4H-17.4Z" fill={GREEN_DEEP} />
          <path d="M-26 1.5C-18 -1.5 18 -1.5 26 1.5L23 10C12 6.2 -12 6.2 -23 10Z" fill={GREEN} {...st} />
          <path d="M-21 6.6C-12 3.8 12 3.8 21 6.6" fill="none" stroke={GREEN_LIGHT} strokeWidth={1.1} strokeDasharray="2 2" />
          <Badge x={0} y={-9} r={4.6} />
          <ellipse cx={-10} cy={-13} rx={3.2} ry={1.8} transform="rotate(-35 -10 -13)" fill="#fff" opacity={0.4} />
        </>
      ) : (
        <>
          <path d="M-19 3C-19 -13 -10 -20 0 -20C10 -20 19 -13 19 3Z" fill={GREEN} {...st} />
          <path d="M0 -19.5V2M-11 -15C-13 -9 -13.5 -3 -13.5 2.5M11 -15C13 -9 13.5 -3 13.5 2.5" fill="none" stroke={GREEN_DEEP} strokeWidth={1.3} opacity={0.8} />
          <circle cx={0} cy={-20.4} r={2.4} fill={GREEN_DEEP} stroke={OUT} strokeWidth={1.4} />
          <path d="M-17 1.5C-6 -0.5 15 -0.5 28 5.5C20 10.5 -4 9.5 -17 5.2Z" fill={GREEN_DEEP} {...st} />
          <Badge x={-2} y={-8.5} r={4.4} />
          <ellipse cx={-10} cy={-13} rx={3.2} ry={1.8} transform="rotate(-35 -10 -13)" fill="#fff" opacity={0.4} />
        </>
      )}
    </g>
  );
}
