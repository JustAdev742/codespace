import { PageHeader, Panel } from '../../ui/primitives.tsx';
import { usePageTitle } from '../reports/reportUi.tsx';

/*
 * What in Ludora was made by others, and under which licence (the same list as CREDITS.md at the
 * root of the app). Everything else a player sees and hears was made for Ludora.
 */

const FACES = [
  { name: 'Bricolage Grotesque', by: 'Mathieu Triay', licence: 'SIL Open Font License 1.1', where: 'Headings, numbers and labels' },
  { name: 'Atkinson Hyperlegible Next', by: 'Braille Institute of America', licence: 'SIL Open Font License 1.1', where: 'Everything you read' },
  { name: 'Lato', by: 'Łukasz Dziedzic', licence: 'SIL Open Font License 1.1', where: "A school's own look" },
];

const SOFTWARE = [
  { name: 'React and React DOM', licence: 'MIT', what: 'The interface' },
  { name: 'React Router', licence: 'MIT', what: 'Pages and addresses' },
  { name: 'TanStack Query', licence: 'MIT', what: 'Fetching and keeping data' },
  { name: 'Radix UI', licence: 'MIT', what: 'Dialogs, menus, tabs and tooltips' },
  { name: 'Lucide', licence: 'ISC', what: 'Interface icons' },
  { name: 'Sonner', licence: 'MIT', what: 'Notices' },
  { name: 'three.js', licence: 'MIT', what: "3D games and the board's world" },
  { name: 'Socket.IO client', licence: 'MIT', what: 'The live connection to a room' },
  { name: 'qrcode-generator', licence: 'MIT', what: 'The join code as a QR code' },
  { name: 'Tailwind CSS', licence: 'MIT', what: 'Styles' },
];

export default function Credits() {
  usePageTitle('Credits');
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Credits" description="The Glims, the art, the worlds, the music and the sounds were made for Ludora. This is what was made by others, and the licence each is used under." />
      <div className="flex flex-col gap-5">
        <Panel className="p-5">
          <h2 className="mb-3 font-display text-2xl font-bold">Typefaces</h2>
          <ul className="flex flex-col divide-y divide-line">
            {FACES.map((f) => (
              <li key={f.name} className="flex flex-col gap-0.5 py-3">
                <span className="font-semibold">{f.name}</span>
                <span className="text-sm text-text-2">
                  By {f.by}. {f.licence}. {f.where}.
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel className="p-5">
          <h2 className="mb-3 font-display text-2xl font-bold">Sound</h2>
          <p className="text-text-2">The music and effects are Ludora's own. They are rendered with FluidSynth using the MuseScore General soundfont (MIT licence, with parts in the public domain or under CC0).</p>
        </Panel>
        <Panel className="p-5">
          <h2 className="mb-3 font-display text-2xl font-bold">Software</h2>
          <ul className="flex flex-col divide-y divide-line">
            {SOFTWARE.map((s) => (
              <li key={s.name} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5">
                <span className="font-semibold">{s.name}</span>
                <span className="text-sm text-text-2">
                  {s.what}. {s.licence} licence.
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        <p className="text-sm text-text-3">No art, sound, character or level comes from another game.</p>
      </div>
    </div>
  );
}
