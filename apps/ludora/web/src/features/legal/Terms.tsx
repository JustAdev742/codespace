import { Link } from 'react-router';
import { H2, LegalPage, List, OperatorNote, P } from './legal.tsx';

/** The rules for using Ludora, in plain words. */
export default function Terms() {
  return (
    <LegalPage title="Terms of use" intro="These are the rules for using Ludora. They are short, and they apply to everyone: students, teachers and staff.">
      <OperatorNote what="page" />

      <H2>Be kind</H2>
      <List>
        <li>Names, question sets and pictures must be fine for a classroom.</li>
        <li>No bullying, hate, or sharing anyone's personal details.</li>
        <li>Staff can change names, hide sets and pictures, and pause or close accounts that break these rules. You will be told why.</li>
      </List>

      <H2>Your account</H2>
      <List>
        <li>One person per account. Do not share your password or let others use your account.</li>
        <li>Keep your recovery code somewhere safe: it is the only way back in if you forget your password.</li>
        <li>You can download your data or delete your account at any time in Settings.</li>
      </List>

      <H2>What you make</H2>
      <List>
        <li>The question sets and pictures you make are yours.</li>
        <li>Making a set public lets other Ludora players use it in their games, even if you later delete your account. Make it private again to stop that.</li>
        <li>Only upload pictures you are allowed to use, and never pictures of other people without their permission.</li>
      </List>

      <H2>Sparks, Glims and items</H2>
      <List>
        <li>They exist only in Ludora. They have no money value, cannot be bought with real money, and cannot be sold, traded for money or moved to another account.</li>
        <li>The chances for what a Lantern holds are shown before you open it, and the server decides the result.</li>
        <li>Staff may fix balances or items that came from a mistake.</li>
      </List>

      <H2>Play fair</H2>
      <List>
        <li>Do not try to break, overload or slow down Ludora, get into other people's accounts, or use programs to play for you.</li>
        <li>Teachers decide how games and homework run in their classes.</li>
      </List>

      <H2>No promises it never stops</H2>
      <P>Ludora is offered as it is. It may change, a game may end early when the server restarts, and the people running this copy may stop running it. Results saved before then stay saved.</P>

      <H2>Your data</H2>
      <P>
        The <Link to="/privacy" className="font-semibold underline underline-offset-2">privacy policy</Link> says what Ludora keeps about you and how to get it deleted.
      </P>

      <H2>Changes</H2>
      <P>When these rules change, the date at the top changes too.</P>
    </LegalPage>
  );
}
