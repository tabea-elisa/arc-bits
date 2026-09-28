# Arc Bits — working notes

Unpacked Chrome MV3 extension (personal, not Web Store). Recovers Arc browser
habits after moving to Chrome's native vertical tabs. Private repo:
`github.com/tabea-elisa/arc-bits`.

## The invariant

**Pinned and grouped tabs are never closed by anything in this extension.**

Tab groups stand in for Arc's Spaces: grouped or pinned means "keep", everything
else is disposable. This is a firm requirement, not a default — preserve it in
any new feature. `isDisposable()` in `background.js` is the single predicate both
the sweep and the archiver go through; keep it that way.

Every destructive path also needs an undo:
- `⌘⇧K` sweep → buffer in `chrome.storage.session`, restored by clicking the toolbar icon
- auto-archive → list in `chrome.storage.local`, shown in the options page

## Shortcuts

| Key | Command | Notes |
|---|---|---|
| `⌘⇧X` | copy-url | moved off `⌘⇧C` so Chrome's native inspect-element still works |
| `⌘⇧E` | rename-tab | |
| `⌘⇧G` | move-to-group | shadows Chrome's Find Previous; accepted tradeoff |
| `⌘⇧K` | close-ungrouped | |

Chrome allows at most 4 suggested keys per manifest — we are at the limit. Any
new command has to be bound by hand at `chrome://extensions/shortcuts`.

## Layout

| File | Purpose |
|---|---|
| `background.js` | Service worker (ES module). Commands, archiving, tab bookkeeping. |
| `ui.js` | Dialogs injected into pages: rename, confirm, group picker, toast. |
| `options.html` / `options.js` | Archive settings and the archive list. |
| `offscreen.html` / `offscreen.js` | Clipboard fallback for unscriptable pages. |

## Gotchas

- **Injected functions must be fully self-contained.** Everything in `ui.js` is
  passed to `chrome.scripting.executeScript({func})`, which serialises by source.
  No imports, no module-scope references, no closures. CSS is inlined per dialog
  for this reason — a shared constant will not survive injection.
- **Some pages cannot be scripted**: `chrome://*`, the Web Store, the PDF viewer.
  Every `executeScript` call needs a `try`/`catch` with a badge or offscreen
  fallback. Do not assume a dialog can be shown.
- **SPAs rewrite `document.title`.** `enforceTitle()` holds a rename in place with
  a MutationObserver plus a 1s interval. Both are needed; Gmail and Jira defeat the
  observer alone.
- **Renames live in `chrome.storage.session`**, keyed by tab id, so they clear on
  browser restart. That matches Arc's behaviour and is intentional.
- **Chrome cannot open DevTools from an extension.** No API exists, `devtools://`
  navigation is blocked, and `chrome.debugger` gives a protocol connection, not the
  UI. Do not re-litigate this; the fix for inspect shortcuts is OS-level remapping.

## Testing

No build step and no test suite. To verify a change:

1. `chrome://extensions` → **Reload** on Arc Bits.
2. A manifest permission change needs that manual reload; it will not hot-apply.
3. Service worker errors surface behind the **service worker** link on the
   extension's card, not in the page console.
4. Syntax check before reloading:
   `for f in background.js ui.js; do cp $f /tmp/c.mjs && node --check /tmp/c.mjs; done`

Auto-archive runs on a 5-minute alarm against a 12h idle default, so to exercise it
in real time drop the threshold to 1 hour in the options page first.
