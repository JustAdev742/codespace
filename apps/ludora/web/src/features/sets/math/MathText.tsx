import { Fragment, type ReactNode } from 'react';
import { mathToWords, splitMath, type MathNode } from './parse.ts';

/*
 * Question text with its maths drawn properly: fractions stacked, powers
 * raised, subscripts lowered, roots under a radical. Screen readers get the
 * words ("3 over 4") instead of the drawing. Plain text passes straight through.
 */

function Nodes({ nodes }: { nodes: MathNode[] }) {
  return (
    <>
      {nodes.map((n, i) => (
        <Node key={i} n={n} />
      ))}
    </>
  );
}

function Node({ n }: { n: MathNode }): ReactNode {
  switch (n.t) {
    case 'text':
      return n.v;
    case 'sup':
      return (
        <>
          <Nodes nodes={n.base} />
          <sup className="text-[0.68em] leading-none">
            <Nodes nodes={n.exp} />
          </sup>
        </>
      );
    case 'sub':
      return (
        <>
          <Nodes nodes={n.base} />
          <sub className="text-[0.68em] leading-none">
            <Nodes nodes={n.sub} />
          </sub>
        </>
      );
    case 'frac':
      return (
        <span className="mx-[0.12em] inline-flex flex-col items-center align-middle text-[0.82em] leading-[1.05]">
          <span className="px-[0.15em]">
            <Nodes nodes={n.num} />
          </span>
          <span className="w-full border-t-[0.09em] border-current px-[0.15em]">
            <Nodes nodes={n.den} />
          </span>
        </span>
      );
    case 'sqrt':
      return (
        <span className="inline-flex items-stretch whitespace-nowrap">
          <span className="pr-[0.05em]">√</span>
          <span className="border-t-[0.08em] border-current pl-[0.08em]">
            <Nodes nodes={n.x} />
          </span>
        </span>
      );
  }
}

/** Text that may hold $...$ maths. Without any, it renders the text as it is. */
export function MathText({ text }: { text: string }) {
  const parts = splitMath(text);
  if (!parts.some((p) => p.math)) return <>{text}</>;
  return (
    <>
      <span className="sr-only">{mathToWords(text)}</span>
      <span aria-hidden>
        {parts.map((p, i) => (p.math ? (
          <span key={i} className="whitespace-nowrap">
            <Nodes nodes={p.nodes} />
          </span>
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        )))}
      </span>
    </>
  );
}
