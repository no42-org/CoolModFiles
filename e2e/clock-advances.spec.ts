/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-only
 */
import { test, expect } from "@playwright/test";

test.setTimeout(60_000);

// A minimal but *audible* 4-channel ProTracker ("M.K.") module, built in
// memory and served to the player in place of a real network track (see
// the page.route() below). The splash "play random track" path picks a
// non-deterministic modarchive id whose format may not even be
// libopenmpt-decodable (it could be AHX/PCM, routed to a different
// engine, or an Invalid-ID stub) — when that happens the worklet never
// decodes, the 🎶 title never appears, and this spec times out. Pinning
// the fetched bytes to a known-good looping square-wave module makes both
// "did it decode" and "is audio flowing" deterministic and removes the
// track-download network dependency. (The SSR `latestId` RSS fetch in
// getServerSideProps still runs, but it has a fallback and never gates
// this spec.)
function buildAudibleMod(): Buffer {
  const SAMPLE_WORDS = 128; // 256 bytes of 8-bit PCM
  const sampleBytes = SAMPLE_WORDS * 2;
  const HEADER_SIZE = 1084; // title + 31 sample headers + order table + "M.K."
  const PATTERN_SIZE = 64 * 4 * 4; // 64 rows × 4 channels × 4 bytes
  const buf = Buffer.alloc(HEADER_SIZE + PATTERN_SIZE + sampleBytes);

  buf.write("CMF TEST TONE", 0, "ascii"); // 20-byte song title

  // Sample 1 header (30 bytes at offset 20). Samples 2..31 stay zeroed
  // (length 0 = unused, which is valid).
  const s = 20;
  buf.write("square", s, "ascii"); // 22-byte sample name
  buf.writeUInt16BE(SAMPLE_WORDS, s + 22); // length in words
  buf[s + 24] = 0; // finetune
  buf[s + 25] = 64; // volume (max)
  buf.writeUInt16BE(0, s + 26); // repeat point (words)
  buf.writeUInt16BE(SAMPLE_WORDS, s + 28); // repeat length → loops forever

  buf[950] = 4; // song length: 4 orders
  buf[951] = 0x7f; // restart byte
  // Order table at 952 stays zeroed → every order points to pattern 0.
  buf.write("M.K.", 1080, "ascii"); // signature → 4 channels, 31 samples

  // Pattern 0: retrigger sample 1 at note C-2 (period 428) on channel 0
  // every 16 rows so audio keeps flowing for the whole pattern.
  const PERIOD = 428;
  for (let row = 0; row < 64; row += 16) {
    const off = HEADER_SIZE + row * 4 * 4; // row, channel 0
    buf[off] = (1 & 0xf0) | ((PERIOD >> 8) & 0x0f);
    buf[off + 1] = PERIOD & 0xff;
    buf[off + 2] = (1 & 0x0f) << 4; // low nibble of sample number
    buf[off + 3] = 0x00; // no effect
  }

  // Sample data: a signed 8-bit square wave (+64 / -64) → audible tone.
  const sampBase = HEADER_SIZE + PATTERN_SIZE;
  for (let i = 0; i < sampleBytes; i++) {
    buf[sampBase + i] = i < sampleBytes / 2 ? 0x40 : 0xc0;
  }
  return buf;
}

const MOD_FIXTURE = buildAudibleMod();

