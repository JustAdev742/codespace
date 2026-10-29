import type { SchoolTheme } from './config.ts';

/** The browser bar to match each school's look, in the dark and light schemes. */
const BAR: Record<SchoolTheme, { dark: string; light: string }> = {
  'hills-grammar': { dark: '#0B1F17', light: '#FAFCFC' },
};

/**
 * The app's page with a school's look switched on: `data-school` on <html>, which the stylesheet
 * picks up before the first paint, and a browser bar to match. Unchanged when there is no school look.
 */
export function withSchoolTheme(html: string, theme: SchoolTheme | undefined): string {
  if (!theme) return html;
  const bar = BAR[theme];
  return html
    .replace(/<html\b([^>]*)>/, `<html$1 data-school="${theme}">`)
    .replace(/(<meta name="theme-color" content=")[^"]*(" media="\(prefers-color-scheme: dark\)")/, `$1${bar.dark}$2`)
    .replace(/(<meta name="theme-color" content=")[^"]*(" media="\(prefers-color-scheme: light\)")/, `$1${bar.light}$2`);
}
