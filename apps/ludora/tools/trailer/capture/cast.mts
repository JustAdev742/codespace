// CDP screencast recorder: lossless-ish frames on every paint, resampled to a constant frame rate.
import type { Page } from '@playwright/test';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

export interface Cast {
  stop(): Promise<{ frames: number; fpsIn: number }>;
}

/** Starts recording `page`. `stop()` writes `dir/f0001.jpg`… at `fps`, holding each painted frame until the next. */
export async function startCast(page: Page, dir: string, fps = 30, quality = 92): Promise<Cast> {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames: { ts: number; data: string }[] = [];
  cdp.on('Page.screencastFrame', (f: { data: string; sessionId: number; metadata: { timestamp: number } }) => {
    frames.push({ ts: f.metadata.timestamp, data: f.data });
    void cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality, everyNthFrame: 1 });
  const began = Date.now() / 1000;
  return {
    async stop() {
      const ended = Date.now() / 1000;
      await cdp.send('Page.stopScreencast').catch(() => {});
      await cdp.detach().catch(() => {});
      if (!frames.length) return { frames: 0, fpsIn: 0 };
      // Screencast timestamps are seconds since the epoch, like Date.now() / 1000.
      const t0 = Math.min(began, frames[0]!.ts);
      const t1 = ended;
      let n = 0;
      let k = 0;
      for (let t = t0; t < t1; t += 1 / fps) {
        while (k + 1 < frames.length && frames[k + 1]!.ts <= t) k++;
        n++;
        writeFileSync(`${dir}/f${String(n).padStart(4, '0')}.jpg`, Buffer.from(frames[k]!.data, 'base64'));
      }
      return { frames: n, fpsIn: frames.length / Math.max(0.001, frames[frames.length - 1]!.ts - frames[0]!.ts) };
    },
  };
}
