(() => {
  'use strict';

  const root = document.documentElement;
  const media = (query) => window.matchMedia(query);
  const reduceMotion = media('(prefers-reduced-motion: reduce)').matches;
  const finePointer = media('(hover: hover) and (pointer: fine)').matches;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const nextFrame = (fn) => requestAnimationFrame(() => requestAnimationFrame(fn));

  /* ------------------------------------------------------------------------
     Theme toggle
     ------------------------------------------------------------------------ */

  const THEME_COLORS = { light: '#F3F0E8', dark: '#090D18' };
  const darkQuery = media('(prefers-color-scheme: dark)');
  const themeToggle = document.querySelector('.theme-toggle');
  const themeMetas = document.querySelectorAll('meta[name="theme-color"]');

  const currentTheme = () => root.dataset.theme || (darkQuery.matches ? 'dark' : 'light');

  function syncTheme() {
    const theme = currentTheme();
    themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    themeMetas.forEach((meta) => {
      const ownTheme = meta.media.includes('dark') ? 'dark' : 'light';
      meta.setAttribute('content', THEME_COLORS[root.dataset.theme || ownTheme]);
    });
  }

  themeToggle.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try {
      localStorage.setItem('theme', next);
    } catch (e) {
      /* Storage unavailable: the choice lasts for this page view only. */
    }
    syncTheme();
  });

  darkQuery.addEventListener('change', syncTheme);
  syncTheme();

  /* ------------------------------------------------------------------------
     Hero name: split into letters
     ------------------------------------------------------------------------ */

  const hero = document.querySelector('.hero');
  const heroInner = document.querySelector('.hero-inner');
  const heroName = document.querySelector('.hero-name');
  const fullName = heroName.textContent.trim();
  const letters = document.createElement('span');
  letters.setAttribute('aria-hidden', 'true');

  let letterCount = 0;
  fullName.split(/\s+/).forEach((word, index, words) => {
    const wordEl = document.createElement('span');
    wordEl.className = 'word';
    for (const character of word) {
      const charEl = document.createElement('span');
      charEl.className = 'char';
      charEl.textContent = character;
      charEl.style.setProperty('--i', letterCount++);
      wordEl.appendChild(charEl);
    }
    letters.appendChild(wordEl);
    if (index < words.length - 1) letters.appendChild(document.createTextNode(' '));
  });

  const accessibleName = document.createElement('span');
  accessibleName.className = 'sr-only';
  accessibleName.textContent = fullName;
  heroName.replaceChildren(accessibleName, letters);
  heroName.classList.add('is-split');

  // The eyebrow, sentence and buttons start once most letters are up.
  hero.style.setProperty('--base', `${reduceMotion ? 0 : letterCount * 30 + 350}ms`);

  const playHero = () => hero.classList.add('hero-in');

  /* ------------------------------------------------------------------------
     Hero chart: a random-walk history with simulated forecast paths ahead
     ------------------------------------------------------------------------ */

  const NOW_X = 560;
  const noise = () => (Math.random() + Math.random() + Math.random() - 1.5) * 2;
  const walk = (y0, steps, drift, spread) => {
    const ys = [y0];
    for (let i = 1; i <= steps; i++) ys.push(clamp(ys[i - 1] + drift + noise() * spread, 12, 388));
    return ys;
  };
  const toPoints = (ys, x0, x1) =>
    ys.map((y, i) => `${(x0 + ((x1 - x0) * i) / (ys.length - 1)).toFixed(1)},${y.toFixed(1)}`).join(' ');

  const history = walk(320, 70, -1.3, 8);
  const lastY = history[history.length - 1];

  function forecastMarkup() {
    const paths = Array.from({ length: 24 }, () => walk(lastY, 36, -1.6, 7));
    const mean = paths[0].map((_, i) => paths.reduce((sum, p) => sum + p[i], 0) / paths.length);
    return paths.concat([mean]).map((ys, i) =>
      `<polyline${i === paths.length ? ' class="chart-mean"' : ''} points="${toPoints(ys, NOW_X, 1000)}"/>`).join('');
  }

  const chart = document.querySelector('.hero-chart svg');
  chart.innerHTML =
    `<line class="chart-now" x1="${NOW_X}" y1="0" x2="${NOW_X}" y2="400"/>` +
    `<polyline class="chart-history" points="${toPoints(history, 0, NOW_X)}"/>` +
    `<g class="chart-fan">${forecastMarkup()}</g>`;
  const chartFan = chart.querySelector('.chart-fan');

  /* ------------------------------------------------------------------------
     Intro overlay (once per session)
     ------------------------------------------------------------------------ */

  const intro = document.querySelector('.intro');

  if (root.classList.contains('intro-active') && intro) {
    try {
      sessionStorage.setItem('introSeen', '1');
    } catch (e) {
      /* Storage unavailable: the intro may show again. */
    }
    nextFrame(() => intro.classList.add('is-shown'));
    // Fade in (600 ms), hold (400 ms), then slide up (900 ms).
    setTimeout(() => {
      intro.classList.add('is-leaving');
      // With this easing the overlay has cleared the name about halfway through.
      setTimeout(playHero, 450);
      setTimeout(() => {
        intro.remove();
        root.classList.remove('intro-active');
      }, 950);
    }, 1000);
  } else {
    if (intro) intro.remove();
    nextFrame(playHero);
  }

  /* ------------------------------------------------------------------------
     Scroll reveals
     ------------------------------------------------------------------------ */

  const reveals = document.querySelectorAll('.reveal');

  if (reduceMotion || !('IntersectionObserver' in window)) {
    nextFrame(() => reveals.forEach((el) => el.classList.add('is-visible')));
  } else {
    const revealObserver = new IntersectionObserver((entries) => {
      entries
        .filter((entry) => entry.isIntersecting)
        .map((entry) => entry.target)
        .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
        .forEach((el, index) => {
          el.style.setProperty('--d', `${index * 80}ms`);
          el.classList.add('is-visible');
          revealObserver.unobserve(el);
        });
    }, { threshold: 0.15 });

    reveals.forEach((el) => revealObserver.observe(el));
  }

  /* ------------------------------------------------------------------------
     Active nav link
     ------------------------------------------------------------------------ */

  const navLinks = [...document.querySelectorAll('.nav-link')];
  let activeId = null;

  function setActive(id) {
    if (id === activeId) return;
    activeId = id;
    navLinks.forEach((link) => {
      const isActive = link.hash === `#${id}`;
      link.classList.toggle('is-active', isActive);
      if (isActive) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
  }

  if ('IntersectionObserver' in window) {
    const sectionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) setActive(entry.target.id);
        else if (entry.target.id === activeId) setActive(null);
      });
    }, { rootMargin: '-40% 0px -55% 0px' });

    document.querySelectorAll('main .section[id]').forEach((section) => sectionObserver.observe(section));
  }

  /* ------------------------------------------------------------------------
     Scroll: nav state, progress bar, hero parallax
     ------------------------------------------------------------------------ */

  const header = document.querySelector('.site-header');
  const progress = document.querySelector('.progress');
  let heroHeight = hero.offsetHeight;
  let scrollQueued = false;

  function onScrollFrame() {
    scrollQueued = false;
    const y = window.scrollY;
    const max = root.scrollHeight - window.innerHeight;

    header.classList.toggle('is-scrolled', y > 40);
    progress.style.transform = `scaleX(${max > 0 ? clamp(y / max, 0, 1).toFixed(4) : 0})`;

    if (!reduceMotion) {
      const heroY = Math.min(y, heroHeight);
      heroInner.style.transform = `translate3d(0, ${(heroY * 0.3).toFixed(1)}px, 0)`;
      heroInner.style.opacity = clamp(1 - heroY / (heroHeight * 0.7), 0, 1).toFixed(3);
    }

    // The last section can be too short to reach the middle of the viewport.
    if (max > 0 && y >= max - 2) setActive('contact');
  }

  const queueScroll = () => {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(onScrollFrame);
  };

  window.addEventListener('scroll', queueScroll, { passive: true });
  window.addEventListener('resize', () => {
    heroHeight = hero.offsetHeight;
    queueScroll();
  });
  onScrollFrame();

  /* ------------------------------------------------------------------------
     Mobile menu
     ------------------------------------------------------------------------ */

  const menuButton = document.querySelector('.menu-btn');
  const menuLabel = menuButton.querySelector('.menu-label');
  const menu = document.getElementById('mobile-menu');
  const pageParts = [document.getElementById('main'), document.querySelector('.site-footer')];
  let menuOpen = false;

  function setMenu(open) {
    menuOpen = open;
    root.classList.toggle('menu-open', open);
    menuButton.setAttribute('aria-expanded', String(open));
    menuLabel.textContent = open ? 'Close' : 'Menu';
    menu.inert = !open;
    pageParts.forEach((el) => { el.inert = open; });
  }

  menuButton.addEventListener('click', () => setMenu(!menuOpen));
  menu.addEventListener('click', (event) => {
    if (event.target.closest('a')) setMenu(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menuOpen) {
      setMenu(false);
      menuButton.focus();
    }
  });
  media('(min-width: 768px)').addEventListener('change', (event) => {
    if (event.matches && menuOpen) setMenu(false);
  });

  /* ------------------------------------------------------------------------
     Pointer effects: hero glow, custom cursor, magnetic buttons, card tilt
     ------------------------------------------------------------------------ */

  if (reduceMotion) return;

  const glow = document.querySelector('.hero-glow');
  const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2, inside: false, overLink: false };
  const glowPos = { x: 0, y: 0, tx: 0, ty: 0 };
  let heroSize = { w: hero.offsetWidth, h: hero.offsetHeight };
  let heroVisible = true;

  glowPos.x = glowPos.tx = heroSize.w / 2;
  glowPos.y = glowPos.ty = heroSize.h * 0.45;

  window.addEventListener('resize', () => {
    heroSize = { w: hero.offsetWidth, h: hero.offsetHeight };
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      heroVisible = entry.isIntersecting;
    }).observe(hero);
  }

  // Magnetic elements: spring toward the cursor when it is within 60px.
  const MAGNET_RANGE = 60;
  const MAGNET_PULL = 8;
  const magnets = finePointer
    ? [...document.querySelectorAll('.magnetic')].map((el) => ({ el, x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, last: '' }))
    : [];

  function aimMagnets() {
    magnets.forEach((m) => {
      const rect = m.el.getBoundingClientRect();
      // Measure from the resting position, not the pulled one.
      const left = rect.left - m.x;
      const right = rect.right - m.x;
      const top = rect.top - m.y;
      const bottom = rect.bottom - m.y;
      const dx = Math.max(left - pointer.x, 0, pointer.x - right);
      const dy = Math.max(top - pointer.y, 0, pointer.y - bottom);

      if (pointer.inside && Math.hypot(dx, dy) < MAGNET_RANGE) {
        const offsetX = pointer.x - (left + right) / 2;
        const offsetY = pointer.y - (top + bottom) / 2;
        m.tx = clamp(offsetX / (rect.width / 2 + MAGNET_RANGE), -1, 1) * MAGNET_PULL;
        m.ty = clamp(offsetY / (rect.height / 2 + MAGNET_RANGE), -1, 1) * MAGNET_PULL;
      } else {
        m.tx = 0;
        m.ty = 0;
      }
    });
  }

  // Custom cursor
  let cursor = null;
  if (finePointer) {
    const dot = document.createElement('div');
    const ring = document.createElement('div');
    dot.className = 'cursor-dot';
    ring.className = 'cursor-ring';
    dot.setAttribute('aria-hidden', 'true');
    ring.setAttribute('aria-hidden', 'true');
    document.body.append(dot, ring);
    cursor = { dot, ring, x: pointer.x, y: pointer.y, scale: 1 };
    root.classList.add('has-cursor');

    document.addEventListener('pointerover', (event) => {
      pointer.overLink = Boolean(event.target.closest && event.target.closest('a, button'));
    });
    document.addEventListener('mouseout', (event) => {
      if (event.relatedTarget) return;
      pointer.inside = false;
      root.classList.remove('cursor-visible');
      aimMagnets();
    });
  }

  window.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;

    if (!pointer.inside) {
      pointer.inside = true;
      if (cursor) {
        cursor.x = pointer.x;
        cursor.y = pointer.y;
        root.classList.add('cursor-visible');
      }
    }

    if (finePointer) {
      // The hero sits at the top of the page, so page coordinates match hero coordinates.
      glowPos.tx = pointer.x;
      glowPos.ty = pointer.y + window.scrollY;
    }

    aimMagnets();
  }, { passive: true });

  window.addEventListener('scroll', () => {
    if (pointer.inside && magnets.length) aimMagnets();
  }, { passive: true });

  // Card tilt (mouse only)
  if (finePointer) {
    const MAX_TILT = 4;
    document.querySelectorAll('.card').forEach((card) => {
      card.addEventListener('pointermove', (event) => {
        if (event.pointerType !== 'mouse') return;
        const rect = card.getBoundingClientRect();
        const px = (event.clientX - rect.left) / rect.width - 0.5;
        const py = (event.clientY - rect.top) / rect.height - 0.5;
        card.classList.add('is-tilting');
        card.style.setProperty('--mx', `${(event.clientX - rect.left).toFixed(0)}px`);
        card.style.setProperty('--my', `${(event.clientY - rect.top).toFixed(0)}px`);
        card.style.setProperty('--ry', `${(px * 2 * MAX_TILT).toFixed(2)}deg`);
        card.style.setProperty('--rx', `${(-py * 2 * MAX_TILT).toFixed(2)}deg`);
      });
      card.addEventListener('pointerleave', () => {
        card.classList.remove('is-tilting');
        card.style.removeProperty('--rx');
        card.style.removeProperty('--ry');
      });
    });
  }

  // Re-run the forecast simulation every few seconds while the hero is on screen.
  setInterval(() => {
    if (!heroVisible || document.hidden) return;
    chartFan.classList.add('is-swapping');
    setTimeout(() => {
      chartFan.innerHTML = forecastMarkup();
      chartFan.classList.remove('is-swapping');
    }, 600);
  }, 6000);

  function frame(now) {
    if (heroVisible) {
      if (!finePointer) {
        // Touch devices: slow drift instead of following a pointer.
        glowPos.tx = heroSize.w * (0.5 + 0.3 * Math.sin(now * 0.00021));
        glowPos.ty = heroSize.h * (0.45 + 0.2 * Math.cos(now * 0.00017));
      }
      glowPos.x = lerp(glowPos.x, glowPos.tx, 0.08);
      glowPos.y = lerp(glowPos.y, glowPos.ty, 0.08);
      glow.style.transform = `translate3d(${glowPos.x.toFixed(1)}px, ${glowPos.y.toFixed(1)}px, 0)`;
    }

    if (cursor && pointer.inside) {
      cursor.x = lerp(cursor.x, pointer.x, 0.18);
      cursor.y = lerp(cursor.y, pointer.y, 0.18);
      cursor.scale = lerp(cursor.scale, pointer.overLink ? 56 / 32 : 1, 0.18);
      cursor.dot.style.transform = `translate3d(${pointer.x}px, ${pointer.y}px, 0)`;
      cursor.ring.style.transform = `translate3d(${cursor.x.toFixed(1)}px, ${cursor.y.toFixed(1)}px, 0) scale(${cursor.scale.toFixed(3)})`;
    }

    magnets.forEach((m) => {
      m.vx = (m.vx + (m.tx - m.x) * 0.14) * 0.72;
      m.vy = (m.vy + (m.ty - m.y) * 0.14) * 0.72;
      m.x += m.vx;
      m.y += m.vy;
      const value = `${m.x.toFixed(2)}px ${m.y.toFixed(2)}px`;
      if (value !== m.last) {
        m.el.style.translate = value;
        m.last = value;
      }
    });

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
