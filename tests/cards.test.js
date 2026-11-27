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
  const views=['catalog','favorites','best'].map(view=>{const e=new El();e.dataset.view=view;return e;});
  const cats=['all','Фильм','Сериал','Мультфильм'].map(category=>{const e=new El();e.dataset.category=category;return e;});
  ids['[data-view="favorites"]']=views[1];
  ids['[data-view="catalog"]']=views[0];
  ids['[data-view="best"]']=views[2];
  document.querySelector('#entry-template').content={firstElementChild:{cloneNode(){const e=new El('.entry'); e.querySelector('.entry-favorite').kind='.entry-favorite';return e;}}};
  document.querySelector('#review-template').content={firstElementChild:{cloneNode(){return new El('.review-editor');}}};
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
