const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const monthly = require('../monthly-summary.js');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'app.js'), 'utf8');
function boot(rawFavorites, options = {}) {
  let document;
  class El {
    constructor(kind = '', parent = null) { this.kind=kind; this.parent=parent; this.children=[];this.dataset={};this.attrs={};this.handlers={};this.hidden=false;this.value='';this.textContent='';this.style={};this.parts={};this.classList={toggle(){},contains:(name)=>this.kind==='.'+name}; }
    querySelector(s) { return this.parts[s] ||= new El(s, this); }
    setAttribute(k,v) { this.attrs[k]=v; }
    addEventListener(k,f) { const previous=this.handlers[k]; this.handlers[k]=previous ? event=>{previous(event);f(event);} : f; }
    append(...nodes) { for (const n of nodes) { if (n.kind==='fragment') this.append(...n.children); else {this.children.push(n);n.parent=this;} } }
    replaceChildren() { this.children=[]; }
    closest(s) {return s.split(', ').includes(this.kind) || (s==='button[data-view]' && this.dataset.view) || (s==='button[data-category]' && this.dataset.category) ? this : this.parent?.closest(s);}
    focus() {document.activeElement=this;}
    select() {this.selected=true;}
    submit() { if(options.failPost)throw Error('blocked'); document.posts.push({method:this.method,action:this.action,target:this.target,charset:this.acceptCharset,enctype:this.enctype,rel:this.attrs.rel,parent:this.parent,fields:this.children.map(input=>({name:input.name,value:input.value,type:input.type}))}); }
    remove() { if(this.parent)this.parent.children=this.parent.children.filter(item=>item!==this);this.parent=null; }
    click() {this.handlers.click?.({target:this});}
  }
  const ids={}; document={activeElement:null,posts:[],body:new El(),querySelector(s){return ids[s] ||= new El(s);},querySelectorAll(s){if(s==='[data-view]')return views;if(s==='[data-category].filter-chip')return cats;return [];},createElement(tag){return new El(tag);},createDocumentFragment(){return new El('fragment');}};
  const views=['catalog','favorites','best'].map(view=>{const e=new El();e.dataset.view=view;return e;});
  const cats=['all','Фильм','Сериал','Мультфильм'].map(category=>{const e=new El();e.dataset.category=category;return e;});
  ids['[data-view="favorites"]']=views[1];
  ids['[data-view="catalog"]']=views[0];
  ids['[data-view="best"]']=views[2];
  document.querySelector('#entry-template').content={firstElementChild:{cloneNode(){const e=new El('.entry'); e.querySelector('.entry-favorite').kind='.entry-favorite';return e;}}};
  document.querySelector('#review-template').content={firstElementChild:{cloneNode(){return new El('.review-editor');}}};
  document.querySelector('#watched-date-template').content={firstElementChild:{cloneNode(){return new El('.watched-date-form');}}};
  const entries=[['a','Одинаковое имя','Фильм'],['b','Одинаковое имя','Сериал'],['c','Мультфильм','Мультфильм']].map(([id,title,category],i)=>({id,title,category,status:'planned',rating:8,comment:'text',createdAt:1000-i}));
  const store=new Map([['kadr.watchlist.v1',JSON.stringify(options.entries || entries)],['kadr.favorites.v1',rawFavorites ?? '[]'],['unrelated','keep']]);
  if (options.fresh) store.delete('kadr.watchlist.v1');
  const events={};const localStorage={getItem(k){if(options.blockRead)throw Error('denied');return store.get(k)??null;},setItem(k,v){if(options.blockWrite)throw Error('quota');store.set(k,v);}};
  let sequence=0;
  const form=document.querySelector('#title-form');
  form.reset=function(){this.handlers.reset?.();this.values={};for(const id of ['title','year','duration'])document.querySelector('#'+id).value='';document.querySelector('#category').value='Фильм';this.resets=(this.resets||0)+1;};
  const FormData=class {constructor(form){this.values=form.values||{};}get(key){return this.values[key]??null;}};
  vm.runInNewContext(source,{document,localStorage,FormData,window:{KadrOnlineSearch:options.onlineSearch,KadrMonthly:options.monthly || monthly,navigator:options.navigator,matchMedia(){return {matches:false,addEventListener(){}};},addEventListener(k,f){events[k]=f;}},Intl,Date,Set,JSON,Number,Math,globalThis:{crypto:{randomUUID(){return 'new-'+(++sequence);}}}});
  return {ids,views,cats,store,document,events,options,entries,list:ids['#collection-list'],favorite(i){this.list.children[i].querySelector('.entry-favorite').click();},view(v){ids['#collection-views'].handlers.click({target:views.find(e=>e.dataset.view===v)});},category(c){ids['#category-filters'].handlers.click({target:cats.find(e=>e.dataset.category===c)});},search(q){ids['#catalog-search'].value=q;ids['#catalog-search'].handlers.input();},count(){return ids['#total-count'].textContent;},submit(values){form.values=values;for(const [key,id] of Object.entries({title:'title',category:'category',year:'year',duration:'duration'}))document.querySelector('#'+id).value=String(values[key]??'');form.handlers.submit({preventDefault(){}});},saved(){return JSON.parse(store.get('kadr.watchlist.v1'));}};
}
// Watch only reveals fixed links; it must not validate or submit the add form.
const watchUI=boot();const watchBefore=watchUI.store.get('kadr.watchlist.v1');
watchUI.ids['#title'].value='   ';watchUI.ids['#watch-button'].click();
assert.equal(watchUI.ids['#watch-error'].textContent,'Введите название фильма');assert.equal(watchUI.ids['#watch-error'].hidden,false);assert.equal(watchUI.ids['#watch-links'].hidden,true);assert.equal(watchUI.document.activeElement,watchUI.ids['#title']);
watchUI.ids['#title'].value='  Матрица  ';watchUI.ids['#title'].handlers.input();assert.equal(watchUI.ids['#watch-error'].hidden,true);
watchUI.ids['#watch-button'].focus();watchUI.ids['#watch-button'].click();assert.equal(watchUI.ids['#watch-heading'].textContent,'Где смотреть: Матрица');assert.equal(watchUI.ids['#watch-button'].attrs['aria-expanded'],'true');assert.equal(watchUI.document.activeElement,watchUI.ids['#watch-button']);assert.equal(watchUI.ids['#watch-links'].hidden,false);
watchUI.ids['#watch-button'].click();assert.equal(watchUI.store.get('kadr.watchlist.v1'),watchBefore);
watchUI.ids['#title'].value='Начало';watchUI.ids['#title'].handlers.change();assert.equal(watchUI.ids['#watch-links'].hidden,false);assert.equal(watchUI.ids['#watch-heading'].textContent,'Где смотреть: Начало');assert.equal(watchUI.ids['#watch-button'].attrs['aria-expanded'],'true');
watchUI.ids['#title'].value='<b>Фильм & название</b>';watchUI.ids['#watch-button'].click();assert.equal(watchUI.ids['#watch-heading'].textContent,'Где смотреть: <b>Фильм & название</b>');
watchUI.ids['#title-form'].reset();assert.equal(watchUI.ids['#watch-links'].hidden,true);assert.equal(watchUI.ids['#watch-error'].hidden,true);
console.log('PASS: Watch empty/space error, trim, no submit/storage writes, safe heading, repeat, title input/change and form reset.');
// Direct searches submit only the requested fields, then clean up outside the add form.
const direct=boot();const directOriginal=direct.store.get('kadr.watchlist.v1');
direct.ids['#title'].value='  Матрица & "+" <b>фильм</b>  ';direct.ids['#title'].handlers.input();assert.equal(direct.ids['#watch-links'].hidden,false);assert.equal(direct.document.posts.length,0);
const platforms=direct.ids['#watch-platforms'].children;assert.equal(platforms.length,4);
assert.deepEqual(platforms.map(item=>item.textContent),['KinoGo (kino-go.bi)','KinoGo TV (tv.kinogo.mu)','Baskino (baskino.my)','YouTube']);
assert.equal(platforms[3].href,'https://youtube.com');assert.equal(platforms[3].target,'_blank');assert.equal(platforms[3].rel,'noopener noreferrer');
for(let i=0;i<3;i++){
  platforms[i].click();const post=direct.document.posts[i];
  assert.equal(post.method,'POST');assert.equal(post.target,'_blank');assert.equal(post.charset,'UTF-8');assert.equal(post.enctype,'application/x-www-form-urlencoded');assert.equal(post.rel,'noopener noreferrer');assert.equal(post.parent,direct.document.body);
  assert.deepEqual(post.fields,[{name:'do',value:'search',type:'hidden'},{name:'subaction',value:'search',type:'hidden'},{name:'story',value:'Матрица & "+" <b>фильм</b>',type:'hidden'}]);assert.equal(direct.document.body.children.length,0);
}
assert.deepEqual(direct.document.posts.map(post=>post.action),['https://kino-go.bi/index.php?do=search','https://tv.kinogo.mu/index.php?do=search','https://baskino.my/index.php?do=search']);
direct.ids['#title'].value='Новое название';platforms[0].click();assert.equal(direct.document.posts[3].fields[2].value,'Новое название');
const card=direct.list.children[0];card.querySelector('.entry-watch').click();assert.equal(card.querySelector('.entry-watch-panel').hidden,false);assert.equal(card.querySelector('.entry-watch').attrs['aria-expanded'],'true');
card.querySelector('.entry-watch-platforms').children[1].click();assert.equal(direct.document.posts[4].fields[2].value,direct.entries[0].title);assert.equal(direct.document.posts[4].action,'https://tv.kinogo.mu/index.php?do=search');
assert.equal(new Set(direct.list.children.map(card=>card.querySelector('.entry-watch-panel').id)).size,direct.list.children.length);
assert.equal(direct.store.get('kadr.watchlist.v1'),directOriginal);assert.equal(direct.document.body.children.length,0);
const postFailure=boot(null,{failPost:true});postFailure.ids['#title'].value='Матрица';postFailure.ids['#watch-platforms'].children[0].click();assert.equal(postFailure.ids['#watch-site-error'].textContent,'Не удалось открыть площадку. Попробуйте ещё раз');assert.equal(postFailure.document.body.children.length,0);assert.equal(postFailure.ids['#title'].value,'Матрица');
direct.ids['#title'].value=' ';direct.ids['#title'].handlers.input();assert.equal(direct.ids['#watch-links'].hidden,true);const postsBefore=direct.document.posts.length;platforms[0].click();assert.equal(direct.document.posts.length,postsBefore);
console.log('PASS: exact POST actions/raw fields, card title isolation, unique panel IDs, cleanup on success/error, current input and no storage mutations.');
// Supplied local posters attach at render time without rewriting saved entries.
const posterEntries=[['Матрица','1999','matrix.jpeg'],['Начало','2010','inception.jpg'],['Лабиринт Фавна','2006','pans-labyrinth.jpg'],['  интерстеллар  ',undefined,'interstellar.jpg']].map(([title,year,file],i)=>({id:'poster-'+i,title,year,file,category:'Фильм',status:'planned',rating:null,comment:'keep',createdAt:1000-i}));
const posterApp=boot(null,{entries:posterEntries});
posterApp.list.children.forEach((card,i)=>{assert.equal(card.querySelector('.entry-poster').src,'assets/posters/'+posterEntries[i].file);assert.equal(card.querySelector('.entry-poster').hidden,false);});
assert.deepEqual(posterApp.saved(),JSON.parse(JSON.stringify(posterEntries)));
posterApp.favorite(0);posterApp.view('favorites');assert.equal(posterApp.list.children[0].querySelector('.entry-poster').hidden,false);
const posterReload=boot(null,{entries:posterApp.saved()});assert.equal(posterReload.list.children[3].querySelector('.entry-poster').src,'assets/posters/interstellar.jpg');
posterReload.list.children[0].querySelector('.entry-poster').handlers.error();assert.equal(posterReload.list.children[0].querySelector('.entry-poster').hidden,true);assert.equal(posterReload.list.children[0].querySelector('.entry-art > span').hidden,false);
for(const change of [{category:'Сериал'},{year:'2026'},{title:'Матрица: Перезагрузка'},{title:'toString'}]){const unmatched=boot(null,{entries:[{...posterEntries[0],...change}]});assert.equal(unmatched.list.children[0].querySelector('.entry-poster').hidden,true);}
const spacedPoster=boot(null,{entries:[{...posterEntries[2],title:' ЛАБИРИНТ   ФАВНА '}]});assert.equal(spacedPoster.list.children[0].querySelector('.entry-poster').src,'assets/posters/pans-labyrinth.jpg');
console.log('PASS: four local posters, legacy titles, years/categories, favorites/reload, unchanged storage and image failure fallback.');
// Spec 001: initialize once, preserve saved catalogs, combine search and category.
const freshCatalog=boot(null,{fresh:true});
assert.equal(freshCatalog.count(),'6');
for(const category of ['Фильм','Сериал','Мультфильм']) {
  freshCatalog.category(category);assert.equal(freshCatalog.count(),'2');
  assert.ok(freshCatalog.list.children.every(card=>card.dataset.category===category));
}
freshCatalog.category('Фильм');freshCatalog.search('  НАЧ  ');assert.equal(freshCatalog.count(),'1');
assert.equal(freshCatalog.list.children[0].querySelector('.entry-title').textContent,'Начало');
freshCatalog.category('Мультфильм');assert.equal(freshCatalog.count(),'0');
assert.equal(freshCatalog.ids['#catalog-search'].value,'  НАЧ  ');
assert.equal(freshCatalog.ids['#empty-state'].querySelector('p').textContent,'Измените название или выберите другую категорию');
freshCatalog.search('   ');assert.equal(freshCatalog.count(),'2');
assert.equal(freshCatalog.cats[3].attrs['aria-pressed'],'true');
freshCatalog.category('all');assert.equal(freshCatalog.count(),'6');
const starterIds=freshCatalog.saved().map(entry=>entry.id);
const starterReload=boot(null,{entries:freshCatalog.saved()});assert.equal(starterReload.count(),'6');
assert.deepEqual(starterReload.saved().map(entry=>entry.id),starterIds);
starterReload.list.children[0].querySelector('.delete-button').click();
assert.equal(boot(null,{entries:starterReload.saved()}).count(),'5');
const savedEmpty=boot(null,{entries:[]});assert.equal(savedEmpty.count(),'0');assert.deepEqual(savedEmpty.saved(),[]);
const blockedFresh=boot(null,{fresh:true,blockRead:true});assert.equal(blockedFresh.count(),'0');assert.equal(blockedFresh.store.has('kadr.watchlist.v1'),false);
const blockedSeed=boot(null,{fresh:true,blockWrite:true});assert.equal(blockedSeed.count(),'6');assert.equal(blockedSeed.store.has('kadr.watchlist.v1'),false);
console.log('PASS: starter catalog, all categories, trimmed/case-insensitive combined search, empty state, saved order, reload, deletion, saved empty catalog and storage failures.');
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
assert.equal(newCard.title,'New film');assert.equal(newCard.year,'2024');assert.equal(newCard.catalogRating,null);assert.equal(newCard.duration,120);assert.equal(newCard.durationUnit,'minutes');assert.equal(newCard.rating,null);assert.equal(newCard.origin,'user');
assert.equal(cards.ids['#title-form'].resets,1);assert.equal(cards.list.children[0].querySelector('.entry-details').textContent,'2024 · 120 мин');
assert.equal(cards.list.children[0].querySelector('.entry-favorite').attrs['aria-pressed'],'false');
const restoredCards=boot(cards.store.get('kadr.favorites.v1'),{entries:cards.saved()});assert.equal(restoredCards.count(),'4');assert.equal(restoredCards.saved()[1].id,'a');assert.equal(restoredCards.list.children[1].querySelector('.entry-details').hidden,true);
for(const [field,values] of Object.entries({title:['','   ','x'.repeat(161)],category:['Other','Другое'],year:['24','0000','999','10000','2024.0','2e03','-2024'],duration:['','0','-1','1.5','1e2','10000']})){
  for(const value of values){const before=cards.store.get('kadr.watchlist.v1');const bad={...valid,[field]:value};cards.submit(bad);assert.equal(cards.store.get('kadr.watchlist.v1'),before,field+': '+value);assert.equal(cards.ids['#title-form'].values[field],value);assert.equal(cards.ids['#'+(field==='catalogRating'?'catalog-rating':field)].attrs['aria-invalid'],'true');}
}
const ignoredManual=boot();ignoredManual.submit({...valid,catalogRating:'9.9'});assert.equal(ignoredManual.saved()[0].catalogRating,null);
for(const [count,label] of [[1,'1 сезон'],[2,'2 сезона'],[5,'5 сезонов'],[11,'11 сезонов'],[21,'21 сезон'],[22,'22 сезона'],[114,'114 сезонов'],[9999,'9999 сезонов']]){const b=boot();b.submit({...valid,category:'Сериал',duration:String(count),year:'1000'});assert.equal(b.saved()[0].durationUnit,'seasons');assert.ok(b.list.children[0].querySelector('.entry-details').textContent.endsWith(label));}
const cartoon=boot();cartoon.submit({...valid,category:'Мультфильм',year:'9999',duration:'1'});assert.ok(cartoon.list.children[0].querySelector('.entry-details').textContent.endsWith('1 мин'));
const fail=boot('["a"]',{blockWrite:true});const original=fail.store.get('kadr.watchlist.v1');fail.submit(valid);assert.equal(fail.store.get('kadr.watchlist.v1'),original);assert.equal(fail.count(),'3');assert.equal(fail.ids['#title-form'].values.title,valid.title);assert.equal(fail.ids['#title-form'].resets,undefined);
fail.list.children[0].querySelector('.delete-button').click();assert.equal(fail.count(),'3');assert.equal(fail.store.get('kadr.watchlist.v1'),original);
fail.list.children[0].querySelector('.entry-status').click();assert.equal(fail.saved()[0].status,'planned');
const del=boot();del.submit(valid);del.submit(valid);assert.notEqual(del.saved()[0].id,del.saved()[1].id);del.favorite(0);del.view('favorites');assert.equal(del.count(),'1');del.list.children[0].querySelector('.delete-button').click();assert.equal(del.count(),'0');assert.equal(del.document.activeElement,del.views[1]);
const deletedReload=boot(del.store.get('kadr.favorites.v1'),{entries:del.saved()});deletedReload.view('favorites');assert.equal(deletedReload.count(),'0');
del.ids['#form-message'].children[0].click();assert.equal(del.count(),'1');assert.equal(del.list.children[0].querySelector('.entry-favorite').attrs['aria-pressed'],'true');
const safe=boot();safe.submit({...valid,title:'<script>alert(1)</script>'});assert.equal(safe.list.children[0].querySelector('.entry-title').textContent,'<script>alert(1)</script>');
const importedCard=boot(null,{entries:[],onlineSearch:{getMetadata:()=>({tvmazeId:315,ratingSource:'TVmaze'})}});
importedCard.submit({...valid,title:'TVmaze test',category:'Сериал'});
assert.equal(importedCard.saved()[0].tvmazeId,315);assert.equal(importedCard.saved()[0].ratingSource,'TVmaze');
assert.equal(importedCard.list.children[0].querySelector('.entry-source').href,'https://www.tvmaze.com/shows/315');
const legacySource=boot(null,{entries:[{...importedCard.saved()[0],catalogRating:8.4}]});assert.match(legacySource.list.children[0].querySelector('.entry-details').textContent,/Рейтинг TVmaze 8.4/);
const importedReload=boot(null,{entries:importedCard.saved()});assert.equal(importedReload.list.children[0].querySelector('.entry-source').hidden,false);
importedReload.list.children[0].querySelector('.delete-button').click();importedReload.ids['#form-message'].children[0].click();assert.equal(importedReload.saved()[0].tvmazeId,315);
const manualRating=boot(null,{entries:[{...importedCard.saved()[0],ratingSource:undefined}]});assert.ok(!manualRating.list.children[0].querySelector('.entry-details').textContent.includes('Рейтинг TVmaze'));assert.equal(manualRating.list.children[0].querySelector('.entry-source').hidden,false);
const unsafeSource=boot(null,{entries:[{...importedCard.saved()[0],tvmazeId:'javascript:alert(1)'}]});assert.equal(unsafeSource.list.children[0].querySelector('.entry-source').hidden,true);
const wikiCard=boot(null,{entries:[],onlineSearch:{getMetadata:()=>({wikidataId:'Q13417189'})}});
wikiCard.submit({...valid,title:'Интерстеллар',catalogRating:'0.0',duration:'120'});
assert.equal(wikiCard.saved()[0].wikidataId,'Q13417189');assert.equal(wikiCard.saved()[0].catalogRating,null);
assert.equal(wikiCard.list.children[0].querySelector('.entry-source').href,'https://www.wikidata.org/wiki/Q13417189');
assert.equal(wikiCard.list.children[0].querySelector('.entry-source').textContent,'Данные Wikidata');
assert.ok(!wikiCard.list.children[0].querySelector('.entry-details').textContent.includes('Рейтинг Wikidata'));
const wikiReload=boot(null,{entries:wikiCard.saved()});wikiReload.list.children[0].querySelector('.delete-button').click();wikiReload.ids['#form-message'].children[0].click();assert.equal(wikiReload.saved()[0].wikidataId,'Q13417189');
const badWiki=boot(null,{entries:[{...wikiCard.saved()[0],wikidataId:'Q1/../../evil'}]});assert.equal(badWiki.list.children[0].querySelector('.entry-source').hidden,true);
console.log('PASS: Wikidata metadata/defaults persist through reload/delete/undo; legacy TVmaze sources preserved.');
console.log('PASS: TVmaze metadata persists through add/reload/delete/undo, attribution and safe source URLs.');
console.log('PASS: all new fields, decimal normalization, validation boundaries, units/plurals, legacy data, duplicate names/IDs, transactional storage failures, delete/undo/reload, favorites and literal text rendering.');

