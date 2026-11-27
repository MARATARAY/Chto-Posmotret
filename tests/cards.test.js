const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'app.js'), 'utf8');
function boot(rawFavorites, options = {}) {
  let document;
  class El {
    constructor(kind = '', parent = null) { this.kind=kind; this.parent=parent; this.children=[];this.dataset={};this.attrs={};this.handlers={};this.hidden=false;this.value='';this.textContent='';this.style={};this.parts={};this.classList={toggle(){},contains:(name)=>this.kind==='.'+name}; }
    querySelector(s) { return this.parts[s] ||= new El(s, this); }
    setAttribute(k,v) { this.attrs[k]=v; }
    addEventListener(k,f) { this.handlers[k]=f; }
    append(...nodes) { for (const n of nodes) { if (n.kind==='fragment') this.append(...n.children); else {this.children.push(n);n.parent=this;} } }
    replaceChildren() { this.children=[]; }
    closest(s) {return s.split(', ').includes(this.kind) || (s==='button[data-view]' && this.dataset.view) || (s==='button[data-category]' && this.dataset.category) ? this : this.parent?.closest(s);}
    focus() {document.activeElement=this;}
    click() {this.handlers.click?.({target:this});}
  }
  const ids={}; document={activeElement:null,body:new El(),querySelector(s){return ids[s] ||= new El(s);},querySelectorAll(s){if(s==='[data-view]')return views;if(s==='[data-category].filter-chip')return cats;return [];},createElement(){return new El();},createDocumentFragment(){return new El('fragment');}};
  const views=['catalog','favorites'].map(view=>{const e=new El();e.dataset.view=view;return e;});
  const cats=['all','Фильм','Сериал','Мультфильм'].map(category=>{const e=new El();e.dataset.category=category;return e;});
  ids['[data-view="favorites"]']=views[1];
  ids['[data-view="catalog"]']=views[0];
  document.querySelector('#entry-template').content={firstElementChild:{cloneNode(){const e=new El('.entry'); e.querySelector('.entry-favorite').kind='.entry-favorite';return e;}}};
  const entries=[['a','Одинаковое имя','Фильм'],['b','Одинаковое имя','Сериал'],['c','Мультфильм','Мультфильм']].map(([id,title,category],i)=>({id,title,category,status:'planned',rating:8,comment:'text',createdAt:1000-i}));
  const store=new Map([['kadr.watchlist.v1',JSON.stringify(options.entries || entries)],['kadr.favorites.v1',rawFavorites ?? '[]'],['unrelated','keep']]);
  const events={};const localStorage={getItem(k){if(options.blockRead)throw Error('denied');return store.get(k)??null;},setItem(k,v){if(options.blockWrite)throw Error('quota');store.set(k,v);}};
  let sequence=0;
  const form=document.querySelector('#title-form');
  form.reset=function(){this.values={};for(const id of ['title','year','catalog-rating','duration'])document.querySelector('#'+id).value='';document.querySelector('#category').value='Фильм';this.resets=(this.resets||0)+1;};
  const FormData=class {constructor(form){this.values=form.values||{};}get(key){return this.values[key]??null;}};
  vm.runInNewContext(source,{document,localStorage,FormData,window:{matchMedia(){return {matches:false,addEventListener(){}};},addEventListener(k,f){events[k]=f;}},Intl,Date,Set,JSON,Number,Math,globalThis:{crypto:{randomUUID(){return 'new-'+(++sequence);}}}});
  return {ids,views,cats,store,document,events,options,entries,list:ids['#collection-list'],favorite(i){this.list.children[i].querySelector('.entry-favorite').click();},view(v){ids['#collection-views'].handlers.click({target:views.find(e=>e.dataset.view===v)});},category(c){ids['#category-filters'].handlers.click({target:cats.find(e=>e.dataset.category===c)});},search(q){ids['#catalog-search'].value=q;ids['#catalog-search'].handlers.input();},count(){return ids['#total-count'].textContent;},submit(values){form.values=values;for(const [key,id] of Object.entries({title:'title',category:'category',year:'year',catalogRating:'catalog-rating',duration:'duration'}))document.querySelector('#'+id).value=String(values[key]??'');form.handlers.submit({preventDefault(){}});},saved(){return JSON.parse(store.get('kadr.watchlist.v1'));}};
}
const t=boot();const watch=t.store.get('kadr.watchlist.v1');assert.equal(t.count(),'3');
t.favorite(0);assert.deepEqual(JSON.parse(t.store.get('kadr.favorites.v1')),['a']);assert.equal(t.list.children[0].querySelector('.entry-favorite').attrs['aria-pressed'],'true');
t.view('favorites');assert.equal(t.count(),'1');assert.equal(t.list.children[0].dataset.id,'a');
t.category('Сериал');assert.equal(t.count(),'0');assert.equal(t.ids['#empty-state'].querySelector('h3').textContent,'Ничего не найдено');
t.view('catalog');assert.equal(t.count(),'1');t.favorite(0);assert.deepEqual(JSON.parse(t.store.get('kadr.favorites.v1')),['a','b']);
t.search('  ОДИНАКОВОЕ  ');t.view('favorites');assert.equal(t.count(),'1');assert.equal(t.list.children[0].dataset.id,'b');
t.search('zzz');assert.equal(t.count(),'0');t.search('');t.category('all');assert.equal(t.count(),'2');
t.favorite(0);assert.equal(t.count(),'1');assert.equal(t.document.activeElement,t.list.children[0].querySelector('.entry-favorite'));
t.favorite(0);assert.equal(t.count(),'0');assert.equal(t.document.activeElement,t.views[1]);assert.equal(t.ids['#empty-state'].querySelector('h3').textContent,'В избранном пока пусто');
assert.equal(t.store.get('kadr.watchlist.v1'),watch);assert.equal(t.store.get('unrelated'),'keep');
const restored=boot('["b","b","missing"]');restored.view('favorites');assert.equal(restored.count(),'1');assert.equal(restored.list.children[0].dataset.id,'b');
restored.favorite(0);const reload=boot(restored.store.get('kadr.favorites.v1'));reload.view('favorites');assert.equal(reload.count(),'0');
for(const invalid of ['broken','{}','null','[2,null]']){const bad=boot(invalid);bad.view('favorites');assert.equal(bad.count(),'0');bad.view('catalog');assert.equal(bad.count(),'3');}
const denied=boot('[]',{blockWrite:true});denied.favorite(0);assert.equal(denied.ids['#favorites-message'].hidden,false);denied.view('favorites');assert.equal(denied.count(),'1');
const noRead=boot(null,{blockRead:true});assert.equal(noRead.count(),'0');assert.equal(noRead.ids['#favorites-message'].hidden,false);
const sync=boot();sync.events.storage({key:'kadr.favorites.v1',newValue:'["c"]'});sync.view('favorites');assert.equal(sync.count(),'1');sync.events.storage({key:null,newValue:null});assert.equal(sync.count(),'0');
console.log('PASS: favorites add/remove, duplicate names and IDs, reload, combined search/category/view, counts, empty states, focus recovery, malformed/blocked storage, cross-tab updates, watchlist preservation.');

