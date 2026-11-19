import type { SchoolTheme } from './config.ts';

/**
 * What the browser itself shows for a school's copy: the colour of its tab and title bar, and the
 * installed app's name and colours (the web manifest in public/schools/<id>/). The header is the
 * school's deep green in both colour schemes, so the bar matches it in both.
 */
const SCHOOL_HEAD: Record<SchoolTheme, { themeColor: string; manifest: string }> = {
  'hills-grammar': { themeColor: '#083A2B', manifest: '/schools/hills-grammar/manifest.webmanifest' },
};

/**
 * The app's page with a school's look switched on: `data-school` on <html>, which the stylesheet
 * and the logo and Glim code pick up before the first paint, and the school's tab colour and web
 * manifest. Unchanged when there is no school look.
 */
export function withSchoolTheme(html: string, theme: SchoolTheme | undefined): string {
  if (!theme) return html;
  const head = SCHOOL_HEAD[theme];
  return html
    .replace(/<html\b([^>]*)>/, `<html$1 data-school="${theme}">`)
    .replace(/<meta name="theme-color" content="[^"]*"/g, `<meta name="theme-color" content="${head.themeColor}"`)
    .replace(/<link rel="manifest" href="[^"]*"/, `<link rel="manifest" href="${head.manifest}"`);
}
