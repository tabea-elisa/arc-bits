# Arc Bits

Arc-style tab habits for Chrome, for people who moved off Arc and miss a few things.

| Shortcut | Action |
|---|---|
| `⌘⇧X` | Copy current tab URL |
| `⌘⇧E` | Rename current tab (survives reloads and SPA title rewrites) |
| `⌘⇧G` | Move current tab to a group — type to filter, or type a new name to create |
| `⌘⇧K` | Close every ungrouped tab in this window |

Plus **auto-archive**: ungrouped, unpinned tabs you haven't touched in 12 hours close
themselves and land in a recoverable list.

On Windows/Linux the bindings are the same with `Ctrl` in place of `⌘`.

## The one rule

**Pinned and grouped tabs are never closed by anything here.** Tab groups stand in for
Arc's Spaces: grouped or pinned means keep, everything else is disposable.

Auto-archive additionally skips the active tab in each window, tabs playing audio, and
the last remaining tab in a window.

## Install

1. Download / clone this folder.
2. Go to `chrome://extensions` and turn on **Developer mode** (top right).
3. **Load unpacked** → select the folder.
4. `chrome://extensions/shortcuts` → confirm the four bindings.
5. Right-click the toolbar icon → **Options** to set the archive threshold or turn
   auto-archive off.

Requires Chrome 121+ (`tab.lastAccessed`). Vertical tabs need Chrome 146+, though the
extension works either way.

## Undo

- Clicking the toolbar icon reopens the last `⌘⇧K` sweep.
- Auto-archived tabs are listed in **Options**, newest first, with reopen-one and
  reopen-all. Keeps the most recent 200.

## Shortcut conflicts worth knowing

- `⌘⇧G` shadows Chrome's **Find Previous**. `⇧Enter` inside the find bar still does
  the same job. Rebind at `chrome://extensions/shortcuts` if you'd rather keep it.
- `⌘⇧C` is deliberately left alone so Chrome's native inspect-element still works.

## Privacy

Collects nothing, sends nothing anywhere. No servers, no analytics, no network
requests of any kind. Tab titles and URLs stay on your machine in
`chrome.storage.local` (settings, archive list) and `chrome.storage.session`
(renames, undo buffer).

The broad `<all_urls>` host permission is needed because the dialogs and the title
enforcement are injected into whatever page you're on. Nothing is injected until you
press one of the shortcuts.

## Files

| File | Purpose |
|---|---|
| `manifest.json` | Permissions, shortcut bindings |
| `background.js` | Service worker — commands, archiving, tab bookkeeping |
| `ui.js` | Dialogs injected into pages (rename, confirm, group picker, toast) |
| `options.html` / `options.js` | Settings and the archive list |
| `offscreen.html` / `offscreen.js` | Clipboard fallback for unscriptable pages |
