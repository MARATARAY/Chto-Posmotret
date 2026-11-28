'use strict';
const assert = require('node:assert/strict');
const { init, seasonForMonth } = require('../seasonal-animation.js');
function boot(options = {}) {
  class Element {
    constructor() { this.hidden=true;this.children=[];this.dataset={};this.attrs={};this.events={};this.properties={};this.style={setProperty:(key,value)=>{this.properties[key]=value;}};this.classes=new Set();this.classList={toggle:(name,on)=>on?this.classes.add(name):this.classes.delete(name)}; }
    append(child) { this.children.push(child); }
    replaceChildren() { this.children=[]; }
    setAttribute(key,value) { this.attrs[key]=value; }
    addEventListener(name,fn) { this.events[name]=fn; }
  }
  const layer=new Element(),toggle=new Element(),message=new Element();
  const queries={};
  const window={matchMedia(query){const media={matches:query.includes('reduced-motion')?!!options.reduced:!!options.mobile,addEventListener(name,fn){this.change=fn;}};queries[query]=media;return media;}};
  const ids={'#seasonal-layer':layer,'#seasonal-toggle':toggle,'#seasonal-message':message};
  const events={};const document={hidden:false,querySelector:key=>ids[key],createElement:()=>new Element(),addEventListener(name,fn){events[name]=fn;}};
  const store=options.store || new Map([['unrelated','keep'],['kadr.watchlist.v1','keep catalog']]);
  if(options.value!==undefined)store.set('kadr.seasonalAnimation.v1',options.value);
  let month=options.month??10;
  init({document,window,storage:{getItem(key){if(options.readError)throw Error('blocked');return store.get(key)??null;},setItem(key,value){if(options.writeError)throw Error('blocked');store.set(key,value);}},now:()=>({getMonth:()=>month}),random:()=>.5});
  return {layer,toggle,message,document,events,store,queries,click:()=>toggle.events.click(),month(value){month=value;events.visibilitychange();}};
}
const seasons=['winter','winter','spring','spring','spring','summer','summer','summer','autumn','autumn','autumn','winter'];
for(let month=0;month<12;month++)assert.equal(seasonForMonth(month),seasons[month]);
for(const invalid of [-1,12,1.5,NaN,'0'])assert.throws(()=>seasonForMonth(invalid),RangeError);
const t=boot();assert.equal(t.layer.dataset.season,'autumn');assert.equal(t.layer.children.length,18);assert.equal(t.layer.hidden,false);assert.equal(t.toggle.hidden,false);assert.equal(t.toggle.attrs['aria-pressed'],'true');
const first=t.layer.children[0];t.events.visibilitychange();assert.equal(t.layer.children[0],first);
const mobile=t.queries['(max-width: 600px)'];mobile.matches=true;mobile.change();assert.equal(t.layer.children.length,10);
for(const particle of t.layer.children)assert.ok(parseFloat(particle.properties['--size'])<=18);
mobile.matches=false;mobile.change();assert.equal(t.layer.children.length,18);mobile.matches=true;mobile.change();assert.equal(t.layer.children.length,10);
t.month(11);assert.equal(t.layer.dataset.season,'winter');assert.equal(t.layer.children[0].children[0].textContent,'❄');t.month(0);assert.equal(t.layer.dataset.season,'winter');
t.month(2);assert.equal(t.layer.dataset.season,'spring');assert.equal(t.layer.children[0].children[0].textContent,'🌸');t.month(5);assert.equal(t.layer.dataset.season,'summer');assert.equal(t.layer.children[0].children[0].textContent,'');
t.document.hidden=true;t.events.visibilitychange();assert.equal(t.layer.classes.has('is-paused'),true);assert.equal(t.toggle.attrs['aria-pressed'],'true');
t.document.hidden=false;t.events.visibilitychange();assert.equal(t.layer.classes.has('is-paused'),false);
t.click();assert.equal(t.layer.hidden,true);assert.equal(t.layer.classes.has('is-paused'),true);assert.equal(t.toggle.textContent,'Анимация: Выкл');assert.equal(t.store.get('kadr.seasonalAnimation.v1'),'off');
const reload=boot({store:t.store});assert.equal(reload.layer.hidden,true);reload.click();assert.equal(reload.layer.hidden,false);assert.equal(reload.store.get('kadr.seasonalAnimation.v1'),'on');
assert.equal(t.store.get('unrelated'),'keep');assert.equal(t.store.get('kadr.watchlist.v1'),'keep catalog');
const reduced=boot({reduced:true});assert.equal(reduced.layer.hidden,true);reduced.queries['(prefers-reduced-motion: reduce)'].matches=false;reduced.queries['(prefers-reduced-motion: reduce)'].change();assert.equal(reduced.layer.hidden,false);assert.equal(reduced.store.has('kadr.seasonalAnimation.v1'),false);
const explicit=boot({reduced:true,value:'on'});assert.equal(explicit.layer.hidden,false);explicit.queries['(prefers-reduced-motion: reduce)'].change();assert.equal(explicit.layer.hidden,false);explicit.click();assert.equal(explicit.layer.hidden,true);explicit.queries['(prefers-reduced-motion: reduce)'].matches=false;explicit.queries['(prefers-reduced-motion: reduce)'].change();assert.equal(explicit.layer.hidden,true);
assert.equal(boot({value:'bad data',reduced:true}).layer.hidden,true);assert.equal(boot({value:'bad data'}).layer.hidden,false);
const blocked=boot({readError:true,writeError:true,reduced:true});assert.equal(blocked.layer.hidden,true);blocked.click();assert.equal(blocked.layer.hidden,false);assert.equal(blocked.message.textContent,'Настройка анимации сохранится только до закрытия страницы');
blocked.document.hidden=true;blocked.events.visibilitychange();assert.equal(blocked.layer.classes.has('is-paused'),true);blocked.document.hidden=false;blocked.events.visibilitychange();assert.equal(blocked.layer.classes.has('is-paused'),false);
console.log('PASS: all months, particle limits/reuse, seasons, visibility pause, persistent choice, reduced-motion precedence and malformed/blocked storage.');
