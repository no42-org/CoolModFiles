/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-only
 */

// Pre-warm an AudioContext on the first user gesture anywhere on the
// document. Firefox (esp. Linux) only honours resume() inside an active
// gesture, and that activation is lost across React's effect-scheduling
// boundary by the time the Player's useEffect constructs ChiptuneJsPlayer.
// Using a capture-phase listener guarantees this runs before any React
// onClick on the same event. See issue #11.
//
// Player.tsx / EmbedPlayer.tsx pass this context to chiptune3 via its
// constructor's `context` config option so the autoplay-policy fix
// survives the chiptune2 -> chiptune3 migration.
(function () {
  if (typeof document === "undefined") return;
  var prewarm = function () {
    if (window.__chiptunePrewarmedAudioContext) return;
    var Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    var ctx = new Ctor();
    ctx.resume();
    window.__chiptunePrewarmedAudioContext = ctx;
    document.removeEventListener("click", prewarm, true);
    document.removeEventListener("keydown", prewarm, true);
    document.removeEventListener("touchstart", prewarm, true);
  };
  document.addEventListener("click", prewarm, true);
  document.addEventListener("keydown", prewarm, true);
  document.addEventListener("touchstart", prewarm, true);
})();
