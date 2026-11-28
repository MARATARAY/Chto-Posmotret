(() => {
  'use strict';
  const UNAVAILABLE = 'Поиск недоступен. Заполните форму вручную';
  const LIMITED = 'Слишком много запросов. Попробуйте позже или заполните форму вручную';
  function normalize(item, currentYear = new Date().getFullYear()) {
    if (!item || typeof item.id !== 'string' || !/^Q[1-9]\d*$/.test(item.id)
      || typeof item.label !== 'string' || !item.label.trim() || item.label.trim().length > 160
      || typeof item.description !== 'string') return null;
    const description = item.description.toLocaleLowerCase('ru-RU');
    // Exclude explicit non-screen entities even when their description mentions cinema.
    if (/(?:^|[^\p{L}])(?:роман|книга|видеоигра|игра|актёр|актер|актриса|режиссёр|режиссер|писатель)(?=$|[^\p{L}])/u.test(description)) return null;
    const category = ['мультфильм', 'анимационный', 'мультсериал', 'аниме'].some(word => description.includes(word)) ? 'Мультфильм'
      : ['телесериал', 'сериал', 'мини-сериал'].some(word => description.includes(word)) ? 'Сериал'
      : ['фильм', 'кинофильм', 'комедия', 'триллер', 'боевик', 'фантастика', 'драма'].some(word => description.includes(word)) ? 'Фильм' : '';
    if (!category) return null;
    const year = item.description.match(/\b(19|20)\d{2}\b/);
    return { id: item.id, title: item.label.trim(), description: item.description, category,
      year: year ? year[0] : String(currentYear), yearDefault: !year,
      rating: '0.0', duration: category === 'Сериал' ? '1' : '120' };
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
      ratingLabel.textContent = 'Рейтинг';
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
      const values = [show.category, show.year, show.rating, show.duration];
      fields.forEach((field, i) => {
        field.value = values[i]; field.dispatchEvent(new Event('change', { bubbles: true }));
      });
      imported = { ...show, values, edited: new Set() };
      source.href = `https://www.wikidata.org/wiki/${show.id}`; source.hidden = false;
      labelRating(); title.focus();
      status.textContent = 'Данные заполнены. Рейтинг 0.0 и длительность заданы по умолчанию'
        + (show.yearDefault ? ', год — текущий' : '') + '. Проверьте поля перед добавлением.';
    }
    function showOptions(items) {
      options = items;
      options.forEach((show, i) => {
        const item = document.createElement('li');
        item.id = `title-option-${i}`; item.setAttribute('role', 'option'); item.setAttribute('aria-selected', 'false');
        item.textContent = `${show.title} · ${show.year}${show.yearDefault ? ' (текущий год)' : ''} · Рейтинг 0.0 (по умолчанию) · ${show.category}`;
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
            const response = await fetch(`https://www.wikidata.org/w/api.php?action=wbsearchentities&language=ru&uselang=ru&type=item&format=json&origin=*&limit=20&search=${encodeURIComponent(query)}`,
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
        if (data?.error || !Array.isArray(data?.search)) throw new Error('data');
        const seen = new Set(); const items = [];
        for (const row of data.search) {
          const show = normalize(row, new Date(now()).getFullYear());
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
      return { wikidataId: imported.id };
    } };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { init, normalize };
  else window.KadrOnlineSearch = init({ document, fetch: window.fetch.bind(window), setTimeout, clearTimeout, AbortController, Event });
})();
