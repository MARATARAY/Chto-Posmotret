(() => {
  'use strict';
  const UNAVAILABLE = 'Поиск недоступен. Заполните форму вручную';
  const LIMITED = 'Слишком много запросов. Попробуйте позже или заполните форму вручную';
  function normalize(show) {
    if (!Number.isSafeInteger(show?.id) || show.id <= 0 || typeof show.name !== 'string'
      || !show.name.trim() || show.name.trim().length > 160) return null;
    let year = '';
    if (typeof show.premiered === 'string' && /^[1-9]\d{3}-\d{2}-\d{2}$/.test(show.premiered)) {
      const date = new Date(`${show.premiered}T00:00:00Z`);
      if (Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === show.premiered) year = show.premiered.slice(0, 4);
    }
    return { id: show.id, title: show.name.trim(), year, category: 'Сериал',
      rating: Number.isFinite(show.rating?.average) && show.rating.average >= 0 && show.rating.average <= 10
        ? show.rating.average.toFixed(1) : '' };
  }
  function init({ document, fetch, setTimeout, clearTimeout, AbortController, Event, now = Date.now }) {
    const title = document.querySelector('#title');
    const form = document.querySelector('#title-form');
    const list = document.querySelector('#title-suggestions');
    const status = document.querySelector('#title-lookup-status');
    const source = document.querySelector('#title-source');
    const ratingLabel = document.querySelector('#catalog-rating-label');
    const fields = ['category', 'year', 'catalog-rating', 'duration'].map(id => document.querySelector(`#${id}`));
    const cache = new Map();
    let timer, controller, version = 0, options = [], active = -1, composing = false, imported = null, retryAt = 0;
    function close() {
      version++; clearTimeout(timer); controller?.abort(); controller = null;
      options = []; active = -1; list.replaceChildren(); list.hidden = true;
      title.setAttribute('aria-expanded', 'false'); title.removeAttribute('aria-activedescendant');
      title.setAttribute('aria-busy', 'false');
    }
    function labelRating() {
      ratingLabel.textContent = imported && imported.rating && !imported.edited.has('catalog-rating')
        ? 'Рейтинг TVmaze' : 'Рейтинг';
    }
    function detach() {
      if (!imported) return;
      const previous = imported; imported = null;
      fields.forEach((field, i) => {
        if (!previous.edited.has(field.id) && field.value === previous.values[i]) {
          field.value = ''; field.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      source.hidden = true; labelRating();
    }
    fields.forEach(field => {
      for (const event of ['input', 'change']) field.addEventListener(event, () => {
        imported?.edited.add(field.id); labelRating();
      });
    });
    function select(index) {
      const show = options[index];
      if (!show) return;
      close(); imported = null;
      title.value = show.title;
      const values = [show.category, show.year, show.rating, ''];
      fields.forEach((field, i) => {
        field.value = values[i]; field.dispatchEvent(new Event('change', { bubbles: true }));
      });
      imported = { ...show, values, edited: new Set() };
      source.href = `https://www.tvmaze.com/shows/${show.id}`; source.hidden = false;
      labelRating(); title.focus();
      status.textContent = 'Недостающие данные заполните вручную: укажите длительность в сезонах'
        + (!show.year || !show.rating ? ', год и рейтинг при их отсутствии.' : '.');
    }
    function showOptions(items) {
      options = items;
      options.forEach((show, i) => {
        const item = document.createElement('li');
        item.id = `title-option-${i}`; item.setAttribute('role', 'option'); item.setAttribute('aria-selected', 'false');
        item.textContent = `${show.title} · ${show.year || 'Год не указан'} · ${show.rating ? `Рейтинг TVmaze ${show.rating}` : 'Нет оценки'} · ${show.category}`;
        // Keep input focus until click, including taps, so blur cannot discard the selection.
        item.addEventListener('pointerdown', event => event.preventDefault());
        item.addEventListener('mousedown', event => event.preventDefault());
        item.addEventListener('click', () => select(i)); list.append(item);
      });
      list.hidden = !options.length; title.setAttribute('aria-expanded', String(!!options.length));
      status.textContent = options.length ? 'Выберите произведение из списка'
        : 'Ничего не найдено. Попробуйте другое название или заполните форму вручную';
    }
    async function search(query, token) {
      const cacheKey = query.toLocaleLowerCase('ru-RU');
      for (const [key, value] of cache) if (value.expires <= now()) cache.delete(key);
      if (cache.has(cacheKey)) { showOptions(cache.get(cacheKey).items); return; }
      if (now() < retryAt) { status.textContent = LIMITED; return; }
      controller = new AbortController(); const pendingController = controller;
      let deadline;
      status.textContent = 'Ищем…'; title.setAttribute('aria-busy', 'true');
      try {
        const data = await Promise.race([
          (async () => {
            const response = await fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`,
              { method: 'GET', signal: pendingController.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
            if (response.status === 429) {
              if (token !== version) throw new Error('stale');
              const header = response.headers?.get('Retry-After');
              const seconds = header && /^\d+$/.test(header.trim()) ? Number(header) : NaN;
              const date = header ? Date.parse(header) : NaN;
              const delay = Number.isFinite(seconds) ? seconds * 1000
                : Number.isFinite(date) ? Math.max(0, date - now()) : 10000;
              retryAt = now() + delay; throw new Error('limited');
            }
            if (!response.ok) throw new Error('http');
            return response.json();
          })(),
          new Promise((_, reject) => {
            deadline = setTimeout(() => { pendingController.abort(); reject(new Error('timeout')); }, 8000);
          })
        ]);
        if (token !== version) return;
        if (!Array.isArray(data)) throw new Error('data');
        const seen = new Set(); const items = [];
        for (const row of data) {
          const show = normalize(row?.show);
          if (!show || seen.has(show.id)) continue;
          seen.add(show.id); items.push(show);
          if (items.length === 5) break;
        }
        if (cache.size >= 20) cache.delete(cache.keys().next().value);
        cache.set(cacheKey, { items, expires: now() + 300000 });
        showOptions(items);
      } catch (error) {
        if (token === version) status.textContent = error.message === 'limited' ? LIMITED : UNAVAILABLE;
      } finally {
        clearTimeout(deadline);
        if (token === version) { title.setAttribute('aria-busy', 'false'); controller = null; }
      }
    }
    function input() {
      if (imported && title.value !== imported.title) detach();
      close(); status.textContent = '';
      const query = title.value.trim();
      if (composing || query.length < 3 || query.length > 160) return;
      const token = version;
      timer = setTimeout(() => search(query, token), 500);
    }
    title.addEventListener('input', input);
    title.addEventListener('compositionstart', () => { composing = true; close(); status.textContent = ''; });
    title.addEventListener('compositionend', () => { composing = false; input(); });
    title.addEventListener('keydown', event => {
      if (event.isComposing || composing) return;
      if (event.key === 'Escape' || event.key === 'Tab') { close(); status.textContent = ''; }
      if (options.length && ['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) {
        event.preventDefault();
        if (event.key === 'Enter') { if (active >= 0) select(active); }
        else {
          active = active < 0 ? (event.key === 'ArrowDown' ? 0 : options.length - 1)
            : (active + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
          [...list.children].forEach((item, i) => item.setAttribute('aria-selected', String(i === active)));
          title.setAttribute('aria-activedescendant', list.children[active].id);
          list.children[active].scrollIntoView?.({ block: 'nearest' });
        }
      }
    });
    title.addEventListener('blur', () => { close(); status.textContent = ''; });
    form.addEventListener('reset', () => { close(); imported = null; source.hidden = true; status.textContent = ''; labelRating(); });
    return { getMetadata() {
      if (!imported || title.value !== imported.title) return {};
      const unchangedRating = !imported.edited.has('catalog-rating') && fields[2].value === imported.rating && imported.rating !== '';
      return { tvmazeId: imported.id, ...(unchangedRating ? { ratingSource: 'TVmaze' } : {}) };
    } };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { init, normalize };
  else window.KadrOnlineSearch = init({ document, fetch: window.fetch.bind(window), setTimeout, clearTimeout, AbortController, Event });
})();
