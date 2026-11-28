const ENDPOINT = 'https://api.poiskkino.dev/v1.5/movie/search';
const unavailable = 'Поиск недоступен. Заполните форму вручную';

// Dependencies can be replaced in isolated tests; the deployed handler uses native APIs.
export function createSearchHandler({ getKey = () => process.env.POISKKINO_API_KEY,
  fetcher = globalThis.fetch, now = Date.now } = {}) {
  const cache = new Map();
  const clients = new Map();
  function json(status, data, extra = {}) {
    return new Response(JSON.stringify(data), { status, headers: {
      'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', ...extra
    } });
  }
  return async function search(request) {
    if (request.method !== 'GET') return json(405, { error: unavailable }, { Allow: 'GET' });
    const url = new URL(request.url);
    const origin = request.headers.get('origin');
    if ((origin && origin !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
      return json(403, { error: unavailable });
    }
    const queries = url.searchParams.getAll('query');
    const query = queries.length === 1 ? queries[0].trim() : '';
    if (query.length < 3 || query.length > 160) return json(400, { error: 'Введите название от 3 до 160 символов' });
    const key = getKey()?.trim();
    if (!key || /[\s\u0400-\u04ff]/.test(key)) return json(503, { error: unavailable });
    const time = now();
    const cacheKey = query.toLocaleLowerCase('ru-RU');
    for (const [id, item] of cache) if (item.expires <= time) cache.delete(id);
    if (cache.has(cacheKey)) return json(200, cache.get(cacheKey).data);
    for (const [id, item] of clients) if (item.until <= time) clients.delete(id);
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
    const client = clients.get(ip) || { count: 0, until: time + 60000 };
    if (client.count >= 30) return json(429, { error: 'Лимит поиска исчерпан' }, {
      'Retry-After': String(Math.max(1, Math.ceil((client.until - time) / 1000)))
    });
    client.count++;
    if (clients.size >= 500 && !clients.has(ip)) clients.delete(clients.keys().next().value);
    clients.set(ip, client);
    try {
      const params = new URLSearchParams({ page: '1', limit: '10', query });
      const response = await fetcher(`${ENDPOINT}?${params}`, {
        method: 'GET', headers: { 'X-API-KEY': key }, redirect: 'error',
        signal: AbortSignal.timeout(6000), credentials: 'omit'
      });
      if (!response.ok) {
        const status = [401, 403, 429].includes(response.status) ? response.status : 502;
        const retry = response.headers.get('Retry-After');
        return json(status, { error: unavailable }, status === 429 ? {
          'Retry-After': retry && /^\d+$/.test(retry) ? String(Math.min(3600, Math.max(1, Number(retry)))) : '10'
        } : {});
      }
      const body = await response.json();
      if (body?.error || !Array.isArray(body?.docs)) return json(502, { error: unavailable });
      // Only public fields used by the form are returned; no provider headers or error bodies.
      const data = { docs: body.docs.slice(0, 10).filter(item => item && typeof item === 'object').map(item => ({
        id: item.id, name: item.name, alternativeName: item.alternativeName, year: item.year,
        type: item.type, isSeries: item.isSeries, movieLength: item.movieLength,
        seasonsInfo: Array.isArray(item.seasonsInfo) ? item.seasonsInfo.slice(0, 9999).map(season => ({ number: season?.number })) : [],
        rating: { kp: item.rating?.kp, imdb: item.rating?.imdb }
      })) };
      if (cache.size >= 100) cache.delete(cache.keys().next().value);
      cache.set(cacheKey, { data, expires: time + 300000 });
      return json(200, data);
    } catch {
      return json(502, { error: unavailable });
    }
  };
}

export default { fetch: createSearchHandler() };
