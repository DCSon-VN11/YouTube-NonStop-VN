(function () {
  if (window._nonstopLoaded) return;
  window._nonstopLoaded = true;

  let enabled = true;
  let userPaused = false;
  let wakeLock = null;
  let reloadTimer = null;
  let stats = { dismissed: 0, resumed: 0, reloaded: 0 };

  chrome.storage.local.get(['enabled'], (res) => {
    enabled = res.enabled !== false;
    if (enabled) start();
  });

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg.type === 'SET_ENABLED') {
      enabled = msg.value;
      chrome.storage.local.set({ enabled });
      enabled ? start() : stop();
      reply({ ok: true }); return true;
    }
    if (msg.type === 'GET_STATE') { reply({ enabled, stats }); return true; }
    if (msg.type === 'RESET_STATS') {
      stats = { dismissed: 0, resumed: 0, reloaded: 0 };
      reply({ ok: true }); return true;
    }
  });

  function start() {
    attachVideoListeners();
    watchPlayer();
    requestWakeLock();
  }

  function stop() {
    clearTimeout(reloadTimer);
    releaseWakeLock();
  }

  function attachVideoListeners() {
    const attach = (video) => {
      if (!video || video._nonstopBound) return;
      video._nonstopBound = true;
      video.addEventListener('pause', () => {
        if (!enabled) return;
        if (!document.hidden) { userPaused = true; return; }
        userPaused = false;
        video.play().then(() => stats.resumed++).catch(() => {});
      });
      video.addEventListener('play', () => { userPaused = false; });
      video.addEventListener('seeking', () => { userPaused = false; });
    };
    attach(document.querySelector('video'));
    new MutationObserver((mutations) => {
      for (const m of mutations)
        for (const n of m.addedNodes)
          if (n.nodeName === 'VIDEO') attach(n);
    }).observe(document.body, { childList: true, subtree: true });
  }

  document.addEventListener('visibilitychange', () => {
    if (!enabled || document.visibilityState !== 'visible') return;
    const video = document.querySelector('video');
    if (video && video.paused && !userPaused)
      video.play().then(() => stats.resumed++).catch(() => {});
  });

  function watchPlayer() {
    const tryObserve = () => {
      const player = document.querySelector('#movie_player');
      if (!player) { setTimeout(tryObserve, 1000); return; }
      new MutationObserver(() => {
        if (!enabled) return;
        handleDialog();
        handleSkip();
        handleError(player);
      }).observe(player, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    };
    tryObserve();
  }

  function handleDialog() {
    const video = document.querySelector('video');
    if (!video || video.paused) return;

    // Never act in the last 10s of a video — that's when the
    // "Up next" / autoplay overlay shows, not the "still watching" dialog
    if (video.duration && (video.duration - video.currentTime) < 10) return;

    // Exclude any button inside known autoplay/replay/up-next overlays
    const excludedContainers = document.querySelectorAll(
      '.ytp-autonav-endscreen-upnext-container, ' +
      '.ytp-replay-button, ' +
      '.html5-endscreen, ' +
      '.ytp-ce-element'
    );

    const allBtns = document.querySelectorAll('#movie_player button, .html5-video-player button');
    for (const btn of allBtns) {
      const text = btn.textContent.trim();
      const isExact = (text === 'Có' || text === 'Yes' || text === 'OK');
      if (!isExact || !isVisible(btn) || btn._nonstopClicked) continue;

      // Skip if button lives inside an excluded overlay
      let inExcluded = false;
      for (const c of excludedContainers) {
        if (c.contains(btn)) { inExcluded = true; break; }
      }
      if (inExcluded) continue;

      btn._nonstopClicked = true;
      btn.click();
      stats.dismissed++;
      hideOverlayContaining(btn);
      return;
    }
  }

  function hideOverlayContaining(btn) {
    let el = btn;
    for (let i = 0; i < 5 && el; i++) {
      el = el.parentElement;
      if (!el) break;
      const cls = el.className || '';
      if (typeof cls === 'string' && /popup|overlay|dialog/i.test(cls)) {
        el.style.display = 'none';
        return;
      }
    }
  }

  function handleSkip() {
    const btn = document.querySelector('.ytp-skip-intro-button, .ytp-ad-skip-button');
    if (!btn || !isVisible(btn) || btn._nonstopClicked) return;
    btn._nonstopClicked = true;
    btn.click();
    stats.dismissed++;
  }

  function handleError(player) {
    const hasError = player.classList.contains('error-occurred') ||
      !!document.querySelector('.ytp-error, yt-player-error-message-renderer');
    if (hasError) scheduleReload();
    else cancelReload();
  }

  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function scheduleReload() {
    if (reloadTimer) return;
    reloadTimer = setTimeout(() => { stats.reloaded++; window.location.reload(); }, 4000);
  }

  function cancelReload() {
    if (reloadTimer) { clearTimeout(reloadTimer); reloadTimer = null; }
  }

  async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try { wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {}
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible' && enabled)
        try { wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {}
    });
  }

  function releaseWakeLock() {
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  }

})();
