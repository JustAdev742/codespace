// Runs the API server and the web dev server together with prefixed output.
import { spawn } from 'node:child_process';

const procs = [
  { name: 'server', color: 35, args: ['run', 'dev', '-w', '@ludora/server'] },
  { name: 'web', color: 36, args: ['run', 'dev', '-w', '@ludora/web'] },
].map(({ name, color, args }) => {
  const child = spawn('npm', args, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  const tag = `\x1b[${color}m[${name}]\x1b[0m `;
  const pipe = (stream, out) => stream.on('data', (d) => out.write(d.toString().split('\n').filter(Boolean).map((l) => tag + l).join('\n') + '\n'));
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    console.log(`${tag}exited with ${code}`);
    for (const p of procs) if (p !== child) p.kill();
    process.exit(code ?? 0);
  });
  return child;
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => procs.forEach((p) => p.kill(sig)));
