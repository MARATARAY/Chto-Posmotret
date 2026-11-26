(() => {
  'use strict';

  const cinemaScene = document.querySelector('.cinema-scene');
  const motionToggle = document.querySelector('#motion-toggle');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let motionRunning = !reducedMotion.matches;

  function updateMotion() {
    cinemaScene.classList.toggle('is-paused', !motionRunning);
    cinemaScene.classList.toggle('motion-enabled', motionRunning);
    motionToggle.textContent = motionRunning ? 'Остановить анимацию' : 'Включить анимацию';
  }

  motionToggle.hidden = false;
  motionToggle.addEventListener('click', () => {
    motionRunning = !motionRunning;
    updateMotion();
  });
  reducedMotion.addEventListener('change', () => {
    motionRunning = !reducedMotion.matches;
    updateMotion();
  });
  updateMotion();

  const STORAGE_KEY = 'kadr.watchlist.v1';
  const categories = ['Фильм', 'Сериал', 'Мультфильм', 'Другое'];
  const form = document.querySelector('#title-form');
  const list = document.querySelector('#collection-list');
  const empty = document.querySelector('#empty-state');
  const message = document.querySelector('#form-message');
  const ratingPicker = document.querySelector('#rating-picker');
  let entries = [];
  let rating = null;
  let categoryFilter = 'all';
  let statusFilter = 'all';
  let storageAvailable = true;

  function isEntry(entry) {
    return entry && typeof entry.id === 'string' && typeof entry.title === 'string'
      && entry.title.trim().length > 0 && categories.includes(entry.category)
      && ['planned', 'watched'].includes(entry.status)
      && (entry.rating === null || (Number.isInteger(entry.rating) && entry.rating >= 1 && entry.rating <= 10))
      && typeof entry.comment === 'string' && Number.isFinite(entry.createdAt)
      && !Number.isNaN(new Date(entry.createdAt).getTime());
  }

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (Array.isArray(saved)) entries = saved.filter(isEntry).sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    storageAvailable = false;
  }

  function showMessage(text, error = false) {
    message.textContent = text;
    message.classList.toggle('error', error);
    message.hidden = false;
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
      storageAvailable = true;
      return true;
    } catch {
      storageAvailable = false;
      showMessage('Не удалось сохранить список в браузере. Изменения останутся до закрытия страницы.', true);
      return false;
    }
  }

  function setRating(value) {
    rating = value;
    for (const button of ratingPicker.children) {
      const selected = Number(button.dataset.rating) === rating;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
    document.querySelector('#rating-caption').textContent = rating === null ? 'необязательно' : `${rating} из 10 · нажмите ещё раз, чтобы убрать`;
  }

  for (let value = 1; value <= 10; value++) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rating-button';
    button.dataset.rating = String(value);
    button.textContent = String(value);
    button.setAttribute('aria-label', `Оценка ${value} из 10`);
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => setRating(rating === value ? null : value));
    ratingPicker.append(button);
  }

  function render() {
    list.replaceChildren();
    document.querySelector('#total-count').textContent = String(entries.length);
    const visible = entries.filter(entry => (categoryFilter === 'all' || entry.category === categoryFilter)
      && (statusFilter === 'all' || entry.status === statusFilter));
    empty.hidden = visible.length > 0;
    const filtered = entries.length > 0;
    empty.querySelector('h3').textContent = filtered ? 'Пока ничего не нашлось' : 'Здесь начнётся ваша история';
    empty.querySelector('p').textContent = filtered
      ? 'В этой категории и статусе пока нет тайтлов. Попробуйте изменить фильтры.'
      : 'Добавьте первый тайтл — фильм на вечер, сериал на выходные или любимый мультфильм.';
    const emptyButton = document.querySelector('#first-title-button');
    emptyButton.textContent = filtered ? 'Сбросить фильтры ↗' : 'Добавить первый тайтл ↑';

    const fragment = document.createDocumentFragment();
    for (const entry of visible) {
      const card = document.querySelector('#entry-template').content.firstElementChild.cloneNode(true);
      card.dataset.category = entry.category;
      card.querySelector('.entry-title').textContent = entry.title;
      card.querySelector('.entry-category').textContent = entry.category;
      card.querySelector('.entry-date').textContent = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(entry.createdAt);
      card.querySelector('.entry-comment').textContent = entry.comment;
      card.querySelector('.entry-comment').hidden = !entry.comment;
      card.querySelector('.entry-art > span').textContent = { 'Фильм': '▶', 'Сериал': '▤', 'Мультфильм': '✳', 'Другое': '◈' }[entry.category];
      card.querySelector('.entry-art > small').textContent = 'КАДР';
      const score = card.querySelector('.entry-rating');
      score.hidden = entry.rating === null;
      if (entry.rating !== null) {
        score.textContent = `★ ${entry.rating}`;
        const denominator = document.createElement('small');
        denominator.textContent = ' / 10';
        score.append(denominator);
        score.setAttribute('aria-label', `Оценка ${entry.rating} из 10`);
      }
      const statusButton = card.querySelector('.entry-status');
      statusButton.dataset.status = entry.status;
      statusButton.textContent = entry.status === 'watched' ? '✓ Посмотрел' : '◷ Хочу посмотреть';
      statusButton.title = entry.status === 'watched' ? 'Переместить в «Хочу посмотреть»' : 'Отметить как просмотренное';
      statusButton.addEventListener('click', () => {
        entry.status = entry.status === 'watched' ? 'planned' : 'watched';
        persist();
        render();
      });
      const deleteButton = card.querySelector('.delete-button');
      deleteButton.setAttribute('aria-label', `Удалить «${entry.title}»`);
      deleteButton.addEventListener('click', () => {
        entries = entries.filter(item => item.id !== entry.id);
        const saved = persist();
        render();
        if (saved) {
          showMessage(`«${entry.title}» удалён из коллекции. `);
          const undo = document.createElement('button');
          undo.type = 'button';
          undo.className = 'text-button';
          undo.style.marginTop = '0';
          undo.textContent = 'Отменить удаление';
          undo.addEventListener('click', () => {
            if (!entries.some(item => item.id === entry.id)) {
              entries.push(entry);
              entries.sort((a, b) => b.createdAt - a.createdAt);
            }
            const restored = persist();
            render();
            if (restored) showMessage(`«${entry.title}» восстановлен.`);
          });
          message.append(undo);
        }
      });
      fragment.append(card);
    }
    list.append(fragment);
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const values = new FormData(form);
    const title = String(values.get('title')).trim();
    if (!title) {
      showMessage('Введите название тайтла.', true);
      document.querySelector('#title').focus();
      return;
    }
    entries.unshift({
      id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title,
      category: String(values.get('category')),
      status: String(values.get('status')),
      rating,
      comment: String(values.get('comment')).trim(),
      createdAt: Date.now(),
    });
    const saved = persist();
    form.reset();
    setRating(null);
    resetFilters();
    if (saved) showMessage(`«${title}» добавлен в коллекцию.`);
  });

  function resetFilters() {
    categoryFilter = 'all';
    statusFilter = 'all';
    document.querySelector('#status-filter').value = 'all';
    updateCategoryButtons();
    render();
  }

  function updateCategoryButtons() {
    for (const button of document.querySelectorAll('[data-category].filter-chip')) {
      const active = button.dataset.category === categoryFilter;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }
  }

  document.querySelector('#category-filters').addEventListener('click', event => {
    const button = event.target.closest('button[data-category]');
    if (!button) return;
    categoryFilter = button.dataset.category;
    updateCategoryButtons();
    render();
  });
  document.querySelector('#status-filter').addEventListener('change', event => {
    statusFilter = event.target.value;
    render();
  });
  document.querySelector('#first-title-button').addEventListener('click', () => {
    if (entries.length > 0) resetFilters();
    else document.querySelector('#title').focus();
  });
  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    try {
      const saved = JSON.parse(event.newValue || '[]');
      if (Array.isArray(saved)) {
        entries = saved.filter(isEntry).sort((a, b) => b.createdAt - a.createdAt);
        render();
      }
    } catch { /* Keep the current list if another tab writes invalid data. */ }
  });

  render();
  if (!storageAvailable) showMessage('Не удалось прочитать сохранённый список. Проверьте, разрешено ли браузеру хранение данных.', true);
})();
