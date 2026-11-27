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
  const FAVORITES_KEY = 'kadr.favorites.v1';
  const favoritesMessage = document.querySelector('#favorites-message');
  const searchInput = document.querySelector('#catalog-search');
  let favoriteIds = new Set();
  let view = 'catalog';
  let searchQuery = '';
  const categories = ['Фильм', 'Сериал', 'Мультфильм', 'Другое'];
  const form = document.querySelector('#title-form');
  const list = document.querySelector('#collection-list');
  const empty = document.querySelector('#empty-state');
  const message = document.querySelector('#form-message');
  let entries = [];
  let categoryFilter = 'all';
  let statusFilter = 'all';
  let storageAvailable = true;
  let editingId = null;
  const reviewDrafts = new Map();
  const dateDrafts = new Map();
  const monthly = window.KadrMonthly;
  const summaryMonth = document.querySelector('#summary-month');
  let selectedMonth = monthly.today().slice(0, 7);
  let reportText = '';
  let reportVersion = 0;

  function isEntry(entry) {
    return entry && typeof entry.id === 'string' && typeof entry.title === 'string'
      && entry.title.trim().length > 0 && categories.includes(entry.category)
      && ['planned', 'watched'].includes(entry.status)
      && (entry.rating === null || isPersonalRating(entry.rating))
      && typeof entry.comment === 'string' && Number.isFinite(entry.createdAt)
      && !Number.isNaN(new Date(entry.createdAt).getTime());
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      // Seed only a new catalog; an explicitly saved empty list stays empty.
      entries = [
        ['inception', 'Начало', 'Фильм', '2010', 8.7, 148],
        ['interstellar', 'Интерстеллар', 'Фильм', '2014', 8.6, 169],
        ['sherlock', 'Шерлок', 'Сериал', '2010', 8.9, 4],
        ['planet-earth', 'Планета Земля', 'Сериал', '2006', 9.4, 1],
        ['coco', 'Тайна Коко', 'Мультфильм', '2017', 8.6, 105],
        ['ratatouille', 'Рататуй', 'Мультфильм', '2007', 8.1, 111]
      ].map(([id, title, category, year, catalogRating, duration], index) => ({
        id: `starter-${id}`, title, category, year, catalogRating, duration,
        durationUnit: category === 'Сериал' ? 'seasons' : 'minutes',
        status: 'planned', rating: null, comment: '', origin: 'starter',
        createdAt: Date.UTC(2026, 0, 1) - index
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } else {
      const saved = JSON.parse(raw);
      if (Array.isArray(saved)) entries = saved.filter(isEntry).sort((a, b) => b.createdAt - a.createdAt);
    }
  } catch {
    storageAvailable = false;
  }

  function showMessage(text, error = false) {
    message.textContent = text;
    message.classList.toggle('error', error);
    message.hidden = false;
  }

  function persist(nextEntries = entries, errorText = 'Не удалось сохранить список в браузере. Попробуйте ещё раз.') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextEntries));
      entries = nextEntries;
      storageAvailable = true;
      return true;
    } catch {
      storageAvailable = false;
      showMessage(errorText, true);
      return false;
    }
  }

  function parseFavorites(value) {
    try {
      const saved = JSON.parse(value || '[]');
      return new Set(Array.isArray(saved) ? saved.filter(id => typeof id === 'string') : []);
    } catch {
      return new Set();
    }
  }

  function favoritesWarning() {
    favoritesMessage.textContent = 'Не удалось сохранить избранное. Изменения доступны до закрытия страницы';
    favoritesMessage.hidden = false;
  }

  try {
    favoriteIds = parseFavorites(localStorage.getItem(FAVORITES_KEY));
  } catch {
    favoritesWarning();
  }

  function persistFavorites() {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favoriteIds]));
      favoritesMessage.hidden = true;
    } catch {
      favoritesWarning();
    }
  }

  function isPersonalRating(value) {
    return Number.isFinite(value) && value >= 1 && value <= 10
      && Math.abs(value * 10 - Math.round(value * 10)) < 1e-8;
  }

  function parsePersonalRating(raw) {
    const text = raw.trim().replace(',', '.');
    if (!text) return { value: null, error: '' };
    if (!/^\d{1,2}(?:\.\d)?$/.test(text) || !isPersonalRating(Number(text))) {
      return { value: null, error: 'Введите оценку от 1.0 до 10.0, не больше одной цифры после точки' };
    }
    return { value: Number(text), error: '' };
  }

  function isBest(entry) {
    return entry.status === 'watched' && isPersonalRating(entry.rating) && entry.rating >= 8;
  }

  function render() {
    const focusedButton = document.activeElement?.closest('.entry-favorite, .delete-button, .entry-review-toggle, .entry-status, .watched-date-save');
    const focusSelector = ['delete-button', 'entry-review-toggle', 'entry-status', 'watched-date-save']
      .find(name => focusedButton?.classList.contains(name));
    const focusAction = focusSelector ? `.${focusSelector}` : '.entry-favorite';
    const oldCards = [...list.children];
    const focusedCard = focusedButton?.closest('.entry');
    const focusedId = focusedCard?.dataset.id;
    const focusedIndex = oldCards.indexOf(focusedCard);
    list.replaceChildren();
    const visible = entries.filter(entry => (view === 'catalog' || (view === 'favorites' ? favoriteIds.has(entry.id) : isBest(entry)))
      && (categoryFilter === 'all' || entry.category === categoryFilter)
      && (statusFilter === 'all' || entry.status === statusFilter)
      && entry.title.toLocaleLowerCase('ru-RU').includes(searchQuery));
    if (view === 'best') visible.sort((a, b) => b.rating - a.rating);
    document.querySelector('#best-description').hidden = view !== 'best';
    document.querySelector('.sort-note').textContent = view === 'best' ? 'Сначала лучшие' : 'Сначала новые';
    document.querySelector('#total-count').textContent = String(visible.length);
    empty.hidden = visible.length > 0;
    const noFavorites = view === 'favorites' && !entries.some(entry => favoriteIds.has(entry.id));
    const noBest = view === 'best' && !entries.some(isBest);
    const noEntries = entries.length === 0 && view === 'catalog';
    empty.querySelector('h3').textContent = noBest ? 'В лучшем пока пусто'
      : noFavorites ? 'В избранном пока пусто'
      : noEntries ? 'Здесь начнётся ваша история' : 'Ничего не найдено';
    empty.querySelector('p').textContent = noBest ? 'Отметьте просмотренное и поставьте личную оценку от 8.0'
      : noFavorites ? 'Добавляйте карточки кнопкой «В избранное»'
      : noEntries ? 'Добавьте первый тайтл — фильм на вечер, сериал на выходные или любимый мультфильм.'
      : statusFilter === 'all' ? 'Измените название или выберите другую категорию'
      : 'Измените название, категорию или статус.';
    const emptyButton = document.querySelector('#first-title-button');
    emptyButton.textContent = noFavorites || noBest ? 'Открыть каталог' : noEntries ? 'Добавить первый тайтл ↑' : 'Сбросить фильтры ↗';

    const fragment = document.createDocumentFragment();
    for (const entry of visible) {
      const card = document.querySelector('#entry-template').content.firstElementChild.cloneNode(true);
      card.dataset.category = entry.category;
      card.dataset.id = entry.id;
      card.querySelector('.entry-title').textContent = entry.title;
      card.querySelector('.entry-category').textContent = entry.category;
      card.querySelector('.entry-date').textContent = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(entry.createdAt);
      const details = [];
      if (/^[1-9]\d{3}$/.test(String(entry.year ?? ''))) details.push(String(entry.year));
      if (Number.isFinite(entry.catalogRating) && entry.catalogRating >= 0 && entry.catalogRating <= 10) details.push(`Рейтинг ${entry.catalogRating.toFixed(1)}`);
      if (Number.isInteger(entry.duration) && entry.duration > 0 && entry.duration <= 9999) {
        details.push(entry.durationUnit === 'seasons' ? seasonLabel(entry.duration) : `${entry.duration} мин`);
      }
      const detailLine = card.querySelector('.entry-details');
      detailLine.textContent = details.join(' · ');
      detailLine.hidden = details.length === 0;
      card.querySelector('.entry-comment').textContent = entry.comment;
      card.querySelector('.entry-comment').hidden = !entry.comment;
      card.querySelector('.entry-art > span').textContent = { 'Фильм': '▶', 'Сериал': '▤', 'Мультфильм': '✳', 'Другое': '◈' }[entry.category];
      card.querySelector('.entry-art > small').textContent = 'КАДР';
      const score = card.querySelector('.entry-rating');
      score.hidden = entry.rating === null;
      if (entry.rating !== null) {
        score.textContent = `Ваша оценка ${entry.rating.toFixed(1)}`;
        const denominator = document.createElement('small');
        denominator.textContent = ' / 10';
        score.append(denominator);
        score.setAttribute('aria-label', `Ваша оценка ${entry.rating.toFixed(1)} из 10`);
      }
      const statusButton = card.querySelector('.entry-status');
      statusButton.dataset.status = entry.status;
      statusButton.textContent = entry.status === 'watched' ? '✓ Посмотрел' : '◷ Хочу посмотреть';
      statusButton.title = entry.status === 'watched' ? 'Переместить в «Хочу посмотреть»' : 'Отметить как просмотренное';
      statusButton.addEventListener('click', () => {
        statusButton.focus();
        const nextEntries = entries.map(item => {
          if (item.id !== entry.id) return item;
          const status = item.status === 'watched' ? 'planned' : 'watched';
          const watchedOn = status === 'watched' && !monthly.isWatchedOn(item.watchedOn)
            ? monthly.today() : item.watchedOn;
          return { ...item, status, ...(watchedOn !== undefined ? { watchedOn } : {}) };
        });
        if (persist(nextEntries)) render();
      });
      const favoriteButton = card.querySelector('.entry-favorite');
      const isFavorite = favoriteIds.has(entry.id);
      favoriteButton.textContent = isFavorite ? 'Убрать из избранного' : 'В избранное';
      favoriteButton.setAttribute('aria-pressed', String(isFavorite));
      favoriteButton.setAttribute('aria-label', `${favoriteButton.textContent}: ${entry.title}`);
      favoriteButton.addEventListener('click', () => {
        // Keep focus even in browsers that do not focus buttons on mouse clicks.
        favoriteButton.focus();
        if (favoriteIds.has(entry.id)) favoriteIds.delete(entry.id);
        else favoriteIds.add(entry.id);
        persistFavorites();
        render();
      });
      attachReviewEditor(card, entry);
      attachWatchedDate(card, entry);
      const deleteButton = card.querySelector('.delete-button');
      deleteButton.setAttribute('aria-label', `Удалить карточку «${entry.title}»`);
      deleteButton.hidden = entry.origin === 'builtin';
      deleteButton.addEventListener('click', () => {
        deleteButton.focus();
        const nextEntries = entries.filter(item => item.id !== entry.id);
        const saved = persist(nextEntries, 'Не удалось удалить карточку из сохранённого каталога');
        if (!saved) return;
        if (editingId === entry.id) editingId = null;
        reviewDrafts.delete(entry.id);
        dateDrafts.delete(entry.id);
        render();
        showMessage(`«${entry.title}» удалён из каталога. `);
        const undo = document.createElement('button');
        undo.type = 'button';
        undo.className = 'text-button';
        undo.style.marginTop = '0';
        undo.textContent = 'Отменить удаление';
        undo.addEventListener('click', () => {
          const nextEntries = entries.some(item => item.id === entry.id) ? entries
            : [...entries, entry].sort((a, b) => b.createdAt - a.createdAt);
          if (persist(nextEntries, 'Не удалось восстановить карточку. Попробуйте ещё раз.')) {
            render();
            showMessage(`«${entry.title}» восстановлен.`);
          }
        });
        message.append(undo);
      });
      fragment.append(card);
    }
    list.append(fragment);
    if (focusedId !== undefined) {
      const cards = [...list.children];
      const nextCard = cards.find(card => card.dataset.id === focusedId)
        || cards[Math.min(focusedIndex, cards.length - 1)];
      if (nextCard) nextCard.querySelector(focusAction).focus();
      else document.querySelector(`[data-view="${view}"]`).focus();
    }
    renderMonthlySummary();
  }

  function attachWatchedDate(card, entry) {
    const editor = document.querySelector('#watched-date-template').content.firstElementChild.cloneNode(true);
    const input = editor.querySelector('.watched-date-input');
    const hint = editor.querySelector('.watched-date-hint');
    const error = editor.querySelector('.watched-date-error');
    const save = editor.querySelector('.watched-date-save');
    const valid = monthly.isWatchedOn(entry.watchedOn);
    const id = `watched-date-${entry.id}`;
    editor.hidden = entry.status !== 'watched';
    input.id = id;
    input.max = monthly.today();
    input.value = dateDrafts.get(entry.id) ?? (valid ? entry.watchedOn : '');
    hint.id = `${id}-hint`;
    error.id = `${id}-error`;
    editor.querySelector('.watched-date-label').setAttribute('for', id);
    input.setAttribute('aria-describedby', `${hint.id} ${error.id}`);
    save.setAttribute('aria-label', `Сохранить дату просмотра: ${entry.title}`);
    hint.textContent = valid ? `Учтено: ${entry.watchedOn.split('-').reverse().join('.')}`
      : 'Дата просмотра не указана. Запись не включена в итоги за месяц.';
    input.addEventListener('input', () => {
      dateDrafts.set(entry.id, input.value);
      input.setAttribute('aria-invalid', 'false');
      error.hidden = true;
    });
    editor.addEventListener('submit', event => {
      event.preventDefault();
      dateDrafts.set(entry.id, input.value);
      if (!monthly.isWatchedOn(input.value)) {
        error.textContent = 'Укажите существующую дату не позже сегодняшнего дня';
        error.hidden = false;
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return;
      }
      const current = entries.find(item => item.id === entry.id);
      if (!current || current.status !== 'watched') return;
      const nextEntries = entries.map(item => item.id === entry.id ? { ...item, watchedOn: input.value } : item);
      const errorText = 'Не удалось сохранить дату просмотра. Попробуйте ещё раз.';
      if (!persist(nextEntries, errorText)) {
        error.textContent = errorText;
        error.hidden = false;
        return;
      }
      dateDrafts.delete(entry.id);
      save.focus();
      render();
      showMessage('Дата просмотра сохранена');
    });
    card.querySelector('.entry-body').append(editor);
  }

  function renderMonthlySummary() {
    const today = monthly.today();
    summaryMonth.max = today.slice(0, 7);
    const summary = monthly.summarize(entries, selectedMonth, today);
    document.querySelector('#monthly-period-title').textContent = summary.title;
    document.querySelector('#monthly-total').textContent = String(summary.total);
    document.querySelector('#monthly-films').textContent = String(summary.counts['Фильм']);
    document.querySelector('#monthly-series').textContent = String(summary.counts['Сериал']);
    document.querySelector('#monthly-cartoons').textContent = String(summary.counts['Мультфильм']);
    document.querySelector('#monthly-empty').hidden = summary.total !== 0;
    document.querySelector('#monthly-top-empty').hidden = summary.top.length !== 0;
    const top = document.querySelector('#monthly-top');
    top.replaceChildren();
    for (const item of summary.top) {
      const row = document.createElement('li');
      row.textContent = `${item.label} — ${item.count}`;
      top.append(row);
    }
    const delta = monthly.comparison(summary.difference, summary.previousTotal);
    document.querySelector('#monthly-previous').textContent = `${summary.previousTitle}: ${summary.previousTotal}`;
    document.querySelector('#monthly-comparison').textContent = delta;
    document.querySelector('#monthly-current').hidden = !summary.current;
    const warning = document.querySelector('#monthly-undated');
    warning.hidden = summary.undated === 0;
    warning.textContent = `Просмотренных без корректной даты: ${summary.undated}. Во всём каталоге; эти записи не включены в итоги и сравнение.`;
    const nextReport = monthly.report(summary);
    if (nextReport !== reportText) {
      reportText = nextReport;
      reportVersion++;
      document.querySelector('#monthly-copy-status').textContent = '';
      document.querySelector('#monthly-copy-fallback').hidden = true;
      document.querySelector('#monthly-report').value = reportText;
      document.querySelector('#monthly-announcement').textContent = `${summary.title}. Всего просмотрено: ${summary.total}. ${delta}. Без корректной даты: ${summary.undated}.`;
    }
  }

  function attachReviewEditor(card, entry) {
    const toggle = card.querySelector('.entry-review-toggle');
    const editor = document.querySelector('#review-template').content.firstElementChild.cloneNode(true);
    const ratingInput = editor.querySelector('.review-rating-input');
    const noteInput = editor.querySelector('.review-note-input');
    const ratingError = editor.querySelector('.review-rating-error');
    const noteError = editor.querySelector('.review-note-error');
    const saveError = editor.querySelector('.review-save-error');
    const editorId = `review-${entry.id}`;
    editor.id = editorId;
    ratingInput.id = `${editorId}-rating`;
    noteInput.id = `${editorId}-note`;
    ratingError.id = `${editorId}-rating-error`;
    noteError.id = `${editorId}-note-error`;
    const hint = editor.querySelector('.review-hint');
    hint.id = `${editorId}-hint`;
    editor.querySelector('.review-rating-label').setAttribute('for', ratingInput.id);
    editor.querySelector('.review-note-label').setAttribute('for', noteInput.id);
    ratingInput.setAttribute('aria-describedby', `${hint.id} ${ratingError.id}`);
    noteInput.setAttribute('aria-describedby', noteError.id);
    toggle.setAttribute('aria-controls', editorId);
    toggle.setAttribute('aria-label', `Оценка и заметка: ${entry.title}`);
    const open = editingId === entry.id;
    toggle.setAttribute('aria-expanded', String(open));
    editor.hidden = !open;
    const draft = reviewDrafts.get(entry.id) || {
      ratingText: entry.rating === null ? '' : entry.rating.toFixed(1),
      noteText: entry.comment,
    };
    ratingInput.value = draft.ratingText;
    noteInput.value = draft.noteText;
    ratingInput.disabled = entry.status !== 'watched';
    hint.textContent = ratingInput.disabled ? 'Чтобы оценить, отметьте как просмотренное'
      : 'От 1.0 до 10.0; пустое поле снимает оценку';

    function rememberDraft() {
      reviewDrafts.set(entry.id, { ratingText: ratingInput.value, noteText: noteInput.value });
    }
    toggle.addEventListener('click', () => {
      toggle.focus();
      if (editingId === entry.id) {
        editingId = null;
        reviewDrafts.delete(entry.id);
      } else {
        editingId = entry.id;
        rememberDraft();
      }
      render();
      if (editingId === entry.id) {
        const rendered = [...list.children].find(item => item.dataset.id === entry.id);
        rendered?.querySelector(entry.status === 'watched' ? '.review-rating-input' : '.review-note-input').focus();
      }
    });
    ratingInput.addEventListener('input', () => {
      rememberDraft();
      ratingInput.setAttribute('aria-invalid', 'false');
      ratingError.hidden = true;
    });
    noteInput.addEventListener('input', () => {
      rememberDraft();
      noteInput.setAttribute('aria-invalid', 'false');
      noteError.hidden = true;
    });
    editor.querySelector('.review-cancel').addEventListener('click', () => {
      toggle.focus();
      editingId = null;
      reviewDrafts.delete(entry.id);
      render();
    });
    editor.addEventListener('submit', event => {
      event.preventDefault();
      rememberDraft();
      const current = entries.find(item => item.id === entry.id);
      if (!current) return;
      const personal = current.status === 'watched' ? parsePersonalRating(ratingInput.value)
        : { value: current.rating, error: '' };
      const noteTooLong = noteInput.value.length > 3000;
      ratingError.textContent = personal.error;
      ratingError.hidden = !personal.error;
      ratingInput.setAttribute('aria-invalid', String(Boolean(personal.error)));
      noteError.textContent = noteTooLong ? 'Заметка должна быть не длиннее 3000 символов' : '';
      noteError.hidden = !noteTooLong;
      noteInput.setAttribute('aria-invalid', String(noteTooLong));
      saveError.hidden = true;
      if (personal.error || noteTooLong) {
        (personal.error ? ratingInput : noteInput).focus();
        return;
      }
      const nextEntries = entries.map(item => item.id === entry.id
        ? { ...item, rating: personal.value, comment: noteInput.value.trim() } : item);
      const errorText = 'Не удалось сохранить оценку и заметку. Проверьте доступность хранилища браузера';
      if (!persist(nextEntries, errorText)) {
        saveError.textContent = errorText;
        saveError.hidden = false;
        return;
      }
      toggle.focus();
      editingId = null;
      reviewDrafts.delete(entry.id);
      render();
      showMessage('Оценка и заметка сохранены');
    });
    card.querySelector('.entry-body').append(editor);
  }

  function seasonLabel(count) {
    const lastTwo = count % 100;
    const last = count % 10;
    const word = lastTwo >= 11 && lastTwo <= 14 ? 'сезонов'
      : last === 1 ? 'сезон' : last >= 2 && last <= 4 ? 'сезона' : 'сезонов';
    return `${count} ${word}`;
  }

  const validatedFields = ['title', 'category', 'year', 'catalog-rating', 'duration', 'personal-rating', 'comment'];

  function setFieldError(id, text = '') {
    const input = document.querySelector(`#${id}`);
    const error = document.querySelector(`#${id}-error`);
    input.setAttribute('aria-invalid', String(Boolean(text)));
    error.textContent = text;
    error.hidden = !text;
  }

  function updateDurationUnit() {
    const seasons = document.querySelector('#category').value === 'Сериал';
    document.querySelector('#duration-unit').textContent = seasons ? 'В сезонах' : 'В минутах';
    document.querySelector('#duration').placeholder = seasons ? '2' : '120';
    const value = document.querySelector('#duration').value.trim();
    if (value) setFieldError('duration', /^[1-9]\d{0,3}$/.test(value) ? '' : 'Введите целое число от 1 до 9999');
  }
  document.querySelector('#category').addEventListener('change', updateDurationUnit);
  for (const id of validatedFields) {
    document.querySelector(`#${id}`).addEventListener('input', () => setFieldError(id));
  }
  updateDurationUnit();

  function updateCreateRating() {
    const watched = new FormData(form).get('status') === 'watched';
    document.querySelector('#personal-rating').disabled = !watched;
    document.querySelector('#personal-rating-hint').textContent = watched
      ? 'От 1.0 до 10.0; пустое поле — без оценки' : 'Чтобы оценить, отметьте как просмотренное';
    if (!watched) setFieldError('personal-rating');
  }
  form.addEventListener('change', updateCreateRating);
  updateCreateRating();

  form.addEventListener('submit', event => {
    event.preventDefault();
    const values = new FormData(form);
    const title = String(values.get('title') || '').trim();
    const category = String(values.get('category') || '');
    const year = String(values.get('year') || '').trim();
    const rawRating = String(values.get('catalogRating') || '').trim().replace(',', '.');
    const rawDuration = String(values.get('duration') || '').trim();
    const status = String(values.get('status') || 'planned');
    const personal = status === 'watched' ? parsePersonalRating(String(values.get('personalRating') || '')) : { value: null, error: '' };
    const comment = String(values.get('comment') || '').trim();
    const errors = {
      'personal-rating': personal.error,
      comment: comment.length <= 3000 ? '' : 'Заметка должна быть не длиннее 3000 символов',
      title: title.length >= 1 && title.length <= 160 ? '' : 'Введите название от 1 до 160 символов',
      category: ['Фильм', 'Сериал', 'Мультфильм'].includes(category) ? '' : 'Выберите категорию из списка',
      year: /^[1-9]\d{3}$/.test(year) ? '' : 'Введите год четырьмя цифрами от 1000 до 9999',
      'catalog-rating': /^\d{1,2}(?:\.\d)?$/.test(rawRating) && Number(rawRating) <= 10 ? '' : 'Введите рейтинг от 0.0 до 10.0, не более одной цифры после точки',
      duration: /^[1-9]\d{0,3}$/.test(rawDuration) ? '' : 'Введите целое число от 1 до 9999',
    };
    for (const id of validatedFields) setFieldError(id, errors[id]);
    const firstError = validatedFields.find(id => errors[id]);
    if (firstError) {
      showMessage('Проверьте отмеченные поля.', true);
      document.querySelector(`#${firstError}`).focus();
      return;
    }
    const entry = {
      id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title, category, year,
      catalogRating: Number(rawRating),
      duration: Number(rawDuration),
      durationUnit: category === 'Сериал' ? 'seasons' : 'minutes',
      origin: 'user',
      status,
      ...(status === 'watched' ? { watchedOn: monthly.today() } : {}),
      rating: personal.value,
      comment,
      createdAt: Date.now(),
    };
    if (!persist([entry, ...entries], 'Не удалось сохранить карточку. Проверьте доступность хранилища браузера')) return;
    form.reset();
    updateCreateRating();
    updateDurationUnit();
    setView('catalog');
    resetFilters();
    showMessage('Карточка добавлена');
  });

  function resetFilters() {
    categoryFilter = 'all';
    statusFilter = 'all';
    searchQuery = '';
    searchInput.value = '';
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
  function setView(nextView) {
    view = nextView;
    for (const button of document.querySelectorAll('[data-view]')) {
      const active = button.dataset.view === view;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }
  }

  document.querySelector('#collection-views').addEventListener('click', event => {
    const button = event.target.closest('button[data-view]');
    if (!button) return;
    setView(button.dataset.view);
    render();
  });
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim().toLocaleLowerCase('ru-RU');
    render();
  });
  document.querySelector('#first-title-button').addEventListener('click', () => {
    if ((view === 'favorites' && !entries.some(entry => favoriteIds.has(entry.id)))
      || (view === 'best' && !entries.some(isBest))) {
      setView('catalog');
      render();
    } else if (entries.length > 0) resetFilters();
    else document.querySelector('#title').focus();
  });
  window.addEventListener('storage', event => {
    if (event.key === FAVORITES_KEY || event.key === null) {
      favoriteIds = parseFavorites(event.key === null ? null : event.newValue);
      render();
      if (event.key !== null) return;
    }
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    try {
      const saved = JSON.parse(event.newValue || '[]');
      if (Array.isArray(saved)) {
        entries = saved.filter(isEntry).sort((a, b) => b.createdAt - a.createdAt);
        render();
      }
    } catch { /* Keep the current list if another tab writes invalid data. */ }
  });

  summaryMonth.value = selectedMonth;
  summaryMonth.addEventListener('change', () => {
    const value = summaryMonth.value;
    const error = document.querySelector('#summary-month-error');
    if (!monthly.isMonth(value) || value > monthly.today().slice(0, 7)) {
      error.textContent = 'Выберите текущий или прошедший месяц с годом из четырёх цифр';
      error.hidden = false;
      summaryMonth.setAttribute('aria-invalid', 'true');
      return;
    }
    selectedMonth = value;
    error.hidden = true;
    summaryMonth.setAttribute('aria-invalid', 'false');
    renderMonthlySummary();
  });
  document.querySelector('#copy-monthly-report').addEventListener('click', async () => {
    // Snapshot the report at the click, including when clipboard permission takes time.
    const text = reportText;
    const version = reportVersion;
    const button = document.querySelector('#copy-monthly-report');
    const status = document.querySelector('#monthly-copy-status');
    button.disabled = true;
    status.textContent = '';
    try {
      const clipboard = window.navigator?.clipboard;
      if (!clipboard?.writeText) throw new Error('Clipboard unavailable');
      await clipboard.writeText(text);
      if (version === reportVersion) {
        document.querySelector('#monthly-copy-fallback').hidden = true;
        status.textContent = 'Отчёт скопирован';
      }
    } catch {
      if (version === reportVersion) {
        const output = document.querySelector('#monthly-report');
        output.value = text;
        document.querySelector('#monthly-copy-fallback').hidden = false;
        status.textContent = 'Скопируйте текст вручную: Ctrl+C или Command+C. На телефоне выделите текст и выберите «Скопировать».';
        output.focus();
        output.select();
      }
    } finally {
      button.disabled = false;
    }
  });

  render();
  if (!storageAvailable) showMessage('Не удалось прочитать сохранённый список. Проверьте, разрешено ли браузеру хранение данных.', true);
})();
