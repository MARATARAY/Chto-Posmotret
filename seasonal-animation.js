(() => {
  'use strict';
  const KEY = 'kadr.seasonalAnimation.v1';
  const symbols = { winter: ['❄', '•'], spring: ['🌸', '✿'], summer: [''], autumn: ['🍂', '🍁'] };
  function seasonForMonth(month) {
    if (!Number.isInteger(month) || month < 0 || month > 11) throw new RangeError('Invalid month');
    return month === 11 || month < 2 ? 'winter' : month < 5 ? 'spring' : month < 8 ? 'summer' : 'autumn';
  }
  function init({ document, window, storage, now = () => new Date(), random = Math.random }) {
    const layer = document.querySelector('#seasonal-layer');
    const toggle = document.querySelector('#seasonal-toggle');
    const message = document.querySelector('#seasonal-message');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mobile = window.matchMedia('(max-width: 600px)');
    let explicit = null;
    try {
      const saved = storage.getItem(KEY);
      if (saved === 'on' || saved === 'off') explicit = saved === 'on';
    } catch { /* A blocked store must not prevent the page from opening. */ }
    let enabled = explicit ?? !reduced.matches;
    let lastSeason, lastCount;
    function refresh() {
      const season = seasonForMonth(now().getMonth());
      const count = mobile.matches ? 10 : 18;
      if (lastSeason !== season || lastCount !== count) {
        layer.replaceChildren(); layer.dataset.season = season;
        for (let i = 0; i < count; i++) {
          const particle = document.createElement('span');
          particle.className = 'seasonal-particle';
          const glyph = document.createElement('span');
          glyph.className = 'seasonal-glyph';
          glyph.textContent = symbols[season][i % symbols[season].length];
          const duration = (season === 'winter' ? 16 : 22) + random() * 16;
          particle.style.setProperty('--x', `${random() * 100}%`);
          particle.style.setProperty('--y', `${10 + random() * 80}vh`);
          particle.style.setProperty('--duration', `${duration}s`);
          particle.style.setProperty('--delay', `${-random() * duration}s`);
          particle.style.setProperty('--size', `${season === 'summer' ? 3 + random() * 4 : 8 + random() * (mobile.matches ? 10 : 16)}px`);
          particle.style.setProperty('--drift', `${-35 + random() * 70}px`);
          particle.style.setProperty('--sway', `${4 + random() * 5}s`);
          particle.append(glyph); layer.append(particle);
        }
        lastSeason = season; lastCount = count;
      }
      layer.hidden = !enabled;
      layer.classList.toggle('is-paused', !enabled || document.hidden);
      toggle.textContent = enabled ? 'Анимация: Вкл' : 'Анимация: Выкл';
      toggle.setAttribute('aria-pressed', String(enabled));
      toggle.setAttribute('aria-label', `Сезонная анимация: ${enabled ? 'включена' : 'выключена'}`);
    }
    toggle.addEventListener('click', () => {
      enabled = !enabled; explicit = enabled;
      try {
        storage.setItem(KEY, enabled ? 'on' : 'off');
        message.textContent = '';
      } catch { message.textContent = 'Настройка анимации сохранится только до закрытия страницы'; }
      refresh();
    });
    reduced.addEventListener('change', () => {
      if (explicit === null) { enabled = !reduced.matches; refresh(); }
    });
    mobile.addEventListener('change', refresh);
    document.addEventListener('visibilitychange', refresh);
    refresh(); toggle.hidden = false;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { init, seasonForMonth };
  else init({ document, window, storage: {
    getItem: key => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value)
  } });
})();
