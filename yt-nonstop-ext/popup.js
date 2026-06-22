const toggle = document.getElementById('toggle');
const dot = document.getElementById('dot');
const statusText = document.getElementById('status-text');
const dismissedEl = document.getElementById('dismissed');
const resumedEl = document.getElementById('resumed');
const reloadedEl = document.getElementById('reloaded');
const wlDot = document.getElementById('wl-dot');
const wlText = document.getElementById('wl-text');
const resetBtn = document.getElementById('reset-btn');

if ('wakeLock' in navigator) {
  wlDot.className = 'feat-dot';
  wlText.textContent = 'Wake Lock: được hỗ trợ';
} else {
  wlText.textContent = 'Wake Lock: không hỗ trợ (dùng fallback)';
}

function setStatus(enabled) {
  toggle.checked = enabled;
  dot.className = 'status-dot' + (enabled ? ' active' : '');
  statusText.innerHTML = enabled
    ? '<span class="status-dot active"></span>Đang hoạt động'
    : '<span class="status-dot"></span>Đã tắt';
}

function updateStats(stats) {
  dismissedEl.textContent = stats.dismissed || 0;
  resumedEl.textContent = stats.resumed || 0;
  reloadedEl.textContent = stats.reloaded || 0;
}

function queryActiveTab(msg, cb) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return cb && cb(null);
    chrome.tabs.sendMessage(tabs[0].id, msg, (res) => {
      if (chrome.runtime.lastError) return cb && cb(null);
      cb && cb(res);
    });
  });
}

chrome.storage.local.get(['enabled'], (r) => setStatus(r.enabled !== false));

queryActiveTab({ type: 'GET_STATE' }, (res) => {
  if (res) { setStatus(res.enabled); updateStats(res.stats); }
});

const refreshInterval = setInterval(() => {
  queryActiveTab({ type: 'GET_STATE' }, (res) => { if (res) updateStats(res.stats); });
}, 1000);

window.addEventListener('unload', () => clearInterval(refreshInterval));

toggle.addEventListener('change', () => {
  const val = toggle.checked;
  setStatus(val);
  queryActiveTab({ type: 'SET_ENABLED', value: val }, () => {});
  chrome.storage.local.set({ enabled: val });
});

resetBtn.addEventListener('click', () => {
  queryActiveTab({ type: 'RESET_STATS' }, () => {});
  updateStats({ dismissed: 0, resumed: 0, reloaded: 0 });
});
