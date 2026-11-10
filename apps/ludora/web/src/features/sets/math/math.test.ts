import { describe, expect, it } from 'vitest';
import { hasMath, mathToPlain, mathToWords, parseMath, splitMath } from './parse.ts';

describe('maths notation', () => {
  it('reads fractions, powers, subscripts, roots and groups', () => {
    expect(parseMath('3/4')).toEqual([{ t: 'frac', num: [{ t: 'text', v: '3' }], den: [{ t: 'text', v: '4' }] }]);
    expect(parseMath('x^2')).toEqual([{ t: 'sup', base: [{ t: 'text', v: 'x' }], exp: [{ t: 'text', v: '2' }] }]);
    expect(parseMath('x^{n+1}')).toEqual([{ t: 'sup', base: [{ t: 'text', v: 'x' }], exp: [{ t: 'text', v: 'n+1' }] }]);
    expect(parseMath('H_2O')).toEqual([{ t: 'sub', base: [{ t: 'text', v: 'H' }], sub: [{ t: 'text', v: '2' }] }, { t: 'text', v: 'O' }]);
    expect(parseMath('sqrt(16)')).toEqual([{ t: 'sqrt', x: [{ t: 'text', v: '16' }] }]);
    expect(parseMath('{a+b}/{2}')).toEqual([{ t: 'frac', num: [{ t: 'text', v: 'a+b' }], den: [{ t: 'text', v: '2' }] }]);
  });
  it('only treats $...$ with a maths mark as maths, so prices stay prices', () => {
    expect(hasMath('A book costs $5 and a pen $2.')).toBe(false);
    expect(hasMath('What is $3/4$ of 20?')).toBe(true);
    expect(splitMath('What is $3/4$ of 20?').map((s) => s.text)).toEqual(['What is ', '3/4', ' of 20?']);
  });
  it('says the maths in words and writes it plainly where only text fits', () => {
    expect(mathToWords('What is $3/4$ of 20?')).toBe('What is 3 over 4 of 20?');
    expect(mathToWords('Simplify $x^2 + x^3$')).toBe('Simplify x squared plus x cubed');
    expect(mathToWords('$H_2O$ is water')).toBe('H sub 2 O is water');
    expect(mathToWords('$sqrt(16)$')).toBe('the square root of 16');
    expect(mathToWords('$2^{10}$')).toBe('2 to the power 10');
    expect(mathToPlain('What is $3/4$ of $x^2$? $H_2O$ and $sqrt(9)$')).toBe('What is 3/4 of x²? H₂O and √(9)');
  });
});
