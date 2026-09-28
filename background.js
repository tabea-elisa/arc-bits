import { renamePrompt, confirmPrompt, groupPicker, showToast } from './ui.js';

const RENAMES = 'renamedTabs';
const LAST_CLOSED = 'lastClosedBatch';
const ARCHIVE = 'archive';
const SETTINGS = 'settings';
const ARCHIVE_ALARM = 'arc-bits-archive';

const DEFAULTS = {
  archiveEnabled: true,
  archiveHours: 12,
  archiveKeep: 200,
};

const NO_GROUP = chrome.tabGroups.TAB_GROUP_ID_NONE;

async function getSettings() {
  const stored = await chrome.storage.local.get(SETTINGS);
  return { ...DEFAULTS, ...(stored[SETTINGS] || {}) };
}

// ---------------------------------------------------------------- rename state

async function getRenames() {
  const stored = await chrome.storage.session.get(RENAMES);
  return stored[RENAMES] || {};
}

async function setRename(tabId, title) {
  const map = await getRenames();
  if (title === null) delete map[tabId];
  else map[tabId] = title;
  await chrome.storage.session.set({ [RENAMES]: map });
}

// Holds a custom title in place against SPAs that rewrite document.title.
// Injected, so it must stay self-contained.
function enforceTitle(title) {
  const KEY = '__arcBitsRename';
  if (title === null) {
    if (window[KEY]) {
      window[KEY].stop();
      delete window[KEY];
    }
    return;
  }
  if (window[KEY]) {
    window[KEY].set(title);
    return;
  }

  let desired = title;
  const apply = () => {
    if (document.title !== desired) document.title = desired;
  };

  const observer = new MutationObserver(apply);
  const titleEl = document.querySelector('title');
  if (titleEl) observer.observe(titleEl, { childList: true });
  observer.observe(document.head || document.documentElement, {
    childList: true,
    subtree: true,
  });

  // Safety net: some apps swap the whole <head> or set the title off-DOM.
  const timer = setInterval(apply, 1000);
  apply();

  window[KEY] = {
    set: (next) => {
      desired = next;
      apply();
    },
    stop: () => {
      observer.disconnect();
      clearInterval(timer);
    },
  };
}

// -------------------------------------------------------------------- helpers

async function notify(tab, text) {
  if (!tab?.id) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: showToast,
      args: [text],
    });
  } catch {
    // Unscriptable page — the badge carries the signal instead.
  }
}

async function flashBadge(text, color) {
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text });
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 1200);
}

// ------------------------------------------------------------------- clipboard

let offscreenReady = null;

async function ensureOffscreen() {
  if (offscreenReady) return offscreenReady;
  offscreenReady = (async () => {
    const existing = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
    });
    if (existing.length) return;
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['CLIPBOARD'],
      justification: 'Copy the current tab URL when the page cannot be scripted.',
    });
  })();
  return offscreenReady;
}

async function copyUrl(tab) {
  const url = tab.url || '';
  if (!url) return;

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async (text) => {
        try {
          await navigator.clipboard.writeText(text);
          return true;
        } catch {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.cssText = 'position:fixed;top:-9999px;opacity:0';
          document.body.appendChild(ta);
          ta.select();
          const ok = document.execCommand('copy');
          ta.remove();
          return ok;
        }
      },
      args: [url],
    });

    if (result?.result) {
      await notify(tab, 'Copied URL');
      return;
    }
  } catch {
    // Not scriptable (chrome://, Web Store, PDF viewer) — fall through.
  }

  await ensureOffscreen();
  const res = await chrome.runtime.sendMessage({
    target: 'offscreen-clipboard',
    text: url,
  });
  await flashBadge(res?.ok ? '✓' : '✕', res?.ok ? '#1e9e5a' : '#c0392b');
}

// ---------------------------------------------------------------------- rename

async function renameTab(tab) {
  let picked;
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: renamePrompt,
      args: [tab.title || ''],
    });
    picked = result?.result;
  } catch {
    await flashBadge('✕', '#c0392b'); // page cannot be scripted
    return;
  }

  if (picked === null || picked === undefined) return;

  const title = picked === '' ? null : picked;
  await setRename(tab.id, title);

  if (title === null) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: enforceTitle,
      args: [null],
    });
    await chrome.tabs.reload(tab.id);
  } else {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: enforceTitle,
      args: [title],
    });
  }
}

// ------------------------------------------------------------- move to a group

async function moveToGroup(tab) {
  const groups = await chrome.tabGroups.query({ windowId: tab.windowId });

  let picked;
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: groupPicker,
      args: [
        groups.map((g) => ({ id: g.id, title: g.title || '', color: g.color })),
        tab.groupId,
      ],
    });
    picked = result?.result;
  } catch {
    await flashBadge('✕', '#c0392b'); // no dialog possible on this page
    return;
  }

  if (!picked) return;

  if (picked.groupId !== undefined) {
    if (picked.groupId === tab.groupId) return;
    await chrome.tabs.group({ tabIds: [tab.id], groupId: picked.groupId });
    const group = groups.find((g) => g.id === picked.groupId);
    await notify(tab, `Moved to ${group?.title || 'group'}`);
  } else {
    const groupId = await chrome.tabs.group({
      tabIds: [tab.id],
      createProperties: { windowId: tab.windowId },
    });
    await chrome.tabGroups.update(groupId, { title: picked.create });
    await notify(tab, `Created ${picked.create}`);
  }
}

