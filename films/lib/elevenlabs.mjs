// ElevenLabs client for the films pipeline.
//
// The SDK reads ELEVENLABS_API_KEY from the environment. Never put a key in code.
// Locally: `node --env-file-if-exists=.env.local ...` (see the films:* npm scripts).
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export const client = new ElevenLabsClient();

export const TTS_MODEL = "eleven_v4";
export const SFX_MODEL = "eleven_text_to_sound_v3";

// convert() resolves to a web ReadableStream; bridge it to a Node stream to write to disk.
async function save(stream, path) {
  await mkdir(dirname(path), { recursive: true });
  const node = typeof stream.pipe === "function" ? stream : Readable.fromWeb(stream);
  await pipeline(node, createWriteStream(path));
}

function cost(rawResponse) {
  const h = rawResponse?.headers;
  const v = h?.get?.("character-cost") ?? h?.get?.("x-character-count");
  return v == null ? null : Number(v);
}

/** One line of dialogue to an mp3. Returns the credits the request cost. */
export async function speak({ voiceId, text, stability = 0.4, similarity = 0.75, path, model = TTS_MODEL }) {
  const { data, rawResponse } = await client.textToSpeech
    .convert(voiceId, {
      text,
      modelId: model,
      outputFormat: "mp3_44100_128",
      voiceSettings: { stability, similarityBoost: similarity },
    })
    .withRawResponse();
  await save(data, path);
  return cost(rawResponse);
}

/** One sound effect to an mp3. Returns the credits the request cost. */
export async function soundEffect({ text, seconds, influence = 0.5, loop = false, path }) {
  const { data, rawResponse } = await client.textToSoundEffects
    .convert({
      text,
      modelId: SFX_MODEL,
      durationSeconds: seconds,
      promptInfluence: influence,
      loop,
    })
    .withRawResponse();
  await save(data, path);
  return cost(rawResponse);
}

/** Credits left on the account this month. */
export async function creditsLeft() {
  const sub = await client.user.subscription.get();
  return { used: sub.characterCount, limit: sub.characterLimit, left: sub.characterLimit - sub.characterCount };
}
