# TikTok Plus

[简体中文](README.md)

Add keyboard shortcuts to TikTok on the web for playback, video interactions, and search.

## Shortcuts

### Playback

| Shortcut | Action |
| --- | --- |
| `Space` | Play or pause the current video |
| `↑` / `↓` | Go to the previous / next video |
| `←` / `→` | Seek backward / forward by 5 seconds |
| `H` / `F` | Toggle player fullscreen |
| `Esc` | Exit fullscreen, or close the shortcut panel if it is open |

### Interactions

| Shortcut | Action |
| --- | --- |
| `Z` | Like the current video |
| `X` | Open the comments panel |
| `C` | Favorite the current video |
| `V` | Copy the current page title and URL |
| `B` | Toggle danmaku (if the page provides a matching control) |
| `R` | Mark the video as not interested |
| `G` | Follow the creator |

### Search and help

| Shortcut | Action |
| --- | --- |
| `Shift + F` | Focus the search box |
| `Shift + ?` | Show / hide the shortcut panel |

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/).
2. Create a userscript in the manager, paste the full contents of [`tiktok_plus.js`](tiktok_plus.js), and save it.
3. Open or refresh [TikTok on the web](https://www.tiktok.com/).

## Notes

- The script matches `https://www.tiktok.com/*` only.
- Most shortcuts are disabled while an editable field is focused to avoid interfering with typing. `Esc`, `Shift + F`, and `Shift + ?` still work.
- Interaction shortcuts rely on controls available on the current TikTok page. A TikTok UI update may require adapting individual shortcuts.

## License

[MIT](LICENSE)
