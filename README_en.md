# TikTok Plus

[简体中文](README.md)

Add keyboard shortcuts, individual comment translation, and continuous bulk translation to TikTok on the web.

## Shortcuts

### Playback

| Shortcut | Action |
| --- | --- |
| `Space` | Play or pause the current video |
| `↑` / `↓` | Go to the previous / next video |
| `←` / `→` | Seek backward / forward by 5 seconds |
| `H` / `F` | Cinema fullscreen (includes the action bar) |
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
- Captions are horizontally centered in both normal playback and cinema fullscreen, keeping the site's caption width limit.
- Most shortcuts are disabled while an editable field is focused to avoid interfering with typing. `Esc`, `Shift + F`, and `Shift + ?` still work.
- Interaction shortcuts rely on controls available on the current TikTok page. A TikTok UI update may require adapting individual shortcuts.

### Cinema fullscreen

- `H` / `F` enters cinema fullscreen: the whole page goes fullscreen and the current player card is laid out next to the action bar on black. Press it again or press `Esc` to exit.
- The video keeps its original aspect ratio: portrait videos get pillarboxing and landscape videos get letterboxing, so nothing is stretched or cropped. The layout recomputes on resize and when the video changes.
- The action bar (avatar and follow, like, comment, favorite, share, music) is visible and clickable in fullscreen, with the same behaviour as on the page.
- The “⋯” menu works in fullscreen: playback speed, mini player, captions, not interested, and report all open and respond to clicks. Previously only the player card went fullscreen, while TikTok portals that menu outside the card, so clicking it appeared to do nothing; fullscreening the document keeps the popover inside the fullscreen subtree.
- The bottom-left video info and the action bar fade out after about 2.4 seconds without interaction, while captions remain visible and horizontally centered at the bottom of the player. Controls return on mouse movement, click, wheel, or key press. They stay visible while the video is paused, a menu is open, the shortcut panel is open, a text field is focused, or the pointer rests on the info area or the bar.
- Pressing `X` opens comments inside fullscreen: the comment rail renders normally and the player plus action bar re-center in the remaining space, then recenter again when comments close.
- The page's own navigation, sidebars, and recommendation rail are hidden while fullscreen and fully restored on exit, without disturbing the page's player.
- TikTok currently paints frames on a super-resolution canvas layer and keeps the `<video>` element transparent. While fullscreen, the script switches back to the video layer and frames it with `contain`.
- If the browser rejects the fullscreen request (for example without a user gesture or due to site policy), the script falls back to clicking the page's own fullscreen control. When neither works it reports `Fullscreen not allowed` instead of failing silently, and leaves no fullscreen layout behind.

## Comment translation

- A “翻译” (Translate) button appears below top-level comments and expanded replies. Empty, image-only, and emoji-only comments are skipped.
- Click to translate into Simplified Chinese. Toggle “查看原文” (View original) / “查看译文” (View translation) without another request. Results are cached in memory for the current video, including when scrolling replaces comment nodes or the panel is reopened.
- “翻译全部” (Translate all), next to the comments heading, translates loaded comments and expanded replies, then continues as you scroll or manually expand replies. It does not scroll or expand replies for you. If the heading structure is not recognized, individual translation remains available.
- “全部查看原文” (View all originals) restores originals and stops automatic translation. Enabling again reuses cached results. Individually choosing an original is respected until you show its translation or re-enable the bulk toggle.
- The toggle stays enabled for the current video: closing the panel pauses it, and reopening resumes it. Switching videos or refreshing turns it off and clears the memory cache.
- Bulk requests run one at a time, at least 300ms apart. Individual failures do not stop other comments and are retried only manually or when bulk translation is re-enabled. HTTP 429 stops automatic translation, preserves successful results, and shows “请求受限，已停止” (Rate limited, stopped).
- Failures leave the original intact. Click “翻译失败，重试” (Translation failed, retry) to retry manually. Only the comment text is translated; usernames, images, and existing actions are preserved.
- Each first translation or retry sends that comment's text to `translate.googleapis.com` using an anonymous request without cookies. Enabling bulk translation also sends newly loaded comment text. The script requests only `GM_xmlhttpRequest` and cross-origin access to that domain; no API key is needed.
- This unofficial Google endpoint may be rate-limited or become unavailable. Translation quality and availability are not guaranteed, and your network must be able to reach the domain.
- To update an installed script, save the new version and refresh TikTok. If the userscript manager prompts for connection permission, allow only `translate.googleapis.com`.

## Verification

Open [`tests/comment-translation.html`](tests/comment-translation.html) in a browser to run translation interaction, shortcut, and cinema-fullscreen regression checks automatically. Responses are mocked; no requests are sent to Google. Refresh to rerun. The fullscreen cases mirror TikTok's real topology — the action bar is a sibling of the media card, and the menu popover is portalled outside the card's subtree — and assert that menu items are actually hit-tested with `document.elementFromPoint`, not merely that `.click()` fires. This does not replace acceptance testing on TikTok with an actual userscript manager.

## License

[MIT](LICENSE)
