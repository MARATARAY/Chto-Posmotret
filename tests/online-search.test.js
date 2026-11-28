'use strict';
const assert = require('node:assert/strict');
const { init, normalize } = require('../online-search.js');
const row = (id = 1, extra = {}) => ({ id, name: `Название ${id}`, year: 2020, type: 'movie', movieLength: 120, rating: {kp:8.7,imdb:8.8}, ...extra });
function boot(settings={}) {
  let clock = Date.UTC(2026, 10, 27), sequence = 0;
  class Element {
    constructor(id) { this.id=id;this.value='';this.hidden=true;this.attrs={};this.children=[];this.events={};this.textContent=''; }
    setAttribute(k,v) { this.attrs[k]=v; }
    removeAttribute(k) { delete this.attrs[k]; }
    addEventListener(k,f) { (this.events[k] ||= []).push(f); }
    dispatchEvent(event) { for(const fn of this.events[event.type] || []) fn(event); }
    emit(type,props={}) { const event={type,preventDefault(){this.prevented=true;},...props};this.dispatchEvent(event);return event; }
    append(item) { this.children.push(item); }
    replaceChildren() { this.children=[]; }
    focus() { document.activeElement=this; }
    scrollIntoView() { this.scrolled=true; }
    click() { this.emit('click'); }
  }
  const ids=Object.fromEntries(['title','title-form','title-suggestions','title-lookup-status','title-source','kp-rating','imdb-rating','category','year','duration','duration-unit-select','comment','personal-rating'].map(id=>[id,new Element(id)]));
  const timers=new Map(),calls=[];
  const document={activeElement:null,querySelector(selector){return ids[selector.slice(1)];},createElement(){return new Element('');}};
  const api=init({document,protocol:settings.protocol || 'https:',AbortController,Event:class{constructor(type){this.type=type;}},now:()=>clock,
    setTimeout(fn,delay){const id=++sequence;timers.set(id,{fn,at:clock+delay});return id;},clearTimeout(id){timers.delete(id);},
    fetch(url,options){return new Promise((resolve,reject)=>calls.push({url,options,resolve,reject}));}});
  async function flush(){for(let i=0;i<15;i++)await Promise.resolve();}
  return {ids,calls,api,document,flush,
    input(value){ids.title.value=value;ids.title.emit('input');},
    select(i=0){ids['title-suggestions'].children[i].emit('click');},
    async advance(ms){clock+=ms;for(const [id,timer] of [...timers])if(timer.at<=clock){timers.delete(id);timer.fn();}await flush();},
    async answer(i,data,{status=200,retry=null}={}){calls[i].resolve({ok:status>=200&&status<300,status,headers:{get:()=>retry},json:async()=>Array.isArray(data)?{docs:data}:data});await flush();},
    async reject(i){calls[i].reject(Error('offline'));await flush();},
    reset(){ids['title-form'].emit('reset');for(const field of ['title','year','duration'])ids[field].value='';}
  };
}
async function run(){
  assert.equal(normalize(row()).year,'2020');
  assert.equal(normalize(row()).kpRating,8.7);
  for(const type of ['cartoon','animated-series']) assert.equal(normalize(row(1,{type,isSeries:true})).category,'Мультфильм');
  for(const type of ['tv-series','mini-series']) assert.equal(normalize(row(1,{type})).category,'Сериал');
  assert.equal(normalize(row(1,{isSeries:true})).category,'Сериал');
  assert.equal(normalize(row(1,{type:'unknown'})).category,'Фильм');
  assert.equal(normalize(row(1,{name:' ',alternativeName:' Original '})).title,'Original');
  for(const year of [null,0,999,10000,'2024',2024.5]) assert.equal(normalize(row(1,{year})).year,'');
  for(const item of [null,row(1,{id:'1'}),row(0),row(-1),row(1,{name:' ',alternativeName:null}),row(1,{name:'x'.repeat(161)})])assert.equal(normalize(item),null);
  const animated=normalize(row(1,{type:'animated-series',movieLength:null,seasonsInfo:[{number:0},{number:1},{number:2},{number:2},null]}));
  assert.equal(animated.duration,'2');assert.equal(animated.durationUnit,'seasons');assert.equal(animated.durationDefault,false);
  const serial=normalize(row(1,{type:'tv-series',movieLength:50,seasonsInfo:[{number:1}]}));assert.equal(serial.duration,'50');assert.equal(serial.durationUnit,'minutes');
  const fallback=normalize(row(1,{type:'mini-series',movieLength:0}));assert.equal(fallback.duration,'1');assert.equal(fallback.durationDefault,true);
  for(const movieLength of [null,0,-1,10000,2.5,'120']) assert.equal(normalize(row(1,{movieLength})).duration,'');
  for(const value of [null,0,-1,11,'8.4',NaN,Infinity,undefined]) {const n=normalize(row(1,{rating:{kp:value,imdb:value}}));assert.equal(n.kpRating,null);assert.equal(n.imdbRating,null);}
  const t=boot();
  for(const query of ['', '  ', 'Sh','x'.repeat(161)]){t.input(query);await t.advance(400);}assert.equal(t.calls.length,0);
  t.input('  Матрица & +  ');await t.advance(399);assert.equal(t.calls.length,0);await t.advance(1);assert.equal(t.calls.length,1);
  const url=new URL(t.calls[0].url,'https://catalog.example');assert.equal(url.origin,'https://catalog.example');assert.equal(url.pathname,'/api/movie-search');
  assert.equal(url.searchParams.get('query'),'Матрица & +');assert.equal(url.searchParams.size,1);assert.equal(t.calls[0].options.headers,undefined);
  assert.equal(t.calls[0].options.method,'GET');assert.equal(t.ids.title.attrs['aria-busy'],'true');
  t.input('Шерлок');await t.advance(400);assert.equal(t.calls[0].options.signal.aborted,true);
  await t.answer(0,[row(99)]);assert.equal(t.ids['title-suggestions'].children.length,0);
  await t.answer(1,[null,row(99,{name:null}),row(1),row(1),row(2),row(3),row(4),row(5),row(6)]);
  assert.equal(t.ids['title-suggestions'].children.length,5);
  const first=t.ids['title-suggestions'].children[0];assert.match(first.children[0].textContent,/2020.*Фильм/);assert.equal(first.children[1].children[0].textContent,'КП: 8.7');assert.equal(first.children[1].children[1].textContent,'IMDb: 8.8');
  assert.equal(t.ids.title.emit('keydown',{key:'Enter'}).prevented,true);assert.deepEqual(t.api.getMetadata(),{});
  t.ids.comment.value='Моя заметка';t.ids['personal-rating'].value='9.5';
  t.ids.title.emit('keydown',{key:'ArrowUp'});assert.equal(t.ids.title.attrs['aria-activedescendant'],'title-option-4');
  t.ids.title.emit('keydown',{key:'ArrowDown'});t.ids.title.emit('keydown',{key:'Enter'});
  assert.equal(t.ids.title.value,'Название 1');assert.equal(t.ids.year.value,'2020');assert.equal(t.ids.duration.value,'120');assert.equal(t.ids['duration-unit-select'].value,'minutes');
  assert.equal(t.ids.comment.value,'Моя заметка');assert.equal(t.ids['personal-rating'].value,'9.5');assert.equal(t.document.activeElement,t.ids.title);
  assert.deepEqual(t.api.getMetadata(),{ratingProvider:'poiskkino',poiskkinoId:1,kpRating:8.7,imdbRating:8.8});assert.equal(t.ids['title-source'].href,'https://poiskkino.dev');assert.equal(t.ids['kp-rating'].value,'8.7');assert.equal(t.ids['imdb-rating'].value,'8.8');
  t.ids.year.value='2021';t.ids.year.emit('change');t.input('Другое название');assert.equal(t.ids.year.value,'2021');assert.equal(t.ids.category.value,'');assert.equal(t.ids.duration.value,'');assert.deepEqual(t.api.getMetadata(),{});assert.equal(t.ids['kp-rating'].value,'');assert.equal(t.ids['imdb-rating'].value,'');
  await t.advance(400);t.ids.title.emit('keydown',{key:'Escape'});await t.answer(2,[row(8)]);assert.equal(t.ids['title-suggestions'].hidden,true);
  t.input('Шерлок');await t.advance(400);assert.equal(t.calls.length,3);assert.equal(t.ids['title-suggestions'].children.length,5);t.ids.title.emit('keydown',{key:'Tab'});assert.equal(t.ids['title-suggestions'].hidden,true);
  t.input('Шерлок');await t.advance(300001);assert.equal(t.calls.length,4);t.reset();assert.equal(t.ids['kp-rating'].value,'');assert.equal(t.ids['imdb-rating'].value,'');await t.answer(3,[row(8)]);assert.equal(t.ids.title.value,'');assert.deepEqual(t.api.getMetadata(),{});
  t.ids.title.emit('compositionstart');t.input('Шерлок');await t.advance(400);assert.equal(t.calls.length,4);t.ids.title.emit('compositionend');await t.advance(400);assert.equal(t.calls.length,5);
  t.ids.title.emit('blur');await t.answer(4,[row(9)]);assert.equal(t.ids['title-suggestions'].hidden,true);
  const empty=boot();empty.input('Неизвестно');await empty.advance(400);await empty.answer(0,[]);assert.match(empty.ids['title-lookup-status'].textContent,/Ничего не найдено/);
  for(const [data,opts,pattern] of [[{}, {}, /Поиск недоступен/],[{error:'bad',docs:[]},{},/Поиск недоступен/],[{}, {status:401}, /недоступен/],[{}, {status:403}, /ограничен/],[{}, {status:500}, /Поиск недоступен/]]) {empty.input('Ошибка '+empty.calls.length);await empty.advance(400);await empty.answer(empty.calls.length-1,data,opts);assert.match(empty.ids['title-lookup-status'].textContent,pattern);}
  empty.input('Нет сети');await empty.advance(400);await empty.reject(empty.calls.length-1);assert.match(empty.ids['title-lookup-status'].textContent,/Поиск недоступен/);
  empty.input('Таймаут');await empty.advance(400);await empty.advance(8000);assert.equal(empty.calls.at(-1).options.signal.aborted,true);assert.match(empty.ids['title-lookup-status'].textContent,/Поиск недоступен/);await empty.answer(empty.calls.length-1,[row()]);assert.equal(empty.ids['title-suggestions'].hidden,true);
  const quota=boot();quota.input('Лимит');await quota.advance(400);await quota.answer(0,{}, {status:429,retry:'20'});assert.match(quota.ids['title-lookup-status'].textContent,/Лимит/);quota.input('Другое');await quota.advance(400);assert.equal(quota.calls.length,1);await quota.advance(20000);quota.input('Другое');await quota.advance(400);assert.equal(quota.calls.length,2);
  await quota.answer(1,{}, {status:429});quota.input('Снова');await quota.advance(9999);assert.equal(quota.calls.length,2);await quota.advance(1);quota.input('Снова');await quota.advance(400);assert.equal(quota.calls.length,3);
  const replace=boot();replace.input('Первое');await replace.advance(400);await replace.answer(0,[row()]);replace.select();replace.input('Второе');await replace.advance(400);await replace.answer(1,[row(2,{rating:{kp:0,imdb:null},year:null,type:'animated-series',movieLength:null})]);replace.select();assert.deepEqual(replace.api.getMetadata(),{ratingProvider:'poiskkino',poiskkinoId:2,kpRating:null,imdbRating:null});assert.equal(replace.ids['kp-rating'].value,'');assert.equal(replace.ids['imdb-rating'].value,'');assert.equal(replace.ids.year.value,'');assert.match(replace.ids['title-lookup-status'].textContent,/по умолчанию/);
  replace.input('Текст');await replace.advance(400);await replace.answer(2,[row(3,{name:'<img src=x onerror=alert(1)>',url:'javascript:alert(1)'})]);assert.ok(replace.ids['title-suggestions'].children[0].children[0].textContent.includes('<img'));replace.select();assert.equal(replace.ids['title-source'].href,'https://poiskkino.dev');
  const bounded=boot();for(let i=0;i<21;i++){bounded.input('Запрос '+i);await bounded.advance(400);await bounded.answer(i,[row(i+1)]);}bounded.input('Запрос 0');await bounded.advance(400);assert.equal(bounded.calls.length,22);
  const local=boot({protocol:'file:'});local.input('Матрица');await local.advance(400);assert.equal(local.calls.length,0);assert.match(local.ids['title-lookup-status'].textContent,/опубликованном сайте/);
  const unofficial=boot();unofficial.input('матрица');await unofficial.advance(400);await unofficial.answer(0,[row(301,{provider:'kinopoisk-unofficial',name:'Матрица',year:1999,rating:{kp:8.74,imdb:8}})]);unofficial.select();assert.equal(unofficial.ids.title.value,'Матрица');assert.equal(unofficial.ids['kp-rating'].value,'8.7');assert.equal(unofficial.ids['imdb-rating'].value,'8.0');assert.equal(unofficial.ids['title-source'].href,'https://kinopoiskapiunofficial.tech');assert.equal(unofficial.ids['title-source'].textContent,'Данные Kinopoisk Unofficial');assert.deepEqual(unofficial.api.getMetadata(),{ratingProvider:'kinopoisk-unofficial',kinopoiskId:301,kpRating:8.74,imdbRating:8});
  unofficial.input('original');await unofficial.advance(400);await unofficial.answer(1,[row(301,{provider:'kinopoisk-unofficial',name:' ',alternativeName:'Original Film',rating:{kp:0,imdb:null}})]);assert.match(unofficial.ids['title-suggestions'].children[0].children[0].textContent,/Оригинальное название/);unofficial.select();assert.equal(unofficial.ids.title.value,'Original Film');assert.equal(unofficial.ids['kp-rating'].value,'');assert.equal(unofficial.ids['imdb-rating'].value,'');assert.match(unofficial.ids['title-lookup-status'].textContent,/Оригинальное название/);
  unofficial.input('Без IMDb');await unofficial.advance(400);await unofficial.answer(2,[row(303,{provider:'kinopoisk-unofficial',rating:{kp:8.5,imdb:null}})]);unofficial.select();assert.equal(unofficial.ids['kp-rating'].value,'8.5');assert.equal(unofficial.ids['imdb-rating'].value,'');
  assert.equal(normalize(row(1,{provider:'evil'})),null);
  const identities=boot();identities.input('Одинаковые');await identities.advance(400);await identities.answer(0,[row(1),row(1),row(1,{provider:'kinopoisk-unofficial'})]);assert.equal(identities.ids['title-suggestions'].children.length,2);
  const {ratingText}=require('../online-search.js');assert.equal(ratingText(7.86),'7.9');assert.equal(ratingText(8),'8.0');assert.equal(ratingText(null),'—');
  console.log('PASS: PoiskKino same-origin endpoint/debounce, mapping/ratings/duration, keyboard/IME, stale replies/reset, errors/timeout/quota/cache, file fallback and safe text.');
}
module.exports=run();
