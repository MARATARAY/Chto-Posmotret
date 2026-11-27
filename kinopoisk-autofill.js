(() => {
  'use strict';
  function init({ document, location, fetch, setTimeout, clearTimeout, AbortController, Event }) {
    const title = document.querySelector('#title');
    const form = document.querySelector('#title-form');
    const list = document.querySelector('#title-suggestions');
    const status = document.querySelector('#title-lookup-status');
    const source = document.querySelector('#title-source');
    const fields = ['category', 'year', 'catalog-rating', 'duration'].map(id => document.querySelector(`#${id}`));
    let timer, controller, version = 0, options = [], active = -1, composing = false;
    let imported = null;
    const local = location.protocol === 'file:';
    const errorText = 'Не удалось получить данные. Заполните данные вручную';
    function close() {
      version++; clearTimeout(timer); controller?.abort();
      options = []; active = -1; list.replaceChildren(); list.hidden = true;
      title.setAttribute('aria-expanded', 'false'); title.removeAttribute('aria-activedescendant');
      title.setAttribute('aria-busy', 'false');
    }
    function detach() {
      if (!imported) return;
      fields.forEach((field, i) => {
        if (!imported.edited.has(field.id) && field.value === imported.values[i]) field.value = '';
      });
      fields[0].dispatchEvent(new Event('change', { bubbles: true }));
      imported = null; source.hidden = true;
    }
    fields.forEach(field => {
      for (const event of ['input', 'change']) field.addEventListener(event, () => imported?.edited.add(field.id));
    });
    async function request(params) {
      controller = new AbortController();
      const pendingController = controller;
      const deadline = setTimeout(() => pendingController.abort(), 10000);
      try {
        const response = await fetch(`/api/kinopoisk?${params}`, { signal: pendingController.signal });
        if (!response.ok) throw new Error('lookup');
        return await response.json();
      } finally { clearTimeout(deadline); }
    }
    function highlight(index) {
      active = index;
      [...list.children].forEach((option, i) => option.setAttribute('aria-selected', String(i === active)));
      title.setAttribute('aria-activedescendant', list.children[index].id);
      list.children[index].scrollIntoView?.({ block: 'nearest' });
    }
    async function select(index) {
      const selected = options[index];
      if (!selected) return;
      close(); const token = version;
      status.textContent = 'Ищем…'; title.setAttribute('aria-busy', 'true');
      try {
        const data = await request(`id=${selected.id}`);
        if (token !== version) return;
        const movie = data.movie;
        if (!movie || movie.id !== selected.id || typeof movie.title !== 'string') throw new Error('data');
        title.value = movie.title;
        const values = [movie.category, movie.year, movie.rating, movie.duration].map(value => typeof value === 'string' ? value : '');
        // Dispatch before recording provenance so our own changes are not manual edits.
        imported = null;
        fields.forEach((field, i) => { field.value = values[i]; field.dispatchEvent(new Event('change', { bubbles: true })); });
        imported = { values, edited: new Set() };
        source.href = `https://www.kinopoisk.ru/${movie.category === 'Сериал' ? 'series' : 'film'}/${movie.id}/`;
        source.hidden = false;
        status.textContent = values.every(Boolean) ? 'Данные заполнены. Их можно изменить.' : 'Недостающие данные заполните вручную.';
      } catch { if (token === version) status.textContent = errorText; }
      finally { if (token === version) title.setAttribute('aria-busy', 'false'); }
    }
    function input() {
      detach(); close();
      if (local) { status.textContent = 'Автозаполнение доступно на опубликованном сайте'; return; }
      status.textContent = '';
      const query = title.value.trim();
      if (composing || query.length < 3) return;
      const token = version;
      timer = setTimeout(async () => {
        status.textContent = 'Ищем…'; title.setAttribute('aria-busy', 'true');
        try {
          const data = await request(`q=${encodeURIComponent(query)}`);
          if (token !== version) return;
          if (!Array.isArray(data.movies)) throw new Error('data');
          options = data.movies.filter(movie => Number.isSafeInteger(movie?.id) && movie.id > 0 && typeof movie.title === 'string').slice(0, 5);
          options.forEach((movie, i) => {
            const item = document.createElement('li');
            item.id = `title-option-${i}`; item.setAttribute('role', 'option'); item.setAttribute('aria-selected', 'false');
            item.textContent = `${movie.title} · ${movie.year || 'Год не указан'} · ${movie.category || 'Тип не указан'}`;
            item.addEventListener('pointerdown', event => event.preventDefault());
            item.addEventListener('click', () => select(i)); list.append(item);
          });
          list.hidden = options.length === 0; title.setAttribute('aria-expanded', String(options.length > 0));
          status.textContent = options.length ? 'Выберите произведение из списка' : 'Ничего не найдено. Заполните данные вручную';
        } catch { if (token === version) status.textContent = errorText; }
        finally { if (token === version) title.setAttribute('aria-busy', 'false'); }
      }, 500);
    }
    title.addEventListener('input', input);
    title.addEventListener('compositionstart', () => { composing = true; close(); });
    title.addEventListener('compositionend', () => { composing = false; input(); });
    title.addEventListener('keydown', event => {
      if (event.isComposing || composing) return;
      if (event.key === 'Escape') { close(); status.textContent = ''; }
      if (options.length && ['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) {
        event.preventDefault();
        if (event.key === 'Enter') { if (active >= 0) select(active); }
        else highlight((active + (event.key === 'ArrowDown' ? 1 : active < 0 ? 0 : -1) + options.length) % options.length);
      }
    });
    title.addEventListener('blur', () => { close(); status.textContent = ''; });
    form.addEventListener('reset', () => { close(); imported = null; source.hidden = true; status.textContent = local ? 'Автозаполнение доступно на опубликованном сайте' : ''; });
    if (local) status.textContent = 'Автозаполнение доступно на опубликованном сайте';
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { init };
  else init({ document, location, fetch: window.fetch.bind(window), setTimeout, clearTimeout, AbortController, Event });
})();
