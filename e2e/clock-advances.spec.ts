/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-only
 */
import { test, expect } from "@playwright/test";

test.setTimeout(60_000);

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