function openReview(app, index=0) {
  app.list.children[index].querySelector('.entry-review-toggle').click();
  return reviewEditor(app,index);
}
function reviewEditor(app,index=0) {
  return app.list.children[index].querySelector('.entry-body').children.find(el=>el.kind==='.review-editor');
}
function fillReview(editor, rating, note) {
  const score=editor.querySelector('.review-rating-input');score.value=rating;score.handlers.input();
  const text=editor.querySelector('.review-note-input');text.value=note;text.handlers.input();
}
function saveReview(editor) {editor.handlers.submit({preventDefault(){}});}
const reviewEntries=[['first',8,'watched'],['second',9,'watched'],['third',9,'watched'],['low',7.9,'watched'],['unrated',null,'watched'],['planned',10,'planned']].map(([id,rating,status],i)=>({id,title:'Same name',category:i===1?'Сериал':'Фильм',status,rating,comment:'Original note',createdAt:2000-i,catalogRating:6.5,year:'2024',duration:120,durationUnit:'minutes'}));
const reviews=boot('["first"]',{entries:reviewEntries});const catalogOrder=reviews.list.children.map(card=>card.dataset.id);
reviews.view('best');assert.deepEqual(reviews.list.children.map(card=>card.dataset.id),['second','third','first']);assert.equal(reviews.count(),'3');assert.equal(reviews.ids['#best-description'].hidden,false);
reviews.category('Сериал');assert.equal(reviews.count(),'1');reviews.search('no match');assert.equal(reviews.count(),'0');assert.equal(reviews.ids['#empty-state'].querySelector('h3').textContent,'Ничего не найдено');
reviews.search('');reviews.category('all');let editor=openReview(reviews);fillReview(editor,'7.9','  Changed\nsecond line  ');saveReview(editor);
assert.deepEqual(reviews.list.children.map(card=>card.dataset.id),['third','first']);assert.equal(reviews.saved().find(e=>e.id==='second').comment,'Changed\nsecond line');assert.equal(reviews.saved().find(e=>e.id==='second').catalogRating,6.5);assert.equal(reviews.document.activeElement,reviews.list.children[0].querySelector('.entry-review-toggle'));
reviews.view('catalog');assert.deepEqual(reviews.list.children.map(card=>card.dataset.id),catalogOrder);assert.equal(reviews.saved().find(e=>e.id==='first').rating,8);assert.equal(reviews.store.get('kadr.favorites.v1'),'["first"]');
editor=openReview(reviews);const beforeCancel=reviews.store.get('kadr.watchlist.v1');fillReview(editor,'10','Unsaved');editor.querySelector('.review-cancel').click();assert.equal(reviews.store.get('kadr.watchlist.v1'),beforeCancel);assert.equal(reviews.document.activeElement,reviews.list.children[0].querySelector('.entry-review-toggle'));
for(const invalid of ['0','0.9','10.1','8.44','8.40','abc','-1','1e1','Infinity']){editor=openReview(reviews);fillReview(editor,invalid,'Draft kept');const before=reviews.store.get('kadr.watchlist.v1');saveReview(editor);assert.equal(reviews.store.get('kadr.watchlist.v1'),before);assert.equal(editor.querySelector('.review-rating-error').hidden,false);assert.equal(editor.querySelector('.review-note-input').value,'Draft kept');editor.querySelector('.review-cancel').click();}
for(const [input,expected] of [['1',1],['1.0',1],['10.0',10],['8,4',8.4]]){editor=openReview(reviews);fillReview(editor,input,'<b>literal</b>\nnext');saveReview(editor);assert.equal(reviews.saved()[0].rating,expected);assert.equal(reviews.list.children[0].querySelector('.entry-comment').textContent,'<b>literal</b>\nnext');}
const reviewReload=boot(reviews.store.get('kadr.favorites.v1'),{entries:reviews.saved()});assert.equal(reviewReload.saved()[0].rating,8.4);assert.equal(reviewReload.list.children[0].querySelector('.entry-rating').textContent,'Ваша оценка 8.4');
editor=openReview(reviews);fillReview(editor,'8.0','x'.repeat(3001));let beforeLong=reviews.store.get('kadr.watchlist.v1');saveReview(editor);assert.equal(reviews.store.get('kadr.watchlist.v1'),beforeLong);assert.equal(editor.querySelector('.review-note-error').hidden,false);fillReview(editor,'8.0','x'.repeat(3000));saveReview(editor);assert.equal(reviews.saved()[0].comment.length,3000);
editor=openReview(reviews);fillReview(editor,'','   ');saveReview(editor);assert.equal(reviews.saved()[0].rating,null);assert.equal(reviews.saved()[0].comment,'');
const plannedReview=boot(null,{entries:[reviewEntries[5]]});editor=openReview(plannedReview);assert.equal(editor.querySelector('.review-rating-input').disabled,true);fillReview(editor,'5.0','Planned note');saveReview(editor);assert.equal(plannedReview.saved()[0].rating,10);assert.equal(plannedReview.saved()[0].comment,'Planned note');plannedReview.view('best');assert.equal(plannedReview.count(),'0');assert.equal(plannedReview.ids['#empty-state'].querySelector('h3').textContent,'В лучшем пока пусто');plannedReview.view('catalog');plannedReview.list.children[0].querySelector('.entry-status').click();plannedReview.view('best');assert.equal(plannedReview.count(),'1');plannedReview.list.children[0].querySelector('.entry-status').click();assert.equal(plannedReview.count(),'0');assert.equal(plannedReview.saved()[0].rating,10);
const reviewFailure=boot('["first"]',{entries:reviewEntries,blockWrite:true});editor=openReview(reviewFailure);fillReview(editor,'9.5','Keep my draft');const storedBefore=reviewFailure.store.get('kadr.watchlist.v1');saveReview(editor);assert.equal(reviewFailure.store.get('kadr.watchlist.v1'),storedBefore);assert.equal(editor.hidden,false);assert.equal(editor.querySelector('.review-save-error').hidden,false);assert.equal(editor.querySelector('.review-note-input').value,'Keep my draft');
const bestUndo=boot('["first"]',{entries:reviewEntries});bestUndo.view('best');bestUndo.list.children[0].querySelector('.delete-button').click();assert.equal(bestUndo.count(),'2');bestUndo.ids['#form-message'].children[0].click();assert.equal(bestUndo.count(),'3');assert.deepEqual(bestUndo.list.children.map(e=>e.dataset.id),['second','third','first']);
const createReview=boot();createReview.submit({...valid,status:'watched',personalRating:'8,4'});assert.equal(createReview.saved()[0].rating,8.4);createReview.view('best');assert.equal(createReview.count(),'1');
const createPlanned=boot();createPlanned.submit({...valid,status:'planned',personalRating:'9.5'});assert.equal(createPlanned.saved()[0].rating,null);
const createInvalid=boot();createInvalid.submit({...valid,status:'watched',personalRating:'8.44'});assert.equal(createInvalid.count(),'3');assert.equal(createInvalid.ids['#personal-rating'].attrs['aria-invalid'],'true');
console.log('PASS: review edit/cancel/clear, decimals and boundaries, notes and literal markup, storage failure drafts, legacy scores, watched-only ratings, best threshold/sort/ties/filters/status/undo, catalog/favorites preservation and focus.');
const createAccess=boot();assert.equal(createAccess.ids['#personal-rating'].disabled,true);createAccess.ids['#title-form'].values={status:'watched'};createAccess.ids['#title-form'].handlers.change();assert.equal(createAccess.ids['#personal-rating'].disabled,false);createAccess.ids['#title-form'].values={status:'planned'};createAccess.ids['#title-form'].handlers.change();assert.equal(createAccess.ids['#personal-rating'].disabled,true);
console.log('PASS: create-form personal rating enables only for watched status.');

