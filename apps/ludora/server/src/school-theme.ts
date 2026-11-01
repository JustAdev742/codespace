import type { SchoolTheme } from './config.ts';

/**
 * The app's page with a school's look switched on: `data-school` on <html>, which the stylesheet
 * and the logo and Glim code pick up before the first paint. Unchanged when there is no school look.
 */
export function withSchoolTheme(html: string, theme: SchoolTheme | undefined): string {
  return theme ? html.replace(/<html\b([^>]*)>/, `<html$1 data-school="${theme}">`) : html;
}
