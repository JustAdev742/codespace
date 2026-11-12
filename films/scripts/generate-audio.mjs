#!/usr/bin/env node
// Generate the ElevenLabs audio a film needs: one mp3 per line of dialogue, plus
// the sound effects that are prompted rather than synthesized.
//
//   node --env-file-if-exists=.env.local films/scripts/generate-audio.mjs <slug> [--dry] [--only id,id] [--sfx-only] [--vo-only]
//
// Every file is cached against a hash of what produced it, so a re-run only
// spends credits on lines whose text, voice or settings changed.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith("--"));
const flag = (name) => args.includes(`--${name}`);
const only = (() => {
  const i = args.indexOf("--only");
  return i < 0 ? null : new Set(args[i + 1].split(","));
})();

if (!slug) {
  console.error("usage: generate-audio.mjs <slug> [--dry] [--only id,id] [--sfx-only] [--vo-only]");
  process.exit(2);
}

const film = (await import(pathToFileURL(join(root, slug, "script.mjs")).href)).default;
const audioDir = join(root, slug, "audio");
const manifestPath = join(audioDir, "manifest.json");
const manifest = existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, "utf8")) : {};
const hash = (o) => createHash("sha256").update(JSON.stringify(o)).digest("hex").slice(0, 16);

const jobs = [];
if (!flag("sfx-only")) {
  for (const beat of film.beats) {
    if (!beat.who || !beat.text || beat.clip) continue;
    const cast = film.cast[beat.who];
    if (!cast) throw new Error(`${beat.id}: no cast entry for ${beat.who}`);
    const spec = {
      kind: "vo",
      voiceId: cast.voice,
      text: beat.text,
      stability: beat.stability ?? cast.stability ?? 0.4,
      similarity: cast.similarity ?? 0.75,
      model: cast.model ?? film.model,
    };
    jobs.push({ id: beat.id, file: `vo/${beat.id}.mp3`, spec, chars: beat.text.length });
  }
}
if (!flag("vo-only")) {
  for (const [id, s] of Object.entries(film.sfx ?? {})) {
    const spec = { kind: "sfx", text: s.prompt, seconds: s.seconds, influence: s.influence ?? 0.5, loop: !!s.loop };
    jobs.push({ id, file: `sfx/${id}.mp3`, spec, chars: 0 });
  }
}

const todo = jobs.filter((j) => {
  if (only && !only.has(j.id)) return false;
  const have = manifest[j.file];
  return !(have && have.hash === hash(j.spec) && existsSync(join(audioDir, j.file)));
});

const voChars = todo.filter((j) => j.spec.kind === "vo").reduce((n, j) => n + j.chars, 0);
console.log(
  `${slug}: ${jobs.length} clips, ${todo.length} to generate ` +
    `(${todo.filter((j) => j.spec.kind === "vo").length} lines / ${voChars} characters, ` +
    `${todo.filter((j) => j.spec.kind === "sfx").length} effects)`,
);
if (flag("dry") || todo.length === 0) process.exit(0);

const { speak, soundEffect, creditsLeft } = await import("../lib/elevenlabs.mjs");
const before = await creditsLeft();
console.log(`credits: ${before.left} of ${before.limit} left`);
if (voChars > before.left) {
  console.error(`not enough credits for ${voChars} characters of dialogue; nothing generated`);
  process.exit(1);
}

await mkdir(join(audioDir, "vo"), { recursive: true });
await mkdir(join(audioDir, "sfx"), { recursive: true });

let spent = 0;
let failed = 0;
async function run(job) {
  const path = join(audioDir, job.file);
  for (let attempt = 1; ; attempt++) {
    try {
      const credits =
        job.spec.kind === "vo" ? await speak({ ...job.spec, path }) : await soundEffect({ ...job.spec, path });
      spent += credits ?? 0;
      manifest[job.file] = { hash: hash(job.spec), credits, text: job.spec.text };
      console.log(`  ok   ${job.file}  ${credits ?? "?"} credits`);
      return;
    } catch (err) {
      const status = err?.statusCode ?? err?.status;
      if ((status === 429 || status >= 500) && attempt < 4) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
        continue;
      }
      failed++;
      console.error(`  FAIL ${job.file}  ${status ?? ""} ${err?.message ?? err}`.slice(0, 400));
      return;
    }
  }
}

// The free plan allows two requests at a time.
const queue = [...todo];
await Promise.all(
  Array.from({ length: 2 }, async () => {
    while (queue.length) {
      await run(queue.shift());
      await writeFile(manifestPath, JSON.stringify(manifest, null, 1));
    }
  }),
);

const after = await creditsLeft();
console.log(`done: ${todo.length - failed} generated, ${failed} failed, ~${spent} credits; ${after.left} left`);
process.exit(failed ? 1 : 0);
