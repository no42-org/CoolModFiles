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

CoolModFiles plays two families of Amiga music:

- **Module files** (`.mod`, `.xm`, `.it`, `.s3m`, `.mptm`, `.stm`, `.mtm`, `.669`, `.med`, `.okt`, `.ult`) through [libopenmpt](https://lib.openmpt.org/libopenmpt/) — available from all sources (Mod Archive, Library, Local drop).
- **TFMX** (Chris Hülsbeck / Jochen Hippel two-file Amiga game-music format, e.g. Apidya, Turrican) through [libtfmxaudiodecoder](https://github.com/mschwendt/libtfmxaudiodecoder) — **Local drop only**. Drop both halves of each pair (`*.tfx + *.sam`, `mdat.* + smpl.*`, or `*.mdat + *.smpl`) and the catalog surfaces each pair as a single row.

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

The player can browse and play MOD files from a directory on the host machine
in addition to ModArchive's random feed. Set `LIBRARY_ROOT` to an absolute path
inside the container; the Library tab appears in the source drawer when this
is configured.

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

### Known npm audit advisories

`npm audit` reports two moderate `postcss` advisories pulled in
transitively through `next`. The suggested "fix" downgrades Next.js
from 16.x to 9.3.3, so it isn't viable. Upstream-blocked until Next
ships an updated `postcss` pin; no local action required.

## License

GNU General Public License[\*](https://www.gnu.org/licenses/gpl.txt)