// ------------------------------------------------------- close ungrouped tabs

// A tab is disposable when it is in no group and not pinned. Everything the
// archiver and the sweep touch goes through this one predicate.
function isDisposable(tab) {
  return tab.groupId === NO_GROUP && !tab.pinned;
}

async function closeUngrouped() {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabs = await chrome.tabs.query({ currentWindow: true });

  // The active tab is spared too, so the shortcut never yanks the page out
  // from under you.
  const victims = tabs.filter((t) => isDisposable(t) && t.id !== active?.id);

  if (!victims.length) {
    await notify(active, 'No ungrouped tabs to close');
    return;
  }

  const n = victims.length;
  const plural = n === 1 ? 'tab' : 'tabs';
  let confirmed = false;
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: active.id },
      func: confirmPrompt,
      args: [
        `Close ${n} ungrouped ${plural}?`,
        'Pinned tabs, grouped tabs and this tab are kept. Click the Arc Bits toolbar icon to restore.',
        `Close ${n}`,
      ],
    });
    confirmed = result?.result === true;
  } catch {
    // Active tab cannot host a dialog (chrome://) — require a second press.
    const pending = await chrome.storage.session.get('pendingClose');
    if (pending.pendingClose && Date.now() - pending.pendingClose < 5000) {
      await chrome.storage.session.remove('pendingClose');
      confirmed = true;
    } else {
      await chrome.storage.session.set({ pendingClose: Date.now() });
      await flashBadge(String(n), '#d08a1e');
      return;
    }
  }

  if (!confirmed) return;

  await chrome.storage.session.set({
    [LAST_CLOSED]: victims.map((t) => t.url).filter(Boolean),
  });
  await chrome.tabs.remove(victims.map((t) => t.id));
  await notify(active, `Closed ${n} ${plural}`);
  await flashBadge('↺', '#4b4b50');
}

async function restoreLastClosed() {
  const stored = await chrome.storage.session.get(LAST_CLOSED);
  const urls = stored[LAST_CLOSED] || [];
  if (!urls.length) {
    // Nothing in the sweep buffer — show the archive instead.
    await chrome.runtime.openOptionsPage();
    return;
  }
  for (const url of urls) {
    await chrome.tabs.create({ url, active: false });
  }
  await chrome.storage.session.remove(LAST_CLOSED);
  await chrome.action.setBadgeText({ text: '' });
}

// -------------------------------------------------------------- auto-archiving

async function runArchive() {
  const settings = await getSettings();
  if (!settings.archiveEnabled) return;

  const cutoff = Date.now() - settings.archiveHours * 3600 * 1000;
  const windows = await chrome.windows.getAll({ populate: true });
  const stale = [];

  for (const win of windows) {
    const tabs = win.tabs || [];
    // Never empty a window: closing its last tab would close the window.
    const keepers = tabs.filter((t) => !isDisposable(t));
    let budget = keepers.length > 0 ? Infinity : tabs.length - 1;

    for (const tab of tabs) {
      if (budget <= 0) break;
      if (!isDisposable(tab)) continue;
      if (tab.active || tab.audible) continue;
      // lastAccessed is ms since epoch; missing on very old Chrome builds.
      if (typeof tab.lastAccessed !== 'number') continue;
      if (tab.lastAccessed > cutoff) continue;

      stale.push(tab);
      if (budget !== Infinity) budget -= 1;
    }
  }

  if (!stale.length) return;

  const stored = await chrome.storage.local.get(ARCHIVE);
  const archive = stored[ARCHIVE] || [];
  const additions = stale.map((t) => ({
    url: t.url,
    title: t.title || t.url,
    closedAt: Date.now(),
  }));

  await chrome.storage.local.set({
    [ARCHIVE]: [...additions, ...archive].slice(0, settings.archiveKeep),
  });
  await chrome.tabs.remove(stale.map((t) => t.id));
}

async function scheduleArchive() {
  await chrome.alarms.clear(ARCHIVE_ALARM);
  const settings = await getSettings();
  if (!settings.archiveEnabled) return;
  await chrome.alarms.create(ARCHIVE_ALARM, { periodInMinutes: 5 });
}

// ---------------------------------------------------------------------- wiring

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  if (command === 'copy-url') await copyUrl(tab);
  else if (command === 'rename-tab') await renameTab(tab);
  else if (command === 'move-to-group') await moveToGroup(tab);
  else if (command === 'close-ungrouped') await closeUngrouped();
});

chrome.action.onClicked.addListener(restoreLastClosed);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ARCHIVE_ALARM) runArchive();
});

chrome.runtime.onInstalled.addListener(scheduleArchive);
chrome.runtime.onStartup.addListener(scheduleArchive);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[SETTINGS]) scheduleArchive();
});

// Re-apply a custom title after navigation or reload within the same tab.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status !== 'loading' && changeInfo.status !== 'complete') return;
  const map = await getRenames();
  const title = map[tabId];
  if (!title) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: enforceTitle,
      args: [title],
    });
  } catch {
    // Navigated somewhere unscriptable; the name returns on the next real page.
  }
});

chrome.tabs.onRemoved.addListener((tabId) => setRename(tabId, null));
