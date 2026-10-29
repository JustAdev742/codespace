import { Link } from 'react-router';
import { H2, LegalPage, List, OperatorNote, P, useOperator, ContactLink } from './legal.tsx';

/** What Ludora keeps, why, who sees it, for how long, and how to get it deleted. */
export default function Privacy() {
  const op = useOperator().data;
  const ask = op?.operatorContact ? (
    <>
      the people who run this copy (<ContactLink contact={op.operatorContact} />)
    </>
  ) : (
    'the people who run this copy of Ludora'
  );
  return (
    <LegalPage title="Privacy policy" intro="Ludora is a learning game for classrooms. This page says what it keeps about you, why, who can see it, and how to download or delete it. It is written for students as well as adults.">
      <OperatorNote what="policy" />

      <H2>What Ludora keeps</H2>
      <List>
        <li>
          <strong className="text-text">If you join a game without an account:</strong> the name you type, and your answers and score in that game, so the teacher's report adds up.
        </li>
        <li>
          <strong className="text-text">For an account:</strong> your username, display name, password (stored scrambled, so nobody can read it, staff included), account type (player, student or teacher), your friend code and settings. The year you were born is optional; Ludora keeps only an age group, to pick safer settings for younger players.
        </li>
        <li>
          <strong className="text-text">What you do in Ludora:</strong> games you play and host, answers and scores, Sparks earned and spent, Glims and items, quests and achievements, friends and blocked players, classes, and the question sets and pictures you make. Location and other hidden details are removed from pictures when you upload them.
        </li>
        <li>
          <strong className="text-text">Safety records:</strong> reports you make about names or sets, and any action staff take on your account.
        </li>
        <li>
          <strong className="text-text">To keep you signed in safely:</strong> one sign-in cookie, and for each sign-in your browser's name and a scrambled form of your internet address (never the address itself). Ludora also records app errors, without your answers or personal details, so they can be fixed.
        </li>
      </List>
      <P>Ludora does not ask for your email, phone number, home address, photo or location.</P>

      <H2>Why</H2>
      <List>
        <li>To run games and save your progress.</li>
        <li>So teachers can see how their classes did and set homework.</li>
        <li>To keep players safe: stopping rude names, spam, cheating and people guessing passwords.</li>
        <li>To find and fix problems.</li>
      </List>
      <P>There are no adverts. Your information is not sold, not used to track you on other websites, and not shared with analytics companies.</P>

      <H2>Who can see it</H2>
      <List>
        <li>
          <strong className="text-text">Players in a game with you:</strong> your display name, your Glim buddy and your score.
        </li>
        <li>
          <strong className="text-text">Leaderboards:</strong> your display name and buddy, only while "Show me on public leaderboards" is on in Settings.
        </li>
        <li>
          <strong className="text-text">Your profile:</strong> everyone, friends only, or only you, as you choose in Settings.
        </li>
        <li>
          <strong className="text-text">Teachers:</strong> the results of players in their classes and in games they host.
        </li>
        <li>
          <strong className="text-text">Staff who run this copy</strong> (moderators, support and administrators): what they need to help you and keep people safe. Every change staff make is recorded.
        </li>
        <li>
          <strong className="text-text">Other companies:</strong> the hosting company that stores Ludora's database for the people running it. If AI question drafts are switched on, a teacher's topic and notes are sent to Anthropic to write draft questions; nothing about players is sent.
        </li>
      </List>

      <H2>Cookies and storage</H2>
      <P>
        Ludora uses one cookie, <code className="font-semibold text-text">ludora_sid</code>, to keep you signed in for up to 30 days. Your browser also remembers a few choices on your device: day or night theme, sound on or off, 3D quality and question sets you have not saved yet. There are no advertising or tracking cookies.
      </P>

      <H2>How long it is kept</H2>
      <List>
        <li>Your account and what you do in Ludora: until you delete the account.</li>
        <li>Sign-in records: removed a week after the sign-in ends.</li>
        <li>Guest accounts: removed once nobody can get back into them (a week after their last sign-in ends), and never before they are 30 days old.</li>
        <li>Game results: kept for teachers' reports. If a player deletes their account, their results stay under the name "Player".</li>
        <li>Backups of the database are kept for as long as the people running this copy say in their own policy.</li>
      </List>

      <H2>Your choices</H2>
      <List>
        <li>
          <strong className="text-text">Download your data:</strong> <Link to="/settings#your-data" className="font-semibold underline underline-offset-2">Settings, Your data</Link>, Download my data. You get a file with everything Ludora keeps about your account.
        </li>
        <li>
          <strong className="text-text">Delete your account:</strong> in the same place. It cannot be undone.
        </li>
        <li>
          <strong className="text-text">Change who sees you:</strong> <Link to="/settings#privacy" className="font-semibold underline underline-offset-2">Settings, Privacy</Link>.
        </li>
        <li>
          <strong className="text-text">Fix something wrong:</strong> change your display name in Settings, or ask {ask} about anything else.
        </li>
      </List>
      <P>If you are not happy with the answer you get, you can complain to the privacy regulator where you live. In Australia that is the Office of the Australian Information Commissioner.</P>

      <H2>Younger players</H2>
      <P>Ludora is made for students aged 8 to 17, so it asks for as little as it can. A parent or carer can download or delete a child's account from that account's Settings, or ask {ask} to do it.</P>

      <H2>Changes</H2>
      <P>When this policy changes, the date at the top changes too.</P>
    </LegalPage>
  );
}
