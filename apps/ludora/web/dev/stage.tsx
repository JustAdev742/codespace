// Development-only preview of the stage surfaces. Served by Vite at /dev/stage.html; not part of the app build.
import { createRoot } from 'react-dom/client';
import '../src/styles/app.css';
import { Stage } from '../src/ui/Stage.tsx';
import { Button } from '../src/ui/Button.tsx';
import { Badge, Input } from '../src/ui/primitives.tsx';

function Preview() {
  return (
    <Stage className="min-h-dvh px-4 py-10">
      <div className="mx-auto flex max-w-xl flex-col items-center gap-6 text-center">
        <h1 className="font-display text-5xl font-extrabold sm:text-6xl">Join a game</h1>
        <p className="text-text-2">Type the code on your teacher's screen.</p>
        <div className="paper stage-card w-full p-6 text-left">
          <label className="text-sm font-semibold" htmlFor="code">Game code</label>
          <Input id="code" placeholder="123 456" className="mt-1.5 h-14 text-center font-display text-3xl" />
          <Button variant="primary" size="2xl" className="mt-4 w-full">Join</Button>
          <p className="mt-3 text-sm text-text-3">No account needed. <span className="text-glim font-semibold">Mint text on paper</span></p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Button variant="secondary" size="lg">Secondary on stage</Button>
          <Button variant="success" size="lg">Correct</Button>
          <Button variant="danger" size="lg">Wrong</Button>
          <Badge tone="mint">Badge</Badge>
          <span className="text-lantern font-semibold">Lantern text</span>
        </div>
      </div>
    </Stage>
  );
}
createRoot(document.getElementById('root')!).render(<Preview />);
