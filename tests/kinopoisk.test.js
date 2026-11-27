'use strict';
const assert = require('node:assert/strict');
const handler = require('../api/kinopoisk.js');
const { init } = require('../kinopoisk-autofill.js');
const film = { id: 42, name: 'Начало', type: 'movie', year: 2010, rating: { kp: 8.76 }, movieLength: 148 };
function boot(protocol = 'https:') {
  class Element {
    constructor(id) { this.id = id; this.value = ''; this.hidden = true; this.attrs = {}; this.children = []; this.events = {}; }
    setAttribute(k,v) { this.attrs[k] = v; }
    removeAttribute(k) { delete this.attrs[k]; }
    addEventListener(k,f) { (this.events[k] ||= []).push(f); }
    dispatchEvent(event) { for (const fn of this.events[event.type] || []) fn(event); }
    emit(type, props = {}) { const event = { type, preventDefault() { this.prevented = true; }, ...props }; this.dispatchEvent(event); return event; }
    append(item) { this.children.push(item); }
    replaceChildren() { this.children = []; }
  }
  const ids = Object.fromEntries(['title', 'title-form', 'title-suggestions', 'title-lookup-status', 'title-source', 'category', 'year', 'catalog-rating', 'duration', 'comment', 'personal-rating'].map(id => [id, new Element(id)]));
  const timers = new Map(), calls = []; let sequence = 0;
  init({ document: { querySelector(selector) { return ids[selector.slice(1)]; }, createElement() { return new Element(''); } },
    location: { protocol }, AbortController, Event: class { constructor(type) { this.type = type; } },
    setTimeout(fn, ms) { assert.ok([500,10000].includes(ms)); timers.set(++sequence,{fn,ms}); return sequence; }, clearTimeout(id) { timers.delete(id); },
    fetch(url, options) { return new Promise((resolve,reject) => calls.push({ url, options, resolve, reject })); } });
  return { ids, calls, input(text) { ids.title.value = text; ids.title.emit('input'); },
    async tick() { const pending = [...timers].filter(([,timer])=>timer.ms===500); for (const [id,timer] of pending) { timers.delete(id); timer.fn(); } await Promise.resolve(); },
    async answer(index, data, ok = true) { calls[index].resolve({ ok, json: async () => data }); for(let i=0;i<6;i++) await Promise.resolve(); } };
}
async function run() {
  const originalFetch = global.fetch, originalKey = process.env.POISKKINO_API_KEY;
  const respond = async query => {
    const res = { headers: {}, setHeader(k,v) { this.headers[k] = v; }, status(value) { this.code = value; return this; }, json(body) { this.body = body; return this; } };
    await handler({ method: 'GET', query, headers: { 'x-forwarded-for': 'test' } },res); return res;
  };
  try {
    delete process.env.POISKKINO_API_KEY;
    assert.equal((await respond({ q: 'Начало' })).code,503);
    process.env.POISKKINO_API_KEY = 'test-key';
    let urls = [], response = { docs: [film] };
    global.fetch = async (url, options) => { urls.push(url); assert.equal(options.headers['X-API-KEY'],'test-key'); assert.ok(!url.includes('test-key')); return { ok:true,json:async()=>response }; };
    for (const query of [{q:'ab'}, {q:['abc']}, {q:'a'.repeat(161)}, {id:'https://evil.test'}, {id:'1',q:'test'}]) assert.equal((await respond(query)).code,400);
    let result = await respond({q:'Начало'}); assert.equal(result.code,200); assert.equal(result.body.movies[0].rating,'8.8'); assert.ok(urls[0].startsWith('https://api.poiskkino.dev/v1.5/movie/search?'));
    await respond({q:'Начало'}); assert.equal(urls.length,1);
    response = film; result = await respond({id:'42'}); assert.equal(result.body.movie.duration,'148');
    response = { id: 99 }; assert.equal((await respond({id:'43'})).code,502);
    response = {}; assert.equal((await respond({q:'invalid response'})).code,502);
    global.fetch = async()=>({ok:false,status:401});assert.equal((await respond({q:'unauthorized'})).code,502);
    global.fetch = async()=>({ok:false,status:429});assert.equal((await respond({q:'provider quota'})).code,429);
    global.fetch = async()=>{throw Error('secret response');};assert.deepEqual((await respond({q:'timeout'})).body,{error:'unavailable'});
    const normalize = handler.normalize;
    assert.equal(normalize({...film,rating:{imdb:9}}).rating,'');
    assert.equal(normalize({...film,rating:{kp:0},votes:{kp:0}}).rating,'');
    assert.equal(normalize({...film,type:'animated-series',seasonsInfo:[{number:0},{number:1},{number:2},{number:2}]}).duration,'2');
    assert.equal(normalize({...film,type:'tv-series'}).duration,'');
    assert.equal(normalize({...film,type:'cartoon'}).category,'Мультфильм');
    assert.equal(normalize({...film,type:'unknown'}).category,'');
    assert.equal(normalize({...film,year:null,movieLength:-1}).year,'');
    assert.equal(normalize({...film,id:'evil'}),null);
    let limited;
    for(let i=0;i<20;i++) limited=await respond({q:`limit-${i}`});
    assert.equal(limited.code,429); assert.equal(limited.headers['Retry-After'],'60');
  } finally { global.fetch=originalFetch; if(originalKey===undefined)delete process.env.POISKKINO_API_KEY;else process.env.POISKKINO_API_KEY=originalKey; }
  console.log('PASS: API validation, normalization, fixed upstream, cache, timeout/auth/quota/malformed errors, key isolation and rate limit.');

  const t = boot(); t.input('ab'); await t.tick(); assert.equal(t.calls.length,0);
  t.input('Начало'); t.input('Шерлок'); await t.tick(); assert.equal(t.calls.length,1); assert.match(t.calls[0].url,/q=/);
  t.input('Рататуй'); await t.tick(); assert.equal(t.calls[0].options.signal.aborted,true);
  const normalized = handler.normalize(film);
  await t.answer(0,{movies:[normalized]}); assert.equal(t.ids['title-suggestions'].children.length,0);
  await t.answer(1,{movies:[normalized]}); assert.equal(t.ids.title.attrs['aria-expanded'],'true'); assert.equal(t.ids['title-suggestions'].children.length,1);
  assert.equal(t.ids.title.emit('keydown',{key:'ArrowDown'}).prevented,true);
  assert.equal(t.ids.title.attrs['aria-activedescendant'],'title-option-0');
  t.ids.comment.value='Мои впечатления';t.ids['personal-rating'].value='9.5';
  t.ids.title.emit('keydown',{key:'Enter'});assert.equal(t.calls.length,3);
  await t.answer(2,{movie:normalized}); assert.equal(t.ids.title.value,'Начало'); assert.equal(t.ids.year.value,'2010'); assert.equal(t.ids.duration.value,'148');
  assert.equal(t.ids.comment.value,'Мои впечатления');assert.equal(t.ids['personal-rating'].value,'9.5');assert.match(t.ids['title-source'].href,/\/film\/42\/$/);
  t.ids.year.value='2011';t.ids.year.emit('input');t.input('Другое название');assert.equal(t.ids.year.value,'2011');assert.equal(t.ids.duration.value,'');assert.equal(t.ids['title-source'].hidden,true);
  await t.tick();t.ids.title.emit('keydown',{key:'Escape'});await t.answer(3,{movies:[normalized]});assert.equal(t.ids['title-suggestions'].hidden,true);
  t.input('Начало');await t.tick();await t.answer(4,{movies:[normalized]});t.ids['title-suggestions'].children[0].emit('click');
  t.ids['title-form'].emit('reset');t.ids.title.value='';await t.answer(5,{movie:normalized});assert.equal(t.ids.title.value,'');assert.equal(t.ids['title-source'].hidden,true);
  t.input('Сбой API');await t.tick();await t.answer(6,{},false);assert.match(t.ids['title-lookup-status'].textContent,/вручную/);
  t.input('Пустой ответ');await t.tick();await t.answer(7,{movies:[]});assert.match(t.ids['title-lookup-status'].textContent,/Ничего не найдено/);
  t.ids.title.emit('compositionstart');t.input('Шерлок');await t.tick();assert.equal(t.calls.length,8);t.ids.title.emit('compositionend');await t.tick();assert.equal(t.calls.length,9);
  t.ids.title.emit('blur');await t.answer(8,{movies:[normalized]});assert.equal(t.ids['title-suggestions'].hidden,true);
  const local=boot('file:');local.input('Начало');await local.tick();assert.equal(local.calls.length,0);assert.match(local.ids['title-lookup-status'].textContent,/опубликованном/);
  const replacement=boot();replacement.input('Первый');await replacement.tick();await replacement.answer(0,{movies:[normalized]});replacement.ids['title-suggestions'].children[0].emit('click');await replacement.answer(1,{movie:normalized});
  replacement.input('Второй');await replacement.tick();await replacement.answer(2,{movies:[{...normalized,id:43}]});replacement.ids['title-suggestions'].children[0].emit('click');await replacement.answer(3,{movie:{...normalized,id:43,rating:'',duration:'',category:'Сериал'}});assert.equal(replacement.ids['catalog-rating'].value,'');assert.equal(replacement.ids.duration.value,'');assert.match(replacement.ids['title-source'].href,/series\/43/);
  console.log('PASS: debounce/minimum input, stale searches/details, reset/blur/Escape, IME, keyboard selection, manual edits, missing metadata, personal fields, failures and file mode.');
}
module.exports = run();
