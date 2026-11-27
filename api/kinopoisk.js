'use strict';

// Per-instance bounds supplement the provider's account-wide quota.
const cache = new Map();
const clients = new Map();
let windowStart = 0;
let requests = 0;
const integer = (value, max) => Number.isInteger(value) && value > 0 && value <= max;
function normalize(movie) {
  if (!movie || !integer(movie.id, Number.MAX_SAFE_INTEGER)) return null;
  const title = [movie.name, movie.alternativeName, movie.enName]
    .find(value => typeof value === 'string' && value.trim());
  if (!title || title.trim().length > 160) return null;
  const series = movie.isSeries === true || ['tv-series', 'animated-series'].includes(movie.type);
  const category = series ? 'Сериал' : movie.type === 'movie' ? 'Фильм'
    : movie.type === 'cartoon' || (movie.type === 'anime' && movie.isSeries === false) ? 'Мультфильм' : '';
  const seasons = Array.isArray(movie.seasonsInfo)
    ? new Set(movie.seasonsInfo.filter(season => integer(season?.number, 9999)).map(season => season.number)).size : 0;
  return { id: movie.id, title: title.trim(), category,
    year: integer(movie.year, 9999) && movie.year >= 1000 ? String(movie.year) : '',
    rating: Number.isFinite(movie.rating?.kp) && movie.rating.kp >= 0 && movie.rating.kp <= 10
      && !(movie.rating.kp === 0 && movie.votes?.kp === 0) ? movie.rating.kp.toFixed(1) : '',
    duration: series ? (seasons ? String(seasons) : '')
      : category && integer(movie.movieLength, 9999) ? String(movie.movieLength) : '' };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const fail = (status, code) => res.status(status).json({ error: code });
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return fail(405, 'method'); }
  const query = req.query || {};
  const id = query.id;
  const search = typeof query.q === 'string' ? query.q.trim() : '';
  if (id !== undefined ? typeof id !== 'string' || !/^[1-9]\d{0,14}$/.test(id) || query.q !== undefined
    : search.length < 3 || search.length > 160 || /[\u0000-\u001f]/.test(search)) return fail(400, 'query');
  const key = process.env.POISKKINO_API_KEY;
  if (!key) return fail(503, 'not_configured');
  const now = Date.now();
  for (const [name, entry] of cache) if (entry.expires <= now) cache.delete(name);
  const cacheKey = id ? `id:${id}` : `q:${search.toLocaleLowerCase('ru-RU')}`;
  if (cache.has(cacheKey)) return res.status(200).json(cache.get(cacheKey).value);
  if (now - windowStart >= 60000) { windowStart = now; requests = 0; clients.clear(); }
  const ip = String(req.headers?.['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  if (requests >= 60 || (clients.get(ip) || 0) >= 15 || clients.size >= 500) {
    res.setHeader('Retry-After', '60'); return fail(429, 'limit');
  }
  requests++; clients.set(ip, (clients.get(ip) || 0) + 1);
  const endpoint = id ? `https://api.poiskkino.dev/v1.5/movie/${id}`
    : `https://api.poiskkino.dev/v1.5/movie/search?limit=5&query=${encodeURIComponent(search)}`;
  try {
    const response = await fetch(endpoint, { headers: { 'X-API-KEY': key, Accept: 'application/json' },
      signal: AbortSignal.timeout(7000), redirect: 'error' });
    if (!response.ok) return fail(response.status === 429 ? 429 : 502, 'provider');
    const data = await response.json();
    if (!id && !Array.isArray(data?.docs)) return fail(502, 'response');
    const movie = id ? normalize(data) : null;
    if (id && (!movie || String(movie.id) !== id)) return fail(502, 'response');
    const value = id ? { movie } : { movies: data.docs.slice(0, 5).map(normalize).filter(Boolean) };
    if (cache.size >= 100) cache.delete(cache.keys().next().value);
    cache.set(cacheKey, { value, expires: now + 120000 });
    return res.status(200).json(value);
  } catch { return fail(502, 'unavailable'); }
};
module.exports.normalize = normalize;
