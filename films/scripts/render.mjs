#!/usr/bin/env node
// Render a film: step the scene frame by frame in headless Chromium, then
// encode the frames with the mixed soundtrack.
//
//   node films/scripts/render.mjs <slug>                       full film -> films/out/<slug>.mp4
//   node films/scripts/render.mjs <slug> --from 12 --to 20     a section (still muxed with its audio)
//   node films/scripts/render.mjs <slug> --stills 1,5.5,30     a contact sheet of single frames
//   options: --width 1920 (frame width)  --workers 4  --frames <dir>  --out <file>
import { spawn } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const slug = argv[0];
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i < 0 ? fallback : argv[i + 1];
};
const width = Number(opt("width", 1920));
const height = Math.round((width * 9) / 16);
const workers = Number(opt("workers", 4));
const stills = opt("stills", null)?.split(",").map(Number);

const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".wav": "audio/wav", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png" };
const server = createServer(async (req, res) => {
  const path = normalize(join(root, decodeURIComponent(new URL(req.url, "http://x").pathname)));
  if (req.url === "/favicon.ico") return res.writeHead(204).end();
  if (!path.startsWith(root) || !existsSync(path) || !(await stat(path)).isFile()) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream", "cache-control": "no-store" });
  createReadStream(path).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/engine/player.html?film=${slug}`;

const run = (cmd, args) =>
  new Promise((ok, fail) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "inherit", "inherit"] });
    p.on("exit", (code) => (code === 0 ? ok() : fail(new Error(`${cmd} exited ${code}`))));
  });

const pinned = "/opt/pw-browsers/chromium";
const browser = await chromium.launch(existsSync(pinned) ? { executablePath: pinned } : {});
async function open() {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error("page error:", e.message));
  page.on("console", (m) => m.type() === "error" && console.error("console:", m.text()));
  await page.goto(url);
  await page.waitForFunction("window.__ready === true", null, { timeout: 30000 });
  return page;
}

try {
  if (stills) {
    const dir = opt("frames", join(tmpdir(), `stills-${slug}`));
    await mkdir(dir, { recursive: true });
    const page = await open();
    for (const [i, t] of stills.entries()) {
      await page.evaluate((t) => window.__render(t), t);
      await page.screenshot({ path: join(dir, `${String(i).padStart(3, "0")}.png`) });
    }
    const cols = Math.min(stills.length, Number(opt("cols", 3)));
    const out = opt("out", join(dir, "sheet.png"));
    await run("ffmpeg", ["-v", "error", "-y", "-framerate", "1", "-i", join(dir, "%03d.png"), "-vf", `tile=${cols}x${Math.ceil(stills.length / cols)}:padding=6:color=white`, "-frames:v", "1", out]);
    console.log(out);
  } else {
    const info = await (await open()).evaluate("window.__film");
    const fps = info.fps;
    const f0 = Math.round(Number(opt("from", 0)) * fps);
    const f1 = Math.min(info.frames, Math.round(Number(opt("to", info.duration)) * fps));
    const dir = opt("frames", join(tmpdir(), `frames-${slug}`));
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    let next = f0, done = 0;
    const started = Date.now();
    await Promise.all(
      Array.from({ length: workers }, async () => {
        const page = await open();
        while (next < f1) {
          const f = next++;
          await page.evaluate((t) => window.__render(t), f / fps);
          await page.screenshot({ path: join(dir, `${String(f - f0).padStart(6, "0")}.jpg`), type: "jpeg", quality: 93 });
          if (++done % 500 === 0) console.log(`  ${done}/${f1 - f0} frames, ${((Date.now() - started) / 1000).toFixed(0)}s`);
        }
        await page.close();
      }),
    );
    const out = opt("out", join(root, "out", `${slug}.mp4`));
    await mkdir(dirname(out), { recursive: true });
    const mixWav = join(root, slug, "build", "mix.wav");
    const srt = join(root, slug, "build", "captions.srt");
    const whole = f0 === 0 && f1 === info.frames;
    const args = ["-v", "error", "-y", "-framerate", String(fps), "-i", join(dir, "%06d.jpg")];
    if (existsSync(mixWav)) args.push("-ss", String(f0 / fps), "-t", String((f1 - f0) / fps), "-i", mixWav);
    if (whole && existsSync(srt)) args.push("-i", srt);
    args.push("-map", "0:v");
    if (existsSync(mixWav)) args.push("-map", "1:a", "-c:a", "aac", "-b:a", "192k");
    if (whole && existsSync(srt)) args.push("-map", "2:s", "-c:s", "mov_text", "-metadata:s:s:0", "language=eng");
    args.push("-c:v", "libx264", "-preset", "slow", "-crf", opt("crf", "20"), "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-shortest", out);
    await run("ffmpeg", args);
    console.log(`${out}  (${f1 - f0} frames, ${((Date.now() - started) / 1000).toFixed(0)}s)`);
  }
} finally {
  await browser.close();
  server.close();
}
