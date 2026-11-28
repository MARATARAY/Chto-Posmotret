'use strict';
const assert = require('node:assert/strict');
const { init, normalize } = require('../online-search.js');
const row = (id = 1, extra = {}) => ({ id: `Q${id}`, label: `Название ${id}`, description: 'фильм 2020 года', ...extra });
function boot() {
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
  }
  const ids=Object.fromEntries(['title','title-form','title-suggestions','title-lookup-status','title-source','catalog-rating-label','category','year','catalog-rating','duration','comment','personal-rating'].map(id=>[id,new Element(id)]));
  const timers=new Map(),calls=[];
  const document={activeElement:null,querySelector(selector){return ids[selector.slice(1)];},createElement(){return new Element('');}};
  const api=init({document,AbortController,Event:class{constructor(type){this.type=type;}},now:()=>clock,
    setTimeout(fn,delay){const id=++sequence;timers.set(id,{fn,at:clock+delay});return id;},clearTimeout(id){timers.delete(id);},
    fetch(url,options){return new Promise((resolve,reject)=>calls.push({url,options,resolve,reject}));}});
  async function flush(){for(let i=0;i<15;i++)await Promise.resolve();}
  return {ids,calls,api,document,flush,
    input(value){ids.title.value=value;ids.title.emit('input');},
    select(i=0){ids['title-suggestions'].children[i].emit('click');},
    async advance(ms){clock+=ms;for(const [id,timer] of [...timers])if(timer.at<=clock){timers.delete(id);timer.fn();}await flush();},
    async answer(i,data,{status=200,retry=null}={}){calls[i].resolve({ok:status>=200&&status<300,status,headers:{get:()=>retry},json:async()=>Array.isArray(data)?{search:data}:data});await flush();},
    async reject(i){calls[i].reject(Error('offline'));await flush();},
    reset(){ids['title-form'].emit('reset');for(const field of ['title','year','catalog-rating','duration'])ids[field].value='';}
  };
}
async function run(){
  assert.equal(normalize(row(),2026).year,'2020');
  assert.equal(normalize(row(),2026).rating,'0.0');
  for(const description of ['мультфильм 1999 года','анимационный фильм','мультсериал','аниме сериал'])assert.equal(normalize(row(1,{description}),2026).category,'Мультфильм');
  for(const description of ['телесериал 2010 года','сериал','мини-сериал']){const show=normalize(row(1,{description}),2026);assert.equal(show.category,'Сериал');assert.equal(show.duration,'1');}
  for(const description of ['фильм','кинофильм','комедия','триллер','боевик','фантастика','драма']){const show=normalize(row(1,{description}),2026);assert.equal(show.category,'Фильм');assert.equal(show.duration,'120');}
  for(const description of ['роман 1999 года','видеоигра, фантастика','актёр фильмов','книга, драма','российский писатель','компьютерная игра','человек',''])assert.equal(normalize(row(1,{description}),2026),null);
  for(const description of ['фильм без года','фильм 1899 года','фильм 12020 года'])assert.equal(normalize(row(1,{description}),2026).year,'2026');
  assert.equal(normalize(row(1,{description:'ФИЛЬМ 1999 года'}),2026).year,'1999');
  for(const item of [null,{id:'Q0',label:'x',description:'фильм'},row(1,{label:' '}),row(1,{id:'javascript:alert(1)'}),row(1,{description:null})])assert.equal(normalize(item,2026),null);
  const t=boot();
  for(const query of ['', '  ', 'Sh','x'.repeat(161)]){t.input(query);await t.advance(500);}assert.equal(t.calls.length,0);
  t.input('  Интерстеллар  ');await t.advance(499);assert.equal(t.calls.length,0);await t.advance(1);assert.equal(t.calls.length,1);
  const url=new URL(t.calls[0].url);assert.equal(url.origin,'https://www.wikidata.org');assert.equal(url.pathname,'/w/api.php');
  for(const [key,value] of Object.entries({action:'wbsearchentities',language:'ru',uselang:'ru',origin:'*',format:'json',search:'Интерстеллар'}))assert.equal(url.searchParams.get(key),value);
  assert.equal(t.calls[0].options.method,'GET');assert.equal(t.ids.title.attrs['aria-busy'],'true');
  t.input('Шерлок');await t.advance(500);assert.equal(t.calls[0].options.signal.aborted,true);
  await t.answer(0,[row(99)]);assert.equal(t.ids['title-suggestions'].children.length,0);
  await t.answer(1,[null,row(99,{description:'роман'}),row(1),row(1),row(2),row(3),row(4),row(5),row(6)]);
  assert.equal(t.ids['title-suggestions'].children.length,5);assert.match(t.ids['title-suggestions'].children[0].textContent,/2020.*0.0.*Фильм/);
  assert.equal(t.ids.title.emit('keydown',{key:'Enter'}).prevented,true);assert.deepEqual(t.api.getMetadata(),{});
  t.ids.comment.value='Моя заметка';t.ids['personal-rating'].value='9.5';
  t.ids.title.emit('keydown',{key:'ArrowUp'});assert.equal(t.ids.title.attrs['aria-activedescendant'],'title-option-4');
  t.ids.title.emit('keydown',{key:'ArrowDown'});assert.equal(t.ids.title.attrs['aria-activedescendant'],'title-option-0');t.ids.title.emit('keydown',{key:'Enter'});
  assert.equal(t.ids.title.value,'Название 1');assert.equal(t.ids.year.value,'2020');assert.equal(t.ids.duration.value,'120');assert.equal(t.ids['catalog-rating'].value,'0.0');
  assert.equal(t.ids.comment.value,'Моя заметка');assert.equal(t.ids['personal-rating'].value,'9.5');assert.equal(t.document.activeElement,t.ids.title);
  assert.deepEqual(t.api.getMetadata(),{wikidataId:'Q1'});assert.equal(t.ids['title-source'].href,'https://www.wikidata.org/wiki/Q1');assert.match(t.ids['title-lookup-status'].textContent,/по умолчанию/);
  assert.equal(t.calls.length,2);assert.equal(t.ids['title-suggestions'].hidden,true);
  t.ids['catalog-rating'].value='7.5';t.ids['catalog-rating'].emit('input');assert.deepEqual(t.api.getMetadata(),{wikidataId:'Q1'});assert.equal(t.ids['catalog-rating-label'].textContent,'Рейтинг');
  t.ids.year.value='2021';t.ids.year.emit('change');t.input('Другое название');assert.equal(t.ids.year.value,'2021');assert.equal(t.ids['catalog-rating'].value,'7.5');assert.equal(t.ids.category.value,'');assert.equal(t.ids.duration.value,'');assert.deepEqual(t.api.getMetadata(),{});
  await t.advance(500);t.ids.title.emit('keydown',{key:'Escape'});await t.answer(2,[row(8)]);assert.equal(t.ids['title-suggestions'].hidden,true);
  t.input('Шерлок');await t.advance(500);assert.equal(t.calls.length,3);assert.equal(t.ids['title-suggestions'].children.length,5);t.ids.title.emit('keydown',{key:'Tab'});assert.equal(t.ids['title-suggestions'].hidden,true);
  t.input('Шерлок');await t.advance(300001);assert.equal(t.calls.length,4);t.reset();await t.answer(3,[row(8)]);assert.equal(t.ids.title.value,'');assert.deepEqual(t.api.getMetadata(),{});
  t.ids.title.emit('compositionstart');t.input('Шерлок');await t.advance(500);assert.equal(t.calls.length,4);t.ids.title.emit('compositionend');await t.advance(500);assert.equal(t.calls.length,5);
  t.ids.title.emit('blur');await t.answer(4,[row(9)]);assert.equal(t.ids['title-suggestions'].hidden,true);
  const empty=boot();empty.input('Неизвестно');await empty.advance(500);await empty.answer(0,[]);assert.match(empty.ids['title-lookup-status'].textContent,/Ничего не найдено/);
  empty.input('Ошибка');await empty.advance(500);await empty.answer(1,{});assert.match(empty.ids['title-lookup-status'].textContent,/Поиск недоступен/);
  empty.input('Ошибка API');await empty.advance(500);await empty.answer(2,{error:{code:'badvalue'},search:[]});assert.match(empty.ids['title-lookup-status'].textContent,/Поиск недоступен/);
  empty.input('Нет сети');await empty.advance(500);await empty.reject(3);assert.match(empty.ids['title-lookup-status'].textContent,/Поиск недоступен/);
  empty.input('Сбой сервера');await empty.advance(500);await empty.answer(4,{}, {status:500});assert.match(empty.ids['title-lookup-status'].textContent,/Поиск недоступен/);
  empty.input('Таймаут');await empty.advance(500);await empty.advance(8000);assert.equal(empty.calls[5].options.signal.aborted,true);assert.match(empty.ids['title-lookup-status'].textContent,/Поиск недоступен/);await empty.answer(5,[row()]);assert.equal(empty.ids['title-suggestions'].hidden,true);
  const quota=boot();quota.input('Лимит');await quota.advance(500);await quota.answer(0,{}, {status:429,retry:'20'});assert.match(quota.ids['title-lookup-status'].textContent,/Слишком много/);
  quota.input('Другое');await quota.advance(500);assert.equal(quota.calls.length,1);await quota.advance(20000);quota.input('Другое');await quota.advance(500);assert.equal(quota.calls.length,2);
  await quota.answer(1,{}, {status:429});quota.input('Снова');await quota.advance(9999);assert.equal(quota.calls.length,2);await quota.advance(1);quota.input('Снова');await quota.advance(500);assert.equal(quota.calls.length,3);
  const fallback=boot();fallback.input('Нет года');await fallback.advance(500);await fallback.answer(0,[row(1,{description:'мультфильм'})]);fallback.select();assert.equal(fallback.ids.year.value,'2026');assert.equal(fallback.ids.duration.value,'120');assert.equal(fallback.ids['catalog-rating'].value,'0.0');assert.match(fallback.ids['title-lookup-status'].textContent,/год — текущий/);
  fallback.input('Сериал');await fallback.advance(500);await fallback.answer(1,[row(2,{description:'телесериал 2015 года'})]);fallback.select();assert.equal(fallback.ids.duration.value,'1');assert.equal(fallback.ids.category.value,'Сериал');
  fallback.input('Текст');await fallback.advance(500);await fallback.answer(2,[row(3,{label:'<img src=x onerror=alert(1)>',url:'javascript:alert(1)'})]);assert.ok(fallback.ids['title-suggestions'].children[0].textContent.includes('<img'));fallback.select();assert.equal(fallback.ids['title-source'].href,'https://www.wikidata.org/wiki/Q3');
  const bounded=boot();for(let i=0;i<21;i++){bounded.input('Запрос '+i);await bounded.advance(500);await bounded.answer(i,[row(i+1)]);}bounded.input('Запрос 0');await bounded.advance(500);assert.equal(bounded.calls.length,22);
  console.log('PASS: Wikidata Russian search/categories/year/defaults, safe URLs, API errors, cache, stale responses, keyboard, IME, manual edits and reset.');
}
module.exports=run();
