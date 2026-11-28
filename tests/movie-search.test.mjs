import assert from 'node:assert/strict';
import { createSearchHandler } from '../api/movie-search.mjs';

const token = 'test-private-token';
const item = { id: 301, name: 'Матрица', year: 1999, type: 'movie', movieLength: 136,
  rating: { kp: 8.501, imdb: 8.7, filmCritics: 7.9 }, privateField: token };
const request = (query = 'Матрица', headers = {}, method = 'GET') => new Request(
  `https://catalog.example/api/movie-search?${new URLSearchParams({ query })}`, { method, headers });
function boot({ status = 200, body = { docs: [item] }, retry, fail, key = token, provider = 'poiskkino' } = {}) {
  const calls = [];
  let clock = 1000;
  const handler = createSearchHandler({ getProvider: () => typeof provider === 'function' ? provider() : provider, getKey: p => typeof key === 'function' ? key(p) : key, now: () => clock, fetcher: async (url, options) => {
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
for (const status of [401, 402, 403, 429, 500]) {
  const error = boot({ status, body: { message: token }, retry: '999999' });
  const result = await error.handler(request()); assert.equal(result.status, status === 500 ? 502 : status === 402 ? 429 : status);
  assert.ok(!(await result.text()).includes(token));
  if (status === 429 || status === 402) assert.equal(result.headers.get('Retry-After'), '3600');
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

const unofficialItem={kinopoiskId:301,nameRu:'Матрица',nameOriginal:'The Matrix',year:1999,type:'FILM',ratingKinopoisk:8.7,ratingImdb:8.8,privateField:token};
const unofficial=boot({provider:'kinopoisk-unofficial',body:{items:[unofficialItem]},key:p=>p==='kinopoisk-unofficial'?'unofficial-test-token':undefined});
const unofficialResponse=await unofficial.handler(request(' Матрица & + '));assert.equal(unofficialResponse.status,200);const unofficialData=await unofficialResponse.json();
const unofficialUrl=new URL(unofficial.calls[0].url);assert.equal(unofficialUrl.origin,'https://kinopoiskapiunofficial.tech');assert.equal(unofficialUrl.pathname,'/api/v2.2/films');assert.equal(unofficialUrl.searchParams.get('keyword'),'Матрица & +');assert.equal(unofficialUrl.searchParams.get('page'),'1');assert.equal(unofficialUrl.searchParams.has('query'),false);assert.equal(unofficial.calls[0].options.headers['X-API-KEY'],'unofficial-test-token');
assert.equal(unofficialData.docs[0].provider,'kinopoisk-unofficial');assert.equal(unofficialData.docs[0].id,301);assert.equal(unofficialData.docs[0].name,'Матрица');assert.equal(unofficialData.docs[0].alternativeName,'The Matrix');assert.equal(unofficialData.docs[0].rating.kp,8.7);assert.equal(unofficialData.docs[0].rating.imdb,8.8);assert.equal(unofficialData.docs[0].privateField,undefined);
const unknown=boot({provider:'unknown'});assert.equal((await unknown.handler(request())).status,503);assert.equal(unknown.calls.length,0);
const wrongArray=boot({provider:'kinopoisk-unofficial'});assert.equal((await wrongArray.handler(request())).status,502);
const denied=boot({provider:'kinopoisk-unofficial',status:401});assert.equal((await denied.handler(request())).status,401);assert.equal(denied.calls.length,1);assert.ok(denied.calls[0].url.startsWith('https://kinopoiskapiunofficial.tech/'));
let activeProvider='poiskkino';const separate=boot({provider:()=>activeProvider,body:{docs:[item],items:[unofficialItem]}});await separate.handler(request());activeProvider='kinopoisk-unofficial';assert.equal((await separate.handler(request())).status,200);assert.equal(separate.calls.length,2);await separate.handler(request());assert.equal(separate.calls.length,2);activeProvider='poiskkino';await separate.handler(request());assert.equal(separate.calls.length,2);
const {createRequire}=await import('node:module');const require=createRequire(import.meta.url);const {normalize}=require('../online-search.js');const normalized=normalize(unofficialData.docs[0]);assert.equal(normalized.title,'Матрица');assert.equal(normalized.kpRating,8.7);assert.equal(normalized.imdbRating,8.8);assert.equal(normalized.year,'1999');
for(const [type,genres,category] of [['TV_SERIES',[],'Сериал'],['MINI_SERIES',[],'Сериал'],['FILM',[{genre:'мультфильм'}],'Мультфильм'],['TV_SERIES',[{genre:'АНИМЕ'}],'Мультфильм'],['FILM',[{genre:42},null],'Фильм']]){const mapped=await boot({provider:'kinopoisk-unofficial',body:{items:[{...unofficialItem,type,genres}]}}).handler(request());assert.equal(normalize((await mapped.json()).docs[0]).category,category);}
console.log('PASS: Unofficial items adapter, exact endpoint and separate key, 402 quota, provider validation/no fallback, isolated caches and frontend contract.');

const {safePosterURL,adaptResponse}=require('../movie-api.js');
for(const url of [null,'','relative.jpg','http://images.example/x','javascript:alert(1)','data:image/png;base64,abc','blob:https://example/x','file:///tmp/x','https://user:secret@images.example/x'])assert.equal(safePosterURL(url),null);
assert.equal(safePosterURL(' https://images.example/a.jpg '),'https://images.example/a.jpg');
for(const [provider,body,expected] of [['poiskkino',{docs:[{...item,poster:{previewUrl:'https://images.example/preview.jpg',url:'https://images.example/full.jpg'}}]},'https://images.example/preview.jpg'],['poiskkino',{docs:[{...item,poster:{previewUrl:'javascript:bad',url:'https://images.example/full.jpg'}}]},'https://images.example/full.jpg'],['kinopoisk-unofficial',{items:[{...unofficialItem,posterUrlPreview:'https://images.example/kp-small.jpg',posterUrl:'https://images.example/kp.jpg'}]},'https://images.example/kp-small.jpg'],['kinopoisk-unofficial',{items:[{...unofficialItem,posterUrlPreview:null,posterUrl:'https://images.example/kp.jpg'}]},'https://images.example/kp.jpg']]){assert.equal(adaptResponse(body,provider).docs[0].posterUrl,expected);const api=boot({provider,body});assert.equal((await (await api.handler(request())).json()).docs[0].posterUrl,expected);assert.equal(api.calls.length,1);}
assert.equal(adaptResponse({docs:[item]},'poiskkino').docs[0].posterUrl,null);
console.log('PASS: both poster schemas, preview priority/full fallback, safe HTTPS URLs and preservation through the existing API response.');
