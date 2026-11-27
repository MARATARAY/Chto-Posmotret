/* Calendar-only calculations: never convert a viewing date to UTC. */
((root) => {
  'use strict';

  const categories = ['Фильм', 'Сериал', 'Мультфильм'];
  const labels = { 'Фильм': 'Фильмы', 'Сериал': 'Сериалы', 'Мультфильм': 'Мультфильмы' };
  const months = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

  function today(now = new Date()) {
    return `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  function isMonth(value) {
    return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
      && Number(value.slice(0, 4)) >= 1;
  }

  function isCalendarDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    if (year < 1 || month < 1 || month > 12 || day < 1) return false;
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return day <= days[month - 1];
  }

  function isWatchedOn(value, localToday = today()) {
    return isCalendarDate(value) && value <= localToday;
  }

  function previousMonth(value) {
    const [year, month] = value.split('-').map(Number);
    return month === 1 ? `${String(year - 1).padStart(4, '0')}-12`
      : `${String(year).padStart(4, '0')}-${String(month - 1).padStart(2, '0')}`;
  }

  function monthLabel(value) {
    const [year, month] = value.split('-').map(Number);
    return `${months[month - 1]} ${year}`;
  }

  function comparison(difference, previousTotal) {
    if (previousTotal === 0) return 'В прошлом месяце записей не было';
    if (difference > 0) return `На ${difference} больше, чем в прошлом месяце`;
    if (difference < 0) return `На ${Math.abs(difference)} меньше, чем в прошлом месяце`;
    return 'Столько же, сколько в прошлом месяце';
  }

  function summarize(entries, month, localToday = today()) {
    if (!isMonth(month) || month > localToday.slice(0, 7)) throw new RangeError('Недопустимый месяц');
    const previous = previousMonth(month);
    const counts = Object.fromEntries(categories.map(category => [category, 0]));
    let previousTotal = 0;
    let undated = 0;
    for (const entry of entries) {
      if (entry.status !== 'watched' || !categories.includes(entry.category)) continue;
      if (!isWatchedOn(entry.watchedOn, localToday)) {
        undated++;
        continue;
      }
      const watchedMonth = entry.watchedOn.slice(0, 7);
      if (watchedMonth === month) counts[entry.category]++;
      if (watchedMonth === previous) previousTotal++;
    }
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    const top = categories.map(category => ({ category, label: labels[category], count: counts[category] }))
      .filter(item => item.count > 0).sort((a, b) => b.count - a.count);
    return { month, previous, title: monthLabel(month), previousTitle: monthLabel(previous),
      counts, total, previousTotal, difference: total - previousTotal, undated,
      current: month === localToday.slice(0, 7), top };
  }

  function report(summary) {
    const delta = comparison(summary.difference, summary.previousTotal);
    const total = summary.previousTotal > 0
      ? `Всего просмотрено: ${summary.total} (${delta.toLocaleLowerCase('ru-RU')})`
      : `Всего просмотрено: ${summary.total}`;
    const lines = [`🎬 Мои итоги просмотра за ${summary.title}:`, total, 'Топ категорий:',
      ...(summary.top.length ? summary.top.map((item, index) => `${index + 1}. ${item.label} — ${item.count}`) : ['Нет данных']),
      `${summary.previousTitle}: ${summary.previousTotal}`];
    if (summary.previousTotal === 0) lines.push(delta);
    if (summary.total === 0) lines.push('В этом месяце вы ещё ничего не отметили как просмотренное');
    lines.push('По записям с указанной датой просмотра.');
    if (summary.current) lines.push('Месяц ещё не завершён: сравнение с полным предыдущим месяцем.');
    if (summary.undated) lines.push(`Просмотренных без корректной даты: ${summary.undated}. Эти записи не включены в итоги и сравнение.`);
    return lines.join('\n');
  }

  const api = { today, isMonth, isCalendarDate, isWatchedOn, previousMonth, monthLabel, comparison, summarize, report };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KadrMonthly = api;
})(typeof window !== 'undefined' ? window : globalThis);