// Monthly summaries use local calendar dates, independently of the catalog view.
const fixedToday='2026-11-27';
const fixedMonthly={...monthly,today:()=>fixedToday,isWatchedOn:value=>monthly.isWatchedOn(value,fixedToday)};
assert.equal(monthly.today({getFullYear:()=>2027,getMonth:()=>0,getDate:()=>1}),'2027-01-01');
assert.equal(monthly.previousMonth('2027-01'),'2026-12');
for(const [date,expected] of [['2024-02-29',true],['2026-02-29',false],['1900-02-29',false],['2000-02-29',true],['2026-04-31',false],['2026-11-00',false],['2026-13-01',false]])assert.equal(monthly.isCalendarDate(date),expected,date);
assert.equal(monthly.isWatchedOn('2026-11-28',fixedToday),false);
const dated=(id,category,watchedOn,status='watched')=>({id,title:'Private title',category,watchedOn,status,createdAt:1,rating:9,comment:'Private note',duration:5,durationUnit:'seasons'});
const monthEntries=[dated('f1','Фильм','2026-11-01'),dated('f2','Фильм','2026-11-27'),dated('s','Сериал','2026-11-12'),dated('c','Мультфильм','2026-11-13'),dated('old','Фильм','2026-10-31'),dated('unknown','Фильм',undefined),dated('bad','Сериал','2026-02-30'),dated('future','Фильм','2026-12-01'),dated('other','Другое','2026-11-01'),dated('planned','Фильм','2026-11-01','planned')];
const monthSnapshot=JSON.stringify(monthEntries);
const stats=monthly.summarize(monthEntries,'2026-11',fixedToday);
assert.equal(stats.total,4);assert.equal(stats.previousTotal,1);assert.equal(stats.difference,3);assert.equal(stats.undated,3);assert.equal(stats.current,true);assert.deepEqual(Array.from(stats.top,x=>x.category),['Фильм','Сериал','Мультфильм']);assert.equal(JSON.stringify(monthEntries),monthSnapshot);
assert.equal(monthly.summarize(monthEntries,'2026-10',fixedToday).current,false);
const emptySummary=monthly.summarize([],'2026-10',fixedToday);assert.equal(emptySummary.total,0);assert.equal(emptySummary.difference,0);assert.equal(emptySummary.top.length,0);
assert.match(monthly.comparison(-3),/На 3 меньше/);assert.match(monthly.comparison(0),/Столько же/);
assert.equal(monthly.summarize([dated('jan','Фильм','2027-01-01'),dated('dec','Фильм','2026-12-31')],'2027-01','2027-01-10').previousTotal,1);
assert.throws(()=>monthly.summarize([],'2026-12',fixedToday));
const report=monthly.report(stats);assert.match(report,/Всего просмотрено: 4/);assert.match(report,/Октябрь 2026: 1/);assert.match(report,/Месяц ещё не завершён/);assert.match(report,/без корректной даты: 3/);assert.ok(!report.includes('Private'));assert.ok(!monthly.report(emptySummary).includes('Месяц ещё не завершён'));
assert.equal(monthly.comparison(5,0),'В прошлом месяце записей не было');
assert.match(monthly.report(emptySummary),/В этом месяце вы ещё ничего не отметили как просмотренное/);
assert.match(monthly.report(emptySummary),/В прошлом месяце записей не было/);
const exampleEntries=[...Array.from({length:3},(_,i)=>dated('film'+i,'Фильм','2026-11-05')),dated('series','Сериал','2026-11-05'),dated('cartoon','Мультфильм','2026-11-05'),...Array.from({length:3},(_,i)=>dated('previous'+i,'Фильм','2026-10-05'))];
const exampleReport=monthly.report(monthly.summarize(exampleEntries,'2026-11',fixedToday));
assert.ok(exampleReport.startsWith('🎬 Мои итоги просмотра за Ноябрь 2026:\nВсего просмотрено: 5 (на 2 больше, чем в прошлом месяце)\nТоп категорий:\n1. Фильмы — 3\n2. Сериалы — 1\n3. Мультфильмы — 1'));
const summaryApp=boot('["f1"]',{entries:monthEntries,monthly:fixedMonthly});
const total=()=>summaryApp.ids['#monthly-total'].textContent;
assert.equal(total(),'4');assert.equal(summaryApp.saved().find(x=>x.id==='unknown').watchedOn,undefined);
summaryApp.search('missing');summaryApp.category('Сериал');summaryApp.view('favorites');assert.equal(total(),'4');assert.equal(summaryApp.count(),'0');
function changeMonth(app,value){app.ids['#summary-month'].value=value;app.ids['#summary-month'].handlers.change();}
changeMonth(summaryApp,'2026-10');assert.equal(total(),'1');assert.equal(summaryApp.ids['#catalog-search'].value,'missing');
changeMonth(summaryApp,'2026-12');assert.equal(total(),'1');assert.equal(summaryApp.ids['#summary-month-error'].hidden,false);
changeMonth(summaryApp,'2026-11');summaryApp.view('catalog');summaryApp.category('all');summaryApp.search('');
function dateForm(app,id){return app.list.children.find(x=>x.dataset.id===id).querySelector('.entry-body').children.find(x=>x.kind==='.watched-date-form');}
function saveDate(app,id,value){const form=dateForm(app,id);const input=form.querySelector('.watched-date-input');input.value=value;input.handlers.input();form.handlers.submit({preventDefault(){}});return form;}
for(const invalid of ['', '2026-02-30','2026-11-28']){const before=summaryApp.store.get('kadr.watchlist.v1');const form=saveDate(summaryApp,'unknown',invalid);assert.equal(summaryApp.store.get('kadr.watchlist.v1'),before);assert.equal(form.querySelector('.watched-date-error').hidden,false);}
saveDate(summaryApp,'unknown','2026-11-02');assert.equal(total(),'5');assert.equal(summaryApp.saved().find(x=>x.id==='unknown').watchedOn,'2026-11-02');
saveDate(summaryApp,'unknown','2026-10-02');assert.equal(total(),'4');assert.equal(summaryApp.ids['#monthly-previous'].textContent,'Октябрь 2026: 2');
const toggleUnknown=()=>summaryApp.list.children.find(x=>x.dataset.id==='unknown').querySelector('.entry-status').click();toggleUnknown();assert.equal(summaryApp.saved().find(x=>x.id==='unknown').watchedOn,'2026-10-02');assert.equal(summaryApp.ids['#monthly-previous'].textContent,'Октябрь 2026: 1');toggleUnknown();assert.equal(summaryApp.ids['#monthly-previous'].textContent,'Октябрь 2026: 2');
summaryApp.list.children.find(x=>x.dataset.id==='planned').querySelector('.entry-status').click();assert.equal(total(),'5');assert.equal(summaryApp.saved().find(x=>x.id==='planned').watchedOn,'2026-11-01');
summaryApp.submit({...valid,status:'watched'});assert.equal(summaryApp.saved()[0].watchedOn,fixedToday);assert.equal(total(),'6');
summaryApp.list.children[0].querySelector('.delete-button').click();assert.equal(total(),'5');summaryApp.ids['#form-message'].children[0].click();assert.equal(total(),'6');
const reloadedSummary=boot(null,{entries:summaryApp.saved(),monthly:fixedMonthly});assert.equal(reloadedSummary.ids['#monthly-total'].textContent,'6');
summaryApp.events.storage({key:'kadr.watchlist.v1',newValue:JSON.stringify([dated('sync','Фильм','2026-11-05')])});assert.equal(total(),'1');
const failedDate=boot(null,{entries:[dated('u','Фильм',undefined)],monthly:fixedMonthly,blockWrite:true});const failedForm=saveDate(failedDate,'u','2026-11-02');assert.equal(failedDate.saved()[0].watchedOn,undefined);assert.equal(failedDate.ids['#monthly-total'].textContent,'0');assert.equal(failedForm.querySelector('.watched-date-input').value,'2026-11-02');assert.equal(failedForm.querySelector('.watched-date-error').hidden,false);
const firstWatch=boot(null,{monthly:fixedMonthly});firstWatch.list.children[0].querySelector('.entry-status').click();assert.equal(firstWatch.saved()[0].watchedOn,fixedToday);
console.log('PASS: monthly totals/categories/ties/zeros, local dates/leap years/January, undated legacy entries, filters independence, validation, date/status/create/delete/undo/reload/storage updates and failed-save drafts.');
(async()=>{
  const copy=app=>app.ids['#copy-monthly-report'].handlers.click();
  let resolveCopy,copied='';const asyncCopy=boot(null,{entries:[],monthly:fixedMonthly,navigator:{clipboard:{writeText(text){copied=text;return new Promise(resolve=>{resolveCopy=resolve;});}}}});
  assert.equal(copied,'');const pending=copy(asyncCopy);assert.match(copied,/Всего просмотрено: 0/);assert.equal(asyncCopy.ids['#monthly-copy-status'].textContent,'');assert.equal(asyncCopy.ids['#copy-monthly-report'].disabled,true);resolveCopy();await pending;assert.equal(asyncCopy.ids['#monthly-copy-status'].textContent,'Отчёт скопирован');assert.equal(asyncCopy.ids['#copy-monthly-report'].disabled,false);
  const pendingStale=copy(asyncCopy);changeMonth(asyncCopy,'2026-10');resolveCopy();await pendingStale;assert.equal(asyncCopy.ids['#monthly-copy-status'].textContent,'');
  for(const navigator of [undefined,{clipboard:{writeText:async()=>{throw Error('denied');}}}]){const fallback=boot(null,{entries:monthEntries,monthly:fixedMonthly,navigator});await copy(fallback);assert.equal(fallback.ids['#monthly-copy-fallback'].hidden,false);assert.equal(fallback.ids['#monthly-report'].value,report);assert.equal(fallback.ids['#monthly-report'].selected,true);assert.equal(fallback.document.activeElement,fallback.ids['#monthly-report']);assert.match(fallback.ids['#monthly-copy-status'].textContent,/Ctrl\+C или Command\+C/);changeMonth(fallback,'2026-10');assert.equal(fallback.ids['#monthly-copy-fallback'].hidden,true);}
  console.log('PASS: clipboard success awaits confirmation, zero reports, unavailable/denied clipboard manual fallback, selection/focus and stale-period completion protection.');
})();

