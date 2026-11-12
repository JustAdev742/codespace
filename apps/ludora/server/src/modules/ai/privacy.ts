/*
 * Nothing personal goes to an AI provider. Tasks send only the content being
 * made, never account, class or student names; on top of that, email
 * addresses and phone numbers typed into that content are taken out here
 * before the text leaves the server, and the person is told how many.
 */

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Phone numbers start with + or 0 and have at least ten digits; plain numbers in maths questions do not match.
const PHONE = /(?<![\w.])(?:\+\d{1,3}[\s.-]?|0)(?:\(?\d{2,5}\)?[\s.-]?){2,4}\d{2,4}(?!\w|\.\d)/g;

const digits = (s: string) => s.replace(/\D/g, '').length;

export function removePersonalDetails(text: string): { text: string; removed: number } {
  let removed = 0;
  const out = text
    .replace(EMAIL, () => {
      removed++;
      return '[email removed]';
    })
    .replace(PHONE, (m) => {
      if (digits(m) < 10 || digits(m) > 15) return m;
      removed++;
      return '[phone number removed]';
    });
  return { text: out, removed };
}