const regression=boot('["a"]');
regression.list.children[0].querySelector('.entry-status').click();
assert.equal(JSON.parse(regression.store.get('kadr.watchlist.v1'))[0].status,'watched');
assert.equal(regression.list.children[0].querySelector('.entry-favorite').attrs['aria-pressed'],'true');
regression.list.children[0].querySelector('.delete-button').click();assert.equal(regression.count(),'2');
regression.ids['#form-message'].children[0].click();assert.equal(regression.count(),'3');
assert.equal(regression.list.children[0].querySelector('.entry-favorite').attrs['aria-pressed'],'true');
console.log('PASS: changing watch status, deleting and undoing a card preserve its favorite flag.');

const valid={title:'  New film  ',category:'Фильм',year:'2024',catalogRating:'8,4',duration:'120',status:'planned',comment:'Note'};
const cards=boot('["a"]');cards.view('favorites');cards.search('missing');cards.category('Сериал');cards.submit(valid);
assert.equal(cards.count(),'4');const newCard=cards.saved()[0];
assert.equal(newCard.title,'New film');assert.equal(newCard.year,'2024');assert.equal(newCard.catalogRating,8.4);assert.equal(newCard.duration,120);assert.equal(newCard.durationUnit,'minutes');assert.equal(newCard.rating,null);assert.equal(newCard.origin,'user');
assert.equal(cards.ids['#title-form'].resets,1);assert.equal(cards.list.children[0].querySelector('.entry-details').textContent,'2024 · Рейтинг 8.4 · 120 мин');
assert.equal(cards.list.children[0].querySelector('.entry-favorite').attrs['aria-pressed'],'false');
const restoredCards=boot(cards.store.get('kadr.favorites.v1'),{entries:cards.saved()});assert.equal(restoredCards.count(),'4');assert.equal(restoredCards.saved()[1].id,'a');assert.equal(restoredCards.list.children[1].querySelector('.entry-details').hidden,true);
for(const [field,values] of Object.entries({title:['','   ','x'.repeat(161)],category:['Other','Другое'],year:['24','0000','999','10000','2024.0','2e03','-2024'],catalogRating:['','-0.1','10.1','8.44','8.40','Infinity','NaN','1e0'],duration:['','0','-1','1.5','1e2','10000']})){
  for(const value of values){const before=cards.store.get('kadr.watchlist.v1');const bad={...valid,[field]:value};cards.submit(bad);assert.equal(cards.store.get('kadr.watchlist.v1'),before,field+': '+value);assert.equal(cards.ids['#title-form'].values[field],value);assert.equal(cards.ids['#'+(field==='catalogRating'?'catalog-rating':field)].attrs['aria-invalid'],'true');}
}
for(const rating of ['0','0.0','10','10.0','8.4']){const b=boot();b.submit({...valid,catalogRating:rating});assert.equal(b.saved()[0].catalogRating,Number(rating));}
for(const [count,label] of [[1,'1 сезон'],[2,'2 сезона'],[5,'5 сезонов'],[11,'11 сезонов'],[21,'21 сезон'],[22,'22 сезона'],[114,'114 сезонов'],[9999,'9999 сезонов']]){const b=boot();b.submit({...valid,category:'Сериал',duration:String(count),year:'1000'});assert.equal(b.saved()[0].durationUnit,'seasons');assert.ok(b.list.children[0].querySelector('.entry-details').textContent.endsWith(label));}
const cartoon=boot();cartoon.submit({...valid,category:'Мультфильм',year:'9999',duration:'1'});assert.ok(cartoon.list.children[0].querySelector('.entry-details').textContent.endsWith('1 мин'));
const fail=boot('["a"]',{blockWrite:true});const original=fail.store.get('kadr.watchlist.v1');fail.submit(valid);assert.equal(fail.store.get('kadr.watchlist.v1'),original);assert.equal(fail.count(),'3');assert.equal(fail.ids['#title-form'].values.title,valid.title);assert.equal(fail.ids['#title-form'].resets,undefined);
fail.list.children[0].querySelector('.delete-button').click();assert.equal(fail.count(),'3');assert.equal(fail.store.get('kadr.watchlist.v1'),original);
fail.list.children[0].querySelector('.entry-status').click();assert.equal(fail.saved()[0].status,'planned');
const del=boot();del.submit(valid);del.submit(valid);assert.notEqual(del.saved()[0].id,del.saved()[1].id);del.favorite(0);del.view('favorites');assert.equal(del.count(),'1');del.list.children[0].querySelector('.delete-button').click();assert.equal(del.count(),'0');assert.equal(del.document.activeElement,del.views[1]);
const deletedReload=boot(del.store.get('kadr.favorites.v1'),{entries:del.saved()});deletedReload.view('favorites');assert.equal(deletedReload.count(),'0');
del.ids['#form-message'].children[0].click();assert.equal(del.count(),'1');assert.equal(del.list.children[0].querySelector('.entry-favorite').attrs['aria-pressed'],'true');
const safe=boot();safe.submit({...valid,title:'<script>alert(1)</script>'});assert.equal(safe.list.children[0].querySelector('.entry-title').textContent,'<script>alert(1)</script>');
console.log('PASS: all new fields, decimal normalization, validation boundaries, units/plurals, legacy data, duplicate names/IDs, transactional storage failures, delete/undo/reload, favorites and literal text rendering.');
