import assert from 'node:assert/strict';
import { createSearchHandler } from '../api/movie-search.mjs';

const token = 'test-private-token';
const item = { id: 301, name: 'Матрица', year: 1999, type: 'movie', movieLength: 136,
  rating: { kp: 8.501, imdb: 8.7, filmCritics: 7.9 }, privateField: token };
const request = (query = 'Матрица', headers = {}, method = 'GET') => new Request(
  `https://catalog.example/api/movie-search?${new URLSearchParams({ query })}`, { method, headers });
function boot({ status = 200, body = { docs: [item] }, retry, fail, key = token } = {}) {
  const calls = [];
  let clock = 1000;
  const handler = createSearchHandler({ getKey: () => key, now: () => clock, fetcher: async (url, options) => {
    calls.push({ url, options });
    if (fail) throw Error(token);
    return new Response(JSON.stringify(body), { status, headers: retry ? { 'Retry-After': retry } : {} });
  } });
  return { handler, calls, advance(ms) { clock += ms; } };
}
const t = boot();
for (const name of ['', '  ', 'Ма', 'x'.repeat(161)]) assert.equal((await t.handler(request(name))).status, 400);
assert.equal((await t.handler(request('Матрица', {}, 'POST'))).status, 405);
assert.equal((await t.handler(request('Матрица', { Origin: 'https://other.example' }))).status, 403);
assert.equal((await t.handler(request('Матрица', { 'Sec-Fetch-Site': 'cross-site' }))).status, 403);
assert.equal((await t.handler(new Request('https://catalog.example/api/movie-search?query=one&query=two'))).status, 400);
assert.equal(t.calls.length, 0);
const response = await t.handler(request(' Матрица & + ', { Origin: 'https://catalog.example' }));
assert.equal(response.status, 200);
assert.equal(response.headers.get('Cache-Control'), 'no-store');
assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
const text = await response.text(); assert.ok(!text.includes(token));
const data = JSON.parse(text); assert.equal(data.docs[0].rating.kp, 8.501); assert.equal(data.docs[0].privateField, undefined);
assert.deepEqual(Object.keys(data.docs[0].rating), ['kp', 'imdb']);
const call = t.calls[0], url = new URL(call.url);
assert.equal(url.origin, 'https://api.poiskkino.dev'); assert.equal(url.pathname, '/v1.5/movie/search');
assert.equal(url.searchParams.get('query'), 'Матрица & +'); assert.equal(url.searchParams.get('page'), '1');
assert.equal(url.searchParams.get('limit'), '10'); assert.equal(call.options.method, 'GET');
assert.equal(call.options.headers['X-API-KEY'], token); assert.equal(call.options.redirect, 'error');
assert.ok(call.options.signal instanceof AbortSignal); assert.ok(!url.href.includes(token));
await t.handler(request('матрица & +')); assert.equal(t.calls.length, 1);
t.advance(300001); await t.handler(request('Матрица & +')); assert.equal(t.calls.length, 2);
const unset = boot({ key: '' }); assert.equal((await unset.handler(request())).status, 503); assert.equal(unset.calls.length, 0);
for (const status of [401, 403, 429, 500]) {
  const error = boot({ status, body: { message: token }, retry: '999999' });
  const result = await error.handler(request()); assert.equal(result.status, status === 500 ? 502 : status);
  assert.ok(!(await result.text()).includes(token));
  if (status === 429) assert.equal(result.headers.get('Retry-After'), '3600');
}
for (const options of [{ fail: true }, { body: {} }, { body: { error: token, docs: [] } }]) {
  const bad = await boot(options).handler(request()); assert.equal(bad.status, 502); assert.ok(!(await bad.text()).includes(token));
}
const quota = boot();
for (let i = 0; i < 30; i++) assert.equal((await quota.handler(request('Запрос ' + i))).status, 200);
assert.equal((await quota.handler(request('Лимит'))).status, 429); assert.equal(quota.calls.length, 30);
assert.equal((await quota.handler(request('Запрос 0'))).status, 200); // Cached queries do not spend quota.
quota.advance(60001); assert.equal((await quota.handler(request('Лимит'))).status, 200);
const bounded = boot();
for (let i = 0; i < 101; i++) await bounded.handler(request('Запрос ' + i, { 'X-Forwarded-For': String(i) }));
await bounded.handler(request('Запрос 0', { 'X-Forwarded-For': 'new' })); assert.equal(bounded.calls.length, 102);
console.log('PASS: private server key, fixed upstream, validation/method/origin, field whitelist, safe errors, cache expiry/bounds and rate limit.');
