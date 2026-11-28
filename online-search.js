(() => {
  'use strict';
  const UNAVAILABLE = 'Поиск недоступен. Заполните форму вручную';
  const LIMITED = 'Лимит поиска исчерпан. Попробуйте позже';
  const NOT_CONFIGURED = 'Онлайн-поиск не настроен. Заполните форму вручную';
  const KEY = 'kadr.poiskkino.token.v1';
  const externalRating = value => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 10 ? value : null;
  const ratingText = value => externalRating(value) === null ? '—' : value.toFixed(1);
  const validKey = value => typeof value === 'string' && value.trim().length > 0 && !/[\s\u0400-\u04ff]/.test(value) && value.length <= 256;
  function normalize(item) {
    if (!item || !Number.isSafeInteger(item.id) || item.id <= 0) return null;
    const title = [item.name, item.alternativeName].find(value => typeof value === 'string' && value.trim());
    if (!title || title.trim().length > 160) return null;
    const series = ['animated-series', 'tv-series', 'mini-series'].includes(item.type) || item.isSeries === true;
    const category = ['cartoon', 'animated-series'].includes(item.type) ? 'Мультфильм'
      : series ? 'Сериал' : 'Фильм';
    const length = Number.isInteger(item.movieLength) && item.movieLength > 0 && item.movieLength <= 9999;
    const seasons = new Set((Array.isArray(item.seasonsInfo) ? item.seasonsInfo : [])
      .map(season => season?.number).filter(number => Number.isInteger(number) && number > 0 && number <= 9999));
    return { id: item.id, title: title.trim(), category,
      year: Number.isInteger(item.year) && /^[1-9]\d{3}$/.test(String(item.year)) ? String(item.year) : '',
      kpRating: externalRating(item.rating?.kp), imdbRating: externalRating(item.rating?.imdb),
      duration: length ? String(item.movieLength) : series ? String(seasons.size || 1) : '',
      durationUnit: !length && series ? 'seasons' : 'minutes', durationDefault: !length && series && !seasons.size };
  }
  function init({ document, fetch, setTimeout, clearTimeout, AbortController, Event, storage, now = Date.now }) {
    const title = document.querySelector('#title');
    const form = document.querySelector('#title-form');
    const list = document.querySelector('#title-suggestions');
    const status = document.querySelector('#title-lookup-status');
    const source = document.querySelector('#title-source');
    const ratings = document.querySelector('#selected-ratings');
    const keyInput = document.querySelector('#search-api-key');
    const keyStatus = document.querySelector('#search-key-status');
    const fields = ['category', 'year', 'duration', 'duration-unit-select'].map(id => document.querySelector(`#${id}`));
    const cache = new Map();
    let apiKey = '';
    try { const saved = storage?.getItem(KEY); if (validKey(saved)) apiKey = saved.trim(); } catch { /* Session-only memory still works. */ }
    keyStatus.textContent = apiKey ? 'Ключ подключён для этой вкладки' : 'Для поиска нужен ключ ПоискКино';
    let timer, controller, version = 0, options = [], active = -1, composing = false, imported = null, retryAt = 0;
    function close() {
      version++; clearTimeout(timer); controller?.abort(); controller = null;
      options = []; active = -1; list.replaceChildren(); list.hidden = true;
      title.setAttribute('aria-expanded', 'false'); title.removeAttribute('aria-activedescendant');
      title.setAttribute('aria-busy', 'false');
    }
    function paintRatings(host, show) {
      host.replaceChildren();
      for (const [label, value] of [['КП', show.kpRating], ['IMDb', show.imdbRating]]) {
        const badge = document.createElement('span'); badge.className = 'rating-badge';
        badge.textContent = `${label}: ${ratingText(value)}`; host.append(badge);
      }
    }
    function detach() {
      if (!imported) return;
      const previous = imported; imported = null;
      fields.forEach((field, i) => {
        if (!previous.edited.has(field.id) && field.value === previous.values[i]) {
          field.value = field.id === 'duration-unit-select' ? 'minutes' : '';
          field.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      source.hidden = true; ratings.hidden = true; ratings.replaceChildren();
    }
    fields.forEach(field => {
      for (const event of ['input', 'change']) field.addEventListener(event, () => {
        imported?.edited.add(field.id);
      });
    });
    function select(index) {
      const show = options[index];
      if (!show) return;
      close(); imported = null;
      title.value = show.title;
      title.dispatchEvent(new Event('change', { bubbles: true }));
      const values = [show.category, show.year, show.duration, show.durationUnit];
      fields.forEach((field, i) => {
        field.value = values[i]; field.dispatchEvent(new Event('change', { bubbles: true }));
      });
      imported = { ...show, values, edited: new Set() };
      source.href = 'https://poiskkino.dev'; source.hidden = false;
      paintRatings(ratings, show); ratings.hidden = false; title.focus();
      status.textContent = 'Данные заполнены. Проверьте поля перед добавлением.'
        + (show.durationDefault ? ' Длительность 1 сезон задана по умолчанию.' : '');
    }
    function showOptions(items) {
      options = items;
      options.forEach((show, i) => {
        const item = document.createElement('li');
        item.id = `title-option-${i}`; item.setAttribute('role', 'option'); item.setAttribute('aria-selected', 'false');
        const caption = document.createElement('span');
        caption.textContent = `${show.title} · ${show.year || 'Год не указан'} · ${show.category}`;
        const badges = document.createElement('span'); badges.className = 'source-ratings';
        paintRatings(badges, show); item.append(caption); item.append(badges);
        // Keep input focus until click, including taps, so blur cannot discard the selection.
        item.addEventListener('pointerdown', event => event.preventDefault());
        item.addEventListener('mousedown', event => event.preventDefault());
        item.addEventListener('click', () => select(i)); list.append(item);
      });
      list.hidden = !options.length; title.setAttribute('aria-expanded', String(!!options.length));
      status.textContent = options.length ? 'Выберите произведение из списка'
        : 'Ничего не найдено. Заполните форму вручную';
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
            const params = new URLSearchParams({ page: '1', limit: '10', query });
            const response = await fetch(`https://api.poiskkino.dev/v1.5/movie/search?${params}`,
              { method: 'GET', headers: { 'X-API-KEY': apiKey }, signal: pendingController.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
            if (response.status === 429) {
              if (token !== version) throw new Error('stale');
              const header = response.headers?.get('Retry-After');
              const seconds = header && /^\d+$/.test(header.trim()) ? Number(header) : NaN;
              const date = header ? Date.parse(header) : NaN;
              const delay = Number.isFinite(seconds) ? seconds * 1000
                : Number.isFinite(date) ? Math.max(0, date - now()) : 10000;
              retryAt = now() + delay; throw new Error('limited');
            }
            if (!response.ok) throw new Error(String(response.status));
            return response.json();
          })(),
          new Promise((_, reject) => {
            deadline = setTimeout(() => { pendingController.abort(); reject(new Error('timeout')); }, 8000);
          })
        ]);
        if (token !== version) return;
        if (data?.error || !Array.isArray(data?.docs)) throw new Error('data');
        const seen = new Set(); const items = [];
        for (const row of data.docs) {
          const show = normalize(row);
          if (!show || seen.has(show.id)) continue;
          seen.add(show.id); items.push(show);
          if (items.length === 5) break;
        }
        if (cache.size >= 20) cache.delete(cache.keys().next().value);
        cache.set(cacheKey, { items, expires: now() + 300000 });
        showOptions(items);
      } catch (error) {
        if (token === version) status.textContent = ({ limited: LIMITED,
          401: 'Не удалось проверить ключ поиска',
          403: 'Доступ к поиску ограничен. Проверьте ключ и лимит' })[error.message] || UNAVAILABLE;
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
      if (!validKey(apiKey)) { status.textContent = NOT_CONFIGURED; return; }
      const token = version;
      timer = setTimeout(() => search(query, token), 400);
    }
    document.querySelector('#search-key-apply').addEventListener('click', () => {
      close(); cache.clear();
      apiKey = keyInput.value.trim(); keyInput.value = '';
      if (!validKey(apiKey)) apiKey = '';
      try {
        if (apiKey) storage?.setItem(KEY, apiKey); else storage?.removeItem(KEY);
        keyStatus.textContent = apiKey ? 'Ключ подключён для этой вкладки' : 'Ключ отключён';
      } catch { keyStatus.textContent = 'Ключ действует до обновления страницы'; }
      input();
    });
    keyInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); document.querySelector('#search-key-apply').click(); }
    });
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
    form.addEventListener('reset', () => { close(); imported = null; source.hidden = true; ratings.hidden = true; ratings.replaceChildren(); status.textContent = ''; });
    return { getMetadata() {
      if (!imported || title.value !== imported.title) return {};
      return { poiskkinoId: imported.id, kpRating: imported.kpRating, imdbRating: imported.imdbRating };
    } };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { init, normalize, ratingText };
  else window.KadrOnlineSearch = init({ document, fetch: window.fetch.bind(window), setTimeout, clearTimeout, AbortController, Event,
    storage: { getItem: key => window.sessionStorage.getItem(key), setItem: (key, value) => window.sessionStorage.setItem(key, value), removeItem: key => window.sessionStorage.removeItem(key) } });
})();
