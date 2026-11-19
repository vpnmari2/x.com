/*
 * XFeed – injected into x.com after each page load.
 *
 *  1. Auto-align   : after you stop scrolling, the nearest post glides to the top.
 *                    Long posts (taller than the screen) are left alone while you read them.
 *  2. Auto-play    : videos play when mostly on screen, pause when they leave.
 *  3. Double-tap   : double-tap a post (text / photo / video) to like it. Never un-likes.
 *
 * X changes its page markup from time to time. Everything that depends on it is
 * the ARTICLE selector and the data-testid values below – start there if something stops working.
 */
(() => {
  if (window.__xfeedLoaded) return;
  window.__xfeedLoaded = true;

  // ======================= settings =======================
  const CFG = {
    snap: true,               // auto-align posts
    snapDelay: 140,           // ms after scrolling stops before aligning
    topOffset: 'auto',        // 'auto' = detect the sticky top bar, or a fixed number in px (e.g. 56)
    longPostSlack: 24,        // a post counts as "long" if it is this many px taller than the free area

    autoplay: true,           // play/pause videos by visibility
    autoplayThreshold: 0.6,   // share of the video that must be visible to start playing

    doubleTapLike: true,
    doubleTapMs: 280,         // max gap between the two taps (lower = single taps feel snappier)
    doubleTapDist: 40,        // max distance between the two taps, px
  };

  const ARTICLE = 'article[data-testid="tweet"]';

  // ---- tiny base CSS: no grey tap flash, no double-tap-zoom on posts ----
  const style = document.createElement('style');
  style.textContent =
    '* { -webkit-tap-highlight-color: transparent; }' +
    ARTICLE + ' { touch-action: manipulation; }';
  (document.head || document.documentElement).appendChild(style);

  // ======================= 1. auto-align =======================
  let snapTimer = 0;
  let touching = false;

  const stickyAncestor = (el) => {
    for (; el && el !== document.documentElement; el = el.parentElement) {
      const p = getComputedStyle(el).position;
      if (p === 'fixed' || p === 'sticky') return el;
    }
    return null;
  };

  // height of the bar stuck to the top of the screen (X's top bar), 0 if hidden
  const topInset = () => {
    if (typeof CFG.topOffset === 'number') return CFG.topOffset;
    let h = 0;
    for (const el of document.elementsFromPoint(innerWidth / 2, 3)) {
      const s = stickyAncestor(el);
      if (!s) continue;
      const r = s.getBoundingClientRect();
      if (r.top <= 2 && r.height < 200 && r.width > innerWidth * 0.5) h = Math.max(h, r.bottom);
    }
    return h;
  };

  // height of the bar stuck to the bottom of the screen (X's tab bar)
  const bottomInset = () => {
    let h = 0;
    for (const el of document.elementsFromPoint(innerWidth / 2, innerHeight - 3)) {
      const s = stickyAncestor(el);
      if (!s) continue;
      const r = s.getBoundingClientRect();
      if (r.bottom >= innerHeight - 2 && r.height < 200 && r.width > innerWidth * 0.5) {
        h = Math.max(h, innerHeight - r.top);
      }
    }
    return h;
  };

  const trySnap = () => {
    if (!CFG.snap || touching || document.hidden) return;
    if (scrollY < 60) return;                                   // top of page: leave it
    if (document.querySelector('[aria-modal="true"]')) return;  // photo viewer, menus, composer...

    const top = topInset();
    const bottom = innerHeight - bottomInset();
    const viewH = bottom - top;
    let best = null; // smallest scroll distance that puts a post's top at `top`

    for (const a of document.querySelectorAll(ARTICLE)) {
      const r = a.getBoundingClientRect();
      if (r.bottom <= top || r.top >= bottom) continue;         // not on screen

      if (r.height > viewH + CFG.longPostSlack && r.top < top + 4) {
        // A long post whose start is already scrolled past the top.
        if (r.bottom > bottom - 4) return;                      // you're reading inside it -> free scroll
        continue;                                               // its end is on screen -> consider the next post
      }

      const delta = r.top - top;
      if (best === null || Math.abs(delta) < Math.abs(best)) best = delta;
    }

    if (best !== null && Math.abs(best) > 2) {
      window.scrollBy({ top: best, behavior: 'smooth' });
    }
  };

  const scheduleSnap = () => {
    clearTimeout(snapTimer);
    snapTimer = setTimeout(trySnap, CFG.snapDelay);
  };

  addEventListener('scroll', scheduleSnap, { passive: true });
  addEventListener('touchstart', () => { touching = true; clearTimeout(snapTimer); }, { passive: true });
  const touchEnd = () => { touching = false; scheduleSnap(); };
  addEventListener('touchend', touchEnd, { passive: true });
  addEventListener('touchcancel', touchEnd, { passive: true });

  // ======================= 2. auto-play =======================
  if (CFG.autoplay && 'IntersectionObserver' in window) {
    const seen = new WeakSet();

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const v = e.target;
        if (e.isIntersecting && e.intersectionRatio >= CFG.autoplayThreshold) {
          if (v.paused && !v.__xfUserPaused) {
            const p = v.play();
            if (p && p.catch) p.catch(() => {});
          }
        } else {
          v.__xfUserPaused = false; // forget manual pause once it scrolls away
          if (!v.paused) { v.__xfOurPause = true; v.pause(); }
        }
      }
    }, { threshold: [0, CFG.autoplayThreshold, 1] });

    const onPause = (e) => {
      const v = e.target;
      if (v.__xfOurPause) { v.__xfOurPause = false; return; }
      v.__xfUserPaused = true; // the user (or the video ending) paused it
    };

    const scanVideos = () => {
      for (const v of document.querySelectorAll('video')) {
        if (seen.has(v)) continue;
        seen.add(v);
        v.addEventListener('pause', onPause);
        io.observe(v);
      }
    };

    let scanQueued = false;
    new MutationObserver(() => {
      if (scanQueued) return;
      scanQueued = true;
      setTimeout(() => { scanQueued = false; scanVideos(); }, 300);
    }).observe(document.body, { childList: true, subtree: true });
    scanVideos();
  }

  // ======================= 3. double-tap to like =======================
  const haptic = () => { try { window.XFeed && window.XFeed.haptic(); } catch (_) {} };

  const burst = (x, y) => {
    const el = document.createElement('div');
    el.style.cssText =
      'position:fixed;pointer-events:none;z-index:2147483647;width:96px;height:96px;' +
      'left:' + (x - 48) + 'px;top:' + (y - 48) + 'px;filter:drop-shadow(0 2px 6px rgba(0,0,0,.45));';
    el.innerHTML =
      '<svg viewBox="0 0 24 24" width="96" height="96"><path fill="#F91880" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
    document.body.appendChild(el);
    const anim = el.animate(
      [
        { transform: 'scale(.3)', opacity: 0 },
        { transform: 'scale(1.15)', opacity: 1, offset: 0.3 },
        { transform: 'scale(1)', opacity: 1, offset: 0.6 },
        { transform: 'scale(1.25) translateY(-36px)', opacity: 0 },
      ],
      { duration: 800, easing: 'ease-out' }
    );
    anim.onfinish = () => el.remove();
  };

  const like = (article, x, y) => {
    burst(x, y);
    haptic();
    const liked = article.querySelector('[data-testid="unlike"]');
    const btn = article.querySelector('[data-testid="like"]');
    if (btn && !liked) btn.click();   // already liked -> just show the heart, never un-like
  };

  // Taps on these keep their normal single-tap behaviour (buttons, links, avatars, action bar...).
  // Photos/videos are links to /photo/N, /video/N and DO count as tappable media.
  const isInteractive = (t) => {
    if (t.closest('button, input, textarea, select, [role="group"], [role="switch"], [role="slider"], [role="menuitem"], [data-testid="caret"]')) return true;
    const a = t.closest('a[href]');
    if (a) return !/\/(photo|video)\/\d+/.test(a.getAttribute('href') || '');
    return !!t.closest('[role="link"], [role="button"]');
  };

  let pending = null; // first tap, held back until we know whether a second one follows

  const replay = (p) => {
    if (!p.target.isConnected) return;
    p.target.dispatchEvent(new MouseEvent('click', {
      bubbles: true, cancelable: true, view: window, clientX: p.x, clientY: p.y,
    }));
  };

  const flushPending = () => {
    if (!pending) return;
    const p = pending;
    pending = null;
    clearTimeout(p.timer);
    replay(p);
  };

  document.addEventListener('click', (e) => {
    if (!CFG.doubleTapLike || !e.isTrusted) return;             // untrusted = our own replay
    const t = e.target;
    if (!(t instanceof Element)) return;

    const article = t.closest(ARTICLE);
    if (!article || isInteractive(t)) { flushPending(); return; }

    e.preventDefault();
    e.stopPropagation();

    const now = Date.now();
    if (pending && pending.article === article &&
        now - pending.t <= CFG.doubleTapMs &&
        Math.hypot(e.clientX - pending.x, e.clientY - pending.y) <= CFG.doubleTapDist) {
      clearTimeout(pending.timer);
      pending = null;
      like(article, e.clientX, e.clientY);
      return;
    }

    flushPending();
    const p = { t: now, x: e.clientX, y: e.clientY, article, target: t, timer: 0 };
    p.timer = setTimeout(() => { if (pending === p) { pending = null; replay(p); } }, CFG.doubleTapMs);
    pending = p;
  }, true);
})();
