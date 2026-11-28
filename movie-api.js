(() => {
  'use strict';
const ENDPOINTS = {
  poiskkino: 'https://api.poiskkino.dev/v1.5/movie/search',
  'kinopoisk-unofficial': 'https://kinopoiskapiunofficial.tech/api/v2.2/films'
};

function adaptItem(item, provider) {
  if (provider === 'kinopoisk-unofficial') {
    const series = ['TV_SERIES', 'MINI_SERIES'].includes(item.type);
    const animation = Array.isArray(item.genres) && item.genres.some(genre => typeof genre?.genre === 'string'
      && ['мультфильм', 'аниме'].includes(genre.genre.toLocaleLowerCase('ru-RU')));
    return { provider, id: item.kinopoiskId, name: item.nameRu, alternativeName: item.nameOriginal,
      year: item.year, rating: { kp: item.ratingKinopoisk, imdb: item.ratingImdb },
      type: animation ? (series ? 'animated-series' : 'cartoon') : series ? 'tv-series' : 'movie',
      isSeries: series };
  }
  return { provider, id: item.id, name: item.name, alternativeName: item.alternativeName, year: item.year,
    type: item.type, isSeries: item.isSeries, movieLength: item.movieLength,
    seasonsInfo: Array.isArray(item.seasonsInfo) ? item.seasonsInfo.slice(0, 9999).map(season => ({ number: season?.number })) : [],
    rating: { kp: item.rating?.kp, imdb: item.rating?.imdb }
  };
}


function adaptResponse(body, provider) {
  const rows = provider === 'kinopoisk-unofficial' ? body?.items : body?.docs;
  if (body?.error || !Array.isArray(rows)) throw new Error('Invalid search response');
  return { docs: rows.slice(0, 20).filter(item => item && typeof item === 'object').map(item => adaptItem(item, provider)) };
}
function createLocalFetch(config, fetcher) {
  if (!config || !Object.hasOwn(ENDPOINTS, config.provider)
    || typeof config.apiKey !== 'string' || !config.apiKey.trim() || /[\s\u0400-\u04ff]/.test(config.apiKey)) return null;
  const provider = config.provider, key = config.apiKey.trim();
  return async function localFetch(path, options) {
    const query = new URL(path, 'https://local.invalid').searchParams.get('query') || '';
    const params = new URLSearchParams(provider === 'kinopoisk-unofficial'
      ? { page: '1', keyword: query } : { page: '1', limit: '10', query });
    const response = await fetcher(`${ENDPOINTS[provider]}?${params}`, {
      method: 'GET', headers: { 'X-API-KEY': key }, signal: options.signal,
      credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error'
    });
    return { ok: response.ok, status: response.status === 402 ? 429 : response.status,
      headers: response.headers, json: async () => adaptResponse(await response.json(), provider) };
  };
}
const api = { ENDPOINTS, adaptResponse, createLocalFetch };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else window.KadrMovieAPI = api;
})();
