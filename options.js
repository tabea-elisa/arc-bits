const SETTINGS = 'settings';
const ARCHIVE = 'archive';
const DEFAULTS = { archiveEnabled: true, archiveHours: 12, archiveKeep: 200 };

const $ = (id) => document.getElementById(id);

async function loadSettings() {
  const stored = await chrome.storage.local.get(SETTINGS);
  const s = { ...DEFAULTS, ...(stored[SETTINGS] || {}) };
  $('enabled').checked = s.archiveEnabled;
  $('hours').value = s.archiveHours;
}

async function saveSettings() {
  const hours = Math.min(336, Math.max(1, Number($('hours').value) || 12));
  $('hours').value = hours;
  await chrome.storage.local.set({
    [SETTINGS]: {
      ...DEFAULTS,
      archiveEnabled: $('enabled').checked,
      archiveHours: hours,
    },
  });
}

function relative(ts) {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

async function renderArchive() {
  const stored = await chrome.storage.local.get(ARCHIVE);
  const items = stored[ARCHIVE] || [];
  const list = $('list');

  list.textContent = '';
  $('count').textContent = String(items.length);
  $('empty').style.display = items.length ? 'none' : '';

  for (const item of items) {
    const li = document.createElement('li');

    const a = document.createElement('a');
    a.href = item.url;
    a.textContent = item.title || item.url;
    a.title = item.url;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: item.url, active: false });
    });
    li.appendChild(a);

    const t = document.createElement('time');
    t.textContent = relative(item.closedAt);
    li.appendChild(t);

    list.appendChild(li);
  }
}

$('enabled').addEventListener('change', saveSettings);
$('hours').addEventListener('change', saveSettings);

$('restore-all').addEventListener('click', async () => {
  const stored = await chrome.storage.local.get(ARCHIVE);
  for (const item of stored[ARCHIVE] || []) {
    await chrome.tabs.create({ url: item.url, active: false });
  }
});

$('clear').addEventListener('click', async () => {
  await chrome.storage.local.set({ [ARCHIVE]: [] });
  renderArchive();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[ARCHIVE]) renderArchive();
});

loadSettings();
renderArchive();
