'use strict';
const assert = require('node:assert/strict');
const { init, normalize } = require('../online-search.js');
const row = (id = 1, extra = {}) => ({ score: 100, show: { id, name: `Series ${id}`, premiered: '2020-01-15', rating: { average: 8.36 }, type: 'Scripted', ...extra } });
function boot() {
  let clock = 0, sequence = 0;
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
    async answer(i,data,{status=200,retry=null}={}){calls[i].resolve({ok:status>=200&&status<300,status,headers:{get:()=>retry},json:async()=>data});await flush();},
    async reject(i){calls[i].reject(Error('offline'));await flush();},
    reset(){ids['title-form'].emit('reset');for(const field of ['title','year','catalog-rating','duration'])ids[field].value='';}
  };
}
async function run(){
  assert.equal(normalize(row().show).rating,'8.4');
  for(const value of [null,undefined,-1,11,'8.3',NaN])assert.equal(normalize({...row().show,rating:{average:value}}).rating,'');
  for(const [value,expected] of [[0,'0.0'],[10,'10.0']])assert.equal(normalize({...row().show,rating:{average:value}}).rating,expected);
  for(const date of [null,'2023-02-29','2020-02-30','999-01-01','2020-00-01','bad'])assert.equal(normalize({...row().show,premiered:date}).year,'');
  assert.equal(normalize({...row().show,premiered:'2024-02-29'}).year,'2024');
  assert.equal(normalize({...row().show,type:'Animation'}).category,'Сериал');
  for(const show of [null,{id:0,name:'bad'},{id:1,name:' '},{id:'1',name:'bad'},{id:1,name:'x'.repeat(161)}])assert.equal(normalize(show),null);
  const t=boot();
  for(const query of ['', '  ', 'Sh','x'.repeat(161)]){t.input(query);await t.advance(500);}assert.equal(t.calls.length,0);
  t.input('  Sherlock  ');await t.advance(499);assert.equal(t.calls.length,0);await t.advance(1);assert.equal(t.calls.length,1);
  assert.equal(t.calls[0].url,'https://api.tvmaze.com/search/shows?q=Sherlock');assert.equal(t.calls[0].options.method,'GET');
  assert.equal(t.ids.title.attrs['aria-busy'],'true');assert.equal(t.ids['title-lookup-status'].textContent,'Ищем…');
  t.input('Girls');await t.advance(500);assert.equal(t.calls[0].options.signal.aborted,true);
  await t.answer(0,[row(99)]);assert.equal(t.ids['title-suggestions'].children.length,0);
  await t.answer(1,[{show:null},row(1),row(1),row(2),row(3),row(4),row(5),row(6)]);
  assert.equal(t.ids['title-suggestions'].children.length,5);assert.equal(t.ids.title.attrs['aria-expanded'],'true');
  assert.match(t.ids['title-suggestions'].children[0].textContent,/2020 · Рейтинг TVmaze 8.4 · Сериал/);
  assert.equal(t.ids.title.emit('keydown',{key:'Enter'}).prevented,true);assert.equal(t.api.getMetadata().tvmazeId,undefined);
  t.ids.comment.value='Моя заметка';t.ids['personal-rating'].value='9.5';t.ids.duration.value='120';
  t.ids.title.emit('keydown',{key:'ArrowUp'});assert.equal(t.ids.title.attrs['aria-activedescendant'],'title-option-4');
  t.ids.title.emit('keydown',{key:'ArrowDown'});assert.equal(t.ids.title.attrs['aria-activedescendant'],'title-option-0');
  t.ids.title.emit('keydown',{key:'Enter'});
  assert.equal(t.ids.title.value,'Series 1');assert.equal(t.ids.year.value,'2020');assert.equal(t.ids.duration.value,'');
  assert.equal(t.ids.comment.value,'Моя заметка');assert.equal(t.ids['personal-rating'].value,'9.5');assert.equal(t.document.activeElement,t.ids.title);
  assert.deepEqual(t.api.getMetadata(),{tvmazeId:1,ratingSource:'TVmaze'});assert.equal(t.ids['title-source'].href,'https://www.tvmaze.com/shows/1');
  assert.equal(t.calls.length,2);assert.equal(t.ids['title-suggestions'].hidden,true);
  t.ids['catalog-rating'].value='7.5';t.ids['catalog-rating'].emit('input');assert.deepEqual(t.api.getMetadata(),{tvmazeId:1});assert.equal(t.ids['catalog-rating-label'].textContent,'Рейтинг');
  t.ids.year.value='2021';t.ids.year.emit('change');t.input('Different title');
  assert.equal(t.ids.year.value,'2021');assert.equal(t.ids['catalog-rating'].value,'7.5');assert.equal(t.ids.category.value,'');assert.equal(t.ids['title-source'].hidden,true);assert.deepEqual(t.api.getMetadata(),{});
  await t.advance(500);t.ids.title.emit('keydown',{key:'Escape'});await t.answer(2,[row(8)]);assert.equal(t.ids['title-suggestions'].hidden,true);
  t.input('Girls');await t.advance(500);assert.equal(t.calls.length,3);assert.equal(t.ids['title-suggestions'].children.length,5);
  t.ids.title.emit('keydown',{key:'Tab'});assert.equal(t.ids['title-suggestions'].hidden,true);
  t.input('Girls');await t.advance(300001);assert.equal(t.calls.length,4);t.reset();await t.answer(3,[row(8)]);assert.equal(t.ids.title.value,'');assert.equal(t.ids['title-suggestions'].hidden,true);assert.deepEqual(t.api.getMetadata(),{});
  t.ids.title.emit('compositionstart');t.input('Sherlock');await t.advance(500);assert.equal(t.calls.length,4);t.ids.title.emit('compositionend');await t.advance(500);assert.equal(t.calls.length,5);
  t.ids.title.emit('blur');await t.answer(4,[row(9)]);assert.equal(t.ids['title-suggestions'].hidden,true);
  const empty=boot();empty.input('Missing');await empty.advance(500);await empty.answer(0,[]);assert.match(empty.ids['title-lookup-status'].textContent,/Ничего не найдено/);
  empty.input('Broken');await empty.advance(500);await empty.answer(1,{});assert.equal(empty.ids['title-lookup-status'].textContent,'Поиск недоступен. Заполните форму вручную');
  empty.input('Offline');await empty.advance(500);await empty.reject(2);assert.match(empty.ids['title-lookup-status'].textContent,/Поиск недоступен/);assert.equal(empty.ids.title.value,'Offline');
  empty.input('Failure');await empty.advance(500);await empty.answer(3,{}, {status:500});assert.match(empty.ids['title-lookup-status'].textContent,/Поиск недоступен/);
  empty.input('Timeout');await empty.advance(500);await empty.advance(8000);assert.equal(empty.calls[4].options.signal.aborted,true);assert.match(empty.ids['title-lookup-status'].textContent,/Поиск недоступен/);
  await empty.answer(4,[row()]);assert.equal(empty.ids['title-suggestions'].hidden,true);
  const quota=boot();quota.input('Limit');await quota.advance(500);await quota.answer(0,{}, {status:429,retry:'20'});assert.match(quota.ids['title-lookup-status'].textContent,/Слишком много/);
  quota.input('Other');await quota.advance(500);assert.equal(quota.calls.length,1);await quota.advance(20000);quota.input('Other');await quota.advance(500);assert.equal(quota.calls.length,2);
  await quota.answer(1,{}, {status:429});quota.input('Again');await quota.advance(9999);assert.equal(quota.calls.length,2);await quota.advance(1);quota.input('Again');await quota.advance(500);assert.equal(quota.calls.length,3);
  const missing=boot();missing.input('Unknown');await missing.advance(500);await missing.answer(0,[row(1,{premiered:null,rating:{average:null},runtime:60})]);assert.match(missing.ids['title-suggestions'].children[0].textContent,/Год не указан · Нет оценки/);
  missing.ids.year.value='1999';missing.ids['catalog-rating'].value='9.0';missing.select();assert.equal(missing.ids.year.value,'');assert.equal(missing.ids['catalog-rating'].value,'');assert.equal(missing.ids.duration.value,'');assert.deepEqual(missing.api.getMetadata(),{tvmazeId:1});
  missing.input('Literal');await missing.advance(500);await missing.answer(1,[row(2,{name:'<img src=x onerror=alert(1)>',url:'javascript:alert(1)'})]);assert.ok(missing.ids['title-suggestions'].children[0].textContent.includes('<img'));missing.select();assert.equal(missing.ids['title-source'].href,'https://www.tvmaze.com/shows/2');
  const bounded=boot();for(let i=0;i<21;i++){bounded.input(`Query ${i}`);await bounded.advance(500);await bounded.answer(i,[row(i+1)]);}bounded.input('Query 0');await bounded.advance(500);assert.equal(bounded.calls.length,22);
  console.log('PASS: TVmaze normalization, debounce, cache/expiry/bounds, stale responses, timeout, HTTP/offline/429, keyboard/IME, manual edits, source metadata, reset/blur and safe text.');
}
module.exports=run();
