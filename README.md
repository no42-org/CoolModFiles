# [CoolModFiles.com](https://CoolModFiles.com)

![CoolModFiles](https://user-images.githubusercontent.com/24392180/86676327-2962d800-c003-11ea-8e8f-6ebceebd78fb.png)

> **Module file** (MOD music, tracker music) is a family of music file formats originating from the **MOD** file format on Amiga systems used in the late 1980s. Those who produce these files (using the software called music trackers) and listen to them form the worldwide MOD scene, a part of the _demoscene_ subculture.
> A **MOD** file contains a set of instruments in the form of samples, a number of patterns indicating how and when the samples are to be played, and a list of what patterns to play in what order.[\*](https://en.wikipedia.org/wiki/Module_file)[\*](https://modarchive.org/index.php?article-modules)

CoolModFiles is a web player that will introduce you to the most obscure and legendary tracks hosted on the internet's biggest module archive, [modarchive.org](https://modarchive.org)!

The web player works by simply fetching a random module from [modarchive.org](https://modarchive.org) and playing it. **No black magic involved!**

The idea for CoolModFiles originated among two programmer friends who used to send mod files to each other, which lead to the creation of a personal
mod archive - one which had hundreds of cool modules at the time! Being in possession of those rare works of art (all the way from 80s!) was a privilege...
When the awesome tracks started piling up, however, it naturally brought about a storage problem. The solution was simple: using a web archive!

The programmer friends' idea, unfortunately, was beaten by [modarchive.org](https://modarchive.org) many years ago. Realizing how unnecessary creating another internet archive was, the project evolved into a cool web player instead. A group of 3 came together to create what is known today as [CoolModFiles.com](https://CoolModFiles.com). With it's modern look, it continues to surface thousands of long-forgotten mod files to introduce newer generations to the world of old-school digital music.

[Click here to watch the introduction video](https://www.youtube.com/watch?v=NZa5hne8Noo).

## Formats

CoolModFiles plays three families of Amiga music, plus archival recordings of lost modules:

- **Module files** (`.mod`, `.xm`, `.it`, `.s3m`, `.mptm`, `.stm`, `.mtm`, `.669`, `.med`, `.okt`, `.ult`, `.amf`) through [libopenmpt](https://lib.openmpt.org/libopenmpt/) — available from all sources (Mod Archive, Library, Local drop). `.amf` covers both the Asylum Music Format V1.0 (Amiga) and DSMI's Advanced Module Format (PC); libopenmpt distinguishes them by content.
- **AHX / THX** (`.ahx`, `.thx`) — Dexter & Pink of Abyss' synth-based Amiga tracker from 1992 — through [ahx2play](https://github.com/8bitbubsy/ahx2play). Available from **Mod Archive** (~1,000 modules in the `.ahx` catalogue), **Library**, and **Local drop**. The engine is selected automatically by magic-byte sniff, so files reaching the player through any source route correctly.
- **TFMX** (Chris Hülsbeck / Jochen Hippel two-file Amiga game-music format, e.g. Apidya, Turrican) through [libtfmxaudiodecoder](https://github.com/mschwendt/libtfmxaudiodecoder) — available from **Library** and **Local drop**. Pairs are recognised across four naming conventions: `*.tfx + *.sam`, `mdat.* + smpl.*`, `*.mdat + *.smpl`, or `dns.* + smp.*` (Chris Hülsbeck's **Dynamic Synthesizer**, his pre-TFMX format — e.g. Hollywood Poker Pro, Starball; pairs are recognised now, with playback arriving once the bundled decoder is bumped to libtfmx ≥ 1.0.10). Both halves must be present together; the catalog (Library or Local) surfaces each pair as a single row.
- **Single-file libtfmx formats** — Jochen Hippel TFMX / MCMD (`.hip`, `.hipc`, `.hip7`, `.mcmd`) and Future Composer (`.fc`, `.fc3`, `.fc4`, `.fc13`, `.fc14`, `.smod`) — decoded by the same libtfmx engine. Unlike the Huelsbeck pairs these are self-contained single files (no separate sample bank), so a lone file plays directly. Available from **Library** browse/search and **Local drop**. (The ambiguous `.mdat`/`.tfm`/`.tfmx` names remain pair-only for now.)
- **PCM recordings** (`.mp3`, `.ogg`, `.flac`) — archival recordings of tracker modules whose original `.mod` file has been lost. Available from **Library** and **Local drop**. The browser's native decoders handle playback; no WASM, no decoder dependency. A "recording" badge in the player surface signals the archival framing — tracker-specific controls (Amiga emulation, stereo separation, pattern viewer) are hidden because the bytes are pre-rendered stereo audio rather than a live-rendered module.

## Keyboard shortcuts

| Key                | Action                                          |
| ------------------ | ----------------------------------------------- |
| `enter` / `space`  | play / pause                                    |
| `↑` / `n` / `k`    | play the next (random) song                     |
| `↓` / `p` / `j`    | play the previous song                          |
| `→` / `l`          | skip forward 5 seconds                          |
| `←` / `h`          | skip back 5 seconds                             |
| `a`                | volume up 5%                                    |
| `z`                | volume down 5%                                  |
| `x`                | mute / unmute volume                            |
| `shift`            | minimize / maximize the player                  |
| `1`                | turn repeat on / off                            |
| `d`                | download the current track                      |
| `e`                | copy the embed code                             |
| `m`                | cycle Amiga emulation (off / A500 / A1200)      |
| `/` or `q`         | open in-app Help                                |
| `esc`              | close the side drawer                           |

## Sound settings

The Sound pane (side drawer → Sound) persists three preferences across
sessions: **Amiga emulation** (off / A500 / A1200; also bound to `m`),
**Stereo separation** (slider), and **Filename style**.

**Amiga emulation** only applies to classic MOD files (libopenmpt-reported
`type === "mod"`). When a PC-tracker format (XM / IT / S3M / MPTM / etc.)
is loaded, the radio group is disabled and an inline hint explains why —
Paula emulation has no meaning for tracks that were never authored for
Amiga hardware. AHX and TFMX engines also disable the radio group with
their own hints: AHX renders through ahx2play's built-in Paula model, and
TFMX renders through libtfmx's own playback engine. The `m` keyboard
shortcut still cycles the stored preference even when the radios are
visually disabled — it takes effect on the next MOD track.

**Stereo separation** is enabled across every engine: libopenmpt honours
the value live; AHX honours it live via ahx2play's native stereo separation
at the same 0..100 scale; TFMX honours it on the **next** track (libtfmx's
panning is fixed at `tfx_mixer_init` time — slider drag during a TFMX track
records the value but doesn't change the currently-playing audio).

The **Filename style** toggle is display-only and has three options:

- **Auto** (default) — render filenames verbatim as on disk.
- **Amiga** — render Amiga-native module filenames in scene prefix form
  across every catalog: `echoing.mod` → `mod.echoing`, `space.med` →
  `med.space`, `quartet.okt` → `okt.quartet`, `dexter.ahx` (and
  `dexter.thx`) → `ahx.dexter`. Covers `.mod`, `.med`, `.okt`, `.ahx`,
  and `.thx`; PC-era tracker formats are left unchanged.
- **Amiga everywhere** — the same prefix transform, extended to every
  supported module format including PC-era trackers: `dreamland.xm` →
  `xm.dreamland`, `groove.it` → `it.groove`, `rush.s3m` → `s3m.rush`,
  etc. Trades historical accuracy for visual consistency across all
  catalog rows.

TFMX pair rows always render as `<base> (TFMX)` regardless of the
chosen style — the `(TFMX)` suffix carries the format identity, and the
underlying file shapes (`*.tfx + *.sam`, `mdat.* + smpl.*`, `*.mdat +
*.smpl`) make a single prefix label misleading. Downloads always keep
the canonical on-disk filename, and hovering a row reveals the on-disk
basename in a tooltip so it remains copyable for search/share.

## Spectrum analyzer

The expanded player shows a spectrum analyzer next to the disc icon,
driven by the master mix so it reacts uniformly across libopenmpt, AHX,
and TFMX playback. Two visual styles ship: **gradient bars** (the
default — 20 log-grouped bars in the app's white→cyan→magenta palette
with a peak-hold line) and an **LED graphic equalizer** modelled on the
Technics SH-8055 12-channel real-time spectrum analyzer (12 cyan tile
bands with dB scale, dual Hz rows, `(Hz)` prefix, and faint grid lines). Click the analyzer canvas (or focus it and press
Enter / Space) to cycle between styles; the choice persists across
sessions in `localStorage`.

## Development

```bash
cp .env.example .env   # fill in DOMAIN (and LIBRARY_ROOT if used)
make build             # build the Next.js app
make image             # build the Docker image
make run               # run the image locally on :3000 (uses .env if present)
make help              # list all targets
```

See [`.env.example`](.env.example) for the runtime environment variables.

### Library mode (optional)

The player can browse and play MOD files, AHX/THX files, **and TFMX pairs**
from a directory on the host machine in addition to ModArchive's random feed.
Set `LIBRARY_ROOT` to an absolute path inside the container; the Library tab
appears in the source drawer when this is configured. TFMX pairs are
recognised across the same three naming conventions as Local drop
(`*.tfx + *.sam`, `mdat.* + smpl.*`, `*.mdat + *.smpl`); both halves must
live in the same directory.

For local dev, drop a `mods/` folder in the repo root — `make run` will mount
it read-only into the container at `/library` and set `LIBRARY_ROOT=/library`
automatically.

For production, mount your collection as a read-only Docker volume:

```bash
docker run -d -p 3000:3000 \
  -v /path/to/mods:/library:ro \
  -e LIBRARY_ROOT=/library \
  -e DOMAIN=https://your.domain \
  ghcr.io/no42-org/coolmodfiles:latest
```

The `:ro` flag is required as defense-in-depth; the API itself is read-only,
but the kernel-level mount enforcement removes any chance of accidental writes.

After bringing the server up with a populated library, run the security
smoke test:

```bash
bash scripts/test-library-security.sh
```

It exercises path traversal protection, method allowlists, and the
extension filter. Expects to find at least one valid module file in the
library; `.txt` and similar non-allowlisted extensions should not be
present at the root.

### Icons

The React components in `icons/` are pre-generated from SVG sources
that aren't in this repo. To regenerate or add an icon, use a one-off
`npx @svgr/cli <svg-source> -d icons/` invocation — `@svgr/cli` is no
longer a permanent dev dependency since the icons are checked-in
artifacts.

## License

GNU General Public License[\*](https://www.gnu.org/licenses/gpl.txt)
