## What is this?

It's a web player for chiptune **MOD** files. Open the side drawer (the playlist icon in the player footer) to pick a source — tracks from [modarchive.org](https://modarchive.org), a server-curated **Library**, your **Local** files, your **Favorites**, or this Help.

## Sources

The drawer has five tabs: **Mod Archive**, **Library**, **Local**, **♥ Favorites**, **? Help**.

- **Mod Archive** — drill-in menu for ways to find tracks on [modarchive.org](https://modarchive.org):
  - **🎲 Random** — click "Play random" to play a random module. Each click resets prev/next history.
  - **⭐ Top Favorites** — most-favorited mods on the site.
  - **⬇ Most Downloads** — most-downloaded mods.
  - **🏆 Most Revered** — highest-rated mods.
  - **🎤 Artist Charts** — top artists; tap to see and play their mods.
- **Library** — browses a server-curated collection (only visible when the operator has configured one).
- **Local** — drop your own MOD files into the browser. Files stay on your device for the session — nothing is uploaded.
- **♥ Favorites** — your saved tracks. Click any to play.
- **? Help** — this document.

The drawer stays open after you pick a track so you can keep browsing. Close it with the × button in the corner or the `Esc` key.

`n` / random-next and auto-advance pick from whatever source is currently playing. When you pick a track from a Mod Archive chart (Top Favorites, Most Downloads, Most Revered, or an artist's mods), `n` walks the chart in order and loops back to the first track at the end. A Library track skips to another Library track; a Local track shuffles within your dropped files.

## How do I use it?

You can whether use your mouse/touchpad to click on the cyberpunk-themed cool icons or choose the dark path of hacky key bindings.

| Key              | Action                       |
| ---------------- | ---------------------------- |
| [enter][space]   | play/pause                   |
| [up][n][k]       | play the next (random) song  |
| [down][p][j]     | play the previous song       |
| [right][l]       | skip forward 5 seconds       |
| [left][h]        | skip back 5 seconds          |
| [a]              | volume up 5%                 |
| [z]              | volume down 5%               |
| [<span>x</span>] | mute/unmute volume           |
| [shift]          | minimize/maximize the player |
| [1]              | turn on/off repeat           |
| [d]              | download the song            |
| [e]              | copy the embed code          |
| [/][q]           | show this message            |

## Sharing

The URL updates automatically as tracks change. Copy the address bar to share a track — modarchive uses `?trackId=N` (and the equivalent `?source=modarchive&id=N`), library uses `?source=library&path=…`. Local files have no shareable URL.

The embed code (`e` key) builds an `<iframe>` you can paste into a webpage. Modarchive embeds use `/embed/N`; library embeds use `/embed/library/<path>`. Local files are not embeddable.

## What are modules?

Modules are a family of music files, which all originated back on the computer known as the **Commodore Amiga** in the late **1980s.**

A MOD file contains a set of instruments in the form of samples, a number of patterns indicating how and when the samples are to be played, and a list of what patterns to play in what order.

## Project History

The idea for **CoolModFiles** originated among two programmer friends who used to send mod files to each other, which lead to the creation of a personal
mod archive - one which had hundreds of cool modules at the time!
Being in possession of those rare works of art (all the way from 80s!) was a privilege...
When the awesome tracks started piling up, however, it naturally brought about a storage problem. The solution was simple: using a web archive!

The programmer friends' idea, unfortunately, was beaten by [modarchive.org](https://modarchive.org) many years ago. Realizing how unnecessary creating another internet archive was, the project evolved into a cool web player instead. A group of 3 came together to create what is known today as [CoolModFiles.com](https://CoolModFiles.com).
With it's modern look, it continues to surface thousands of long-forgotten mod files to introduce newer generations to the world of old-school digital music.

**With ❤️**,  
\- [@orhun](https://github.com/orhun), [@wkfo](https://github.com/wkfo), [@bufgix](https://github.com/bufgix)