// Independent imported ratings and explicit duration units survive all catalog operations.
const dual=boot(null,{entries:[],onlineSearch:{getMetadata:()=>({poiskkinoId:301,kpRating:8.501,imdbRating:8.7})}});
dual.submit({...valid,catalogRating:'',category:'Мультфильм',duration:'2',durationUnit:'seasons',status:'watched',personalRating:'9.0'});
assert.equal(dual.saved()[0].catalogRating,null);assert.equal(dual.saved()[0].kpRating,8.501);assert.equal(dual.saved()[0].imdbRating,8.7);assert.equal(dual.saved()[0].durationUnit,'seasons');assert.equal(dual.saved()[0].rating,9);
assert.equal(dual.list.children[0].querySelector('.entry-source-ratings').children[0].textContent,'КП: 8.5');assert.equal(dual.list.children[0].querySelector('.entry-source-ratings').children[1].textContent,'IMDb: 8.7');assert.match(dual.list.children[0].querySelector('.entry-details').textContent,/2 сезона/);assert.equal(dual.list.children[0].querySelector('.entry-source').textContent,'Данные ПоискКино');
dual.favorite(0);dual.view('favorites');assert.equal(dual.list.children[0].querySelector('.entry-source-ratings').hidden,false);dual.view('best');assert.equal(dual.count(),'1');
const dualReload=boot(null,{entries:dual.saved()});assert.equal(dualReload.list.children[0].querySelector('.entry-source-ratings').children[1].textContent,'IMDb: 8.7');dualReload.list.children[0].querySelector('.delete-button').click();dualReload.ids['#form-message'].children[0].click();assert.equal(dualReload.saved()[0].poiskkinoId,301);
const noScores=boot(null,{entries:[{...dual.saved()[0],kpRating:0,imdbRating:null}]});assert.equal(noScores.list.children[0].querySelector('.entry-source-ratings').children[0].textContent,'КП: —');assert.equal(noScores.list.children[0].querySelector('.entry-source-ratings').children[1].textContent,'IMDb: —');
const minutesSeries=boot();minutesSeries.submit({...valid,category:'Сериал',durationUnit:'minutes'});assert.equal(minutesSeries.saved()[0].durationUnit,'minutes');assert.match(minutesSeries.list.children[0].querySelector('.entry-details').textContent,/120 мин/);
const invalidDual=boot(null,{entries:[{...dual.saved()[0],poiskkinoId:'javascript:evil'}]});assert.equal(invalidDual.list.children[0].querySelector('.entry-source-ratings').hidden,true);
console.log('PASS: independent KP/IMDb, missing scores, optional manual score, explicit minutes/seasons, reload/favorites/best/delete/undo and safe source IDs.');
