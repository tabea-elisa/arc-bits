// Clipboard fallback for pages we cannot inject into (chrome://, the Web Store, PDFs).
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== 'offscreen-clipboard') return;
  const sink = document.getElementById('sink');
  sink.value = msg.text;
  sink.select();
  const ok = document.execCommand('copy');
  sink.value = '';
  sendResponse({ ok });
});