// Regression for https://github.com/no42-org/CoolModFiles/issues/11 plus
// the follow-up "clock advances but no audio reaches the speakers" case
// the prior version of this test couldn't catch.
//
// On Firefox/Linux new AudioContexts start in 'suspended' state per the
// autoplay policy and only transition to 'running' on an explicit
// resume() from a user-gesture context. If that resume() regresses,
// onaudioprocess never fires, libopenmpt's cursor never advances, and
// the clock display stays at 00:00.
//
// A subtler failure mode is that the context DOES resume (the clock
// advances) but the audio graph silently routes to a null sink — the
// original chiptune2/ScriptProcessor regression on Linux Firefox. This
// test taps every node→destination connection through an AnalyserNode
// so we can assert that non-zero samples are actually flowing through
// the graph, not just that the cursor moved.
test("audio reaches destination after user starts playback", async ({
  page,
}) => {
  await page.addInitScript(() => {
    // Force every new AudioContext into 'suspended' state — this is
    // what Firefox/Linux does by default, but other engines/OS combos
    // are more lenient. Wrapping the constructor here makes the
    // regression check deterministic across all three browser projects.
    const Orig = window.AudioContext;
    const Wrapped = new Proxy(Orig, {
      construct(target, args, newTarget) {
        const inst = Reflect.construct(target, args, newTarget);
        void inst.suspend();
        return inst;
      },
    });
    window.AudioContext = Wrapped;
    (
      window as unknown as { webkitAudioContext: typeof AudioContext }
    ).webkitAudioContext = Wrapped;

    // Audio-output tap. AnalyserNode is a passthrough node; inserting
    // one between any source and destination lets the test thread
    // sample the time-domain data without disturbing the audio path.
    // AnalyserNode sampling happens inside the audio rendering thread,
    // so it sees what the real destination sees.
    (window as unknown as { __cmfAudioPeak: number }).__cmfAudioPeak = 0;
    type CtxWithTap = AudioContext & { _cmfTap?: AnalyserNode };
    const origConnect = AudioNode.prototype.connect as unknown as (
      this: AudioNode,
      target: AudioNode | AudioParam,
      output?: number,
      input?: number
    ) => AudioNode | void;
    AudioNode.prototype.connect = function (
      this: AudioNode,
      target: AudioNode | AudioParam,
      output?: number,
      input?: number
    ): AudioNode {
      if (target instanceof AudioDestinationNode) {
        const ctx = target.context as CtxWithTap;
        if (!ctx._cmfTap) {
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 2048;
          ctx._cmfTap = analyser;
          origConnect.call(analyser, target);
          const buf = new Float32Array(analyser.fftSize);
          setInterval(() => {
            analyser.getFloatTimeDomainData(buf);
            let peak = 0;
            for (let i = 0; i < buf.length; i++) {
              const v = Math.abs(buf[i]);
              if (v > peak) peak = v;
            }
            const w = window as unknown as { __cmfAudioPeak: number };
            if (peak > w.__cmfAudioPeak) w.__cmfAudioPeak = peak;
          }, 50);
        }
        return origConnect.call(this, ctx._cmfTap, output, input) as AudioNode;
      }
      return origConnect.call(this, target, output, input) as AudioNode;
    } as typeof AudioNode.prototype.connect;
  });

  // Serve the deterministic fixture for whichever random modarchive id the
  // splash path resolves to, so the worklet always gets a decodable module.
  await page.route(/api\.modarchive\.org\/downloads\.php/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/octet-stream",
      body: MOD_FIXTURE,
    })
  );

  await page.goto("/");

  // Splash gate: the Player isn't mounted until the user clicks the
  // random-message button. This click also provides the gesture
  // activation the prewarm needs to resume the AudioContext.
  await page.locator(".randombtn").click();

  // 🎶 prefix on document.title is set by Player.tsx's onMetadata
  // handler once the worklet successfully decodes the module.
  await page.waitForFunction(() => document.title.startsWith("🎶"), null, {
    timeout: 30_000,
  });

  // The current-position span renders as mm:ss and is the first such
  // element on the page (the second is the track duration).
  const clock = page.locator("text=/^\\d{2}:\\d{2}$/").first();
  await expect(clock).not.toHaveText("00:00", { timeout: 15_000 });

  // Audio actually reaches the destination — not just the clock moved.
  // The threshold is intentionally low (0.001) so we catch even quiet
  // intros; the regression case produced exact-zero samples.
  await page.waitForFunction(
    () =>
      (window as unknown as { __cmfAudioPeak: number }).__cmfAudioPeak > 0.001,
    null,
    { timeout: 15_000 }
  );
});
