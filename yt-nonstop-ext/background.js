chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type === 'GET_TAB_ID') {
    reply({ tabId: sender.tab ? sender.tab.id : null });
    return true;
  }
});
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.remove('stats_tab_' + tabId);
});
