(function(){
'use strict';
var $=function(id){return document.getElementById(id)};
var ACCENTS=['#7862a5','#b6577a','#496f8f','#4f7c67','#a46d35','#555555'];
var DEFAULT_SETTINGS={theme:'system',font:'system',scale:100,contrast:false,accent:'#7862a5',ttsLong:false,ttsRate:1,gender:'male',address:'informal',profileName:'',contactName:'',contactPhone:''};



function uid(p){return (p||'id')+'_'+Math.random().toString(36).slice(2,9)+Date.now().toString(36)}
function clone(x){return JSON.parse(JSON.stringify(x))}
function normalizeForms(x){if(!x||typeof x!=='object'||Array.isArray(x))return null;var out={};['male','female','they','it','neutral'].forEach(function(k){if(x[k]!=null)out[k]=String(x[k])});return Object.keys(out).length?out:null}
function normalizeAddressForms(x){if(!x||typeof x!=='object'||Array.isArray(x))return null;var out={};['informal','formal'].forEach(function(k){if(x[k]!=null)out[k]=String(x[k])});return Object.keys(out).length?out:null}
function normalizeCard(c){
 var out={id:c.id||uid('c'),type:c.type==='choice'?'choice':'plain',cat:String(c.cat||'без раздела'),long:String(c.long||''),star:!!c.star,quick:!!c.quick,emergency:!!c.emergency,dynamic:c.dynamic?String(c.dynamic):''};
 out.longForms=normalizeForms(c.longForms);out.longAddress=normalizeAddressForms(c.longAddress);
 if(out.type==='choice'){out.prefix=String(c.prefix||c.short||'').trim();out.suffix=String(c.suffix||'');out.prefixForms=normalizeForms(c.prefixForms);out.suffixForms=normalizeForms(c.suffixForms);out.prefixAddress=normalizeAddressForms(c.prefixAddress);out.suffixAddress=normalizeAddressForms(c.suffixAddress);out.options=Array.isArray(c.options)?c.options.map(String).map(function(x){return x.trim()}).filter(Boolean):[];out.multi=!!c.multi;out.other=!!c.other;}
 else{out.short=String(c.short||'').trim();out.shortForms=normalizeForms(c.shortForms);out.shortAddress=normalizeAddressForms(c.shortAddress);}
 return out;
}
function normalizeSet(s){return {id:s.id||uid('set'),name:String(s.name||'набор'),author:String(s.author||''),description:String(s.description||''),cards:(s.cards||[]).map(normalizeCard)}}
function storageGet(){try{return JSON.parse(localStorage.getItem('communication_cards_v9')||localStorage.getItem('communication_cards_v8')||localStorage.getItem('communication_cards_v7')||localStorage.getItem('communication_cards_v6')||localStorage.getItem('communication_cards_v5')||localStorage.getItem('communication_cards_v4')||'null')}catch(e){return null}}
var stored=storageGet();
var state={cards:stored&&Array.isArray(stored.cards)?stored.cards.map(normalizeCard):[],savedSets:stored&&Array.isArray(stored.savedSets)?stored.savedSets.map(normalizeSet):[],settings:Object.assign({},DEFAULT_SETTINGS,stored&&stored.settings||{}),view:'my',myCat:'все',activeSetId:null,setCat:'все',editing:null,editingType:'plain',editingTarget:'mine',editingSetId:null,currentCard:null,currentSource:'mine',choiceSelected:[],choiceOther:''};
function currentPayload(){return {cards:state.cards,savedSets:state.savedSets,settings:state.settings}}
var backupTimer=null;
var backupDbPromise=null;
function openBackupDb(){
 if(!('indexedDB' in window))return Promise.reject(new Error('indexeddb unavailable'));
 if(backupDbPromise)return backupDbPromise;
 backupDbPromise=new Promise(function(resolve,reject){
   var req=indexedDB.open('communication_cards_v9_backup',1);
   req.onupgradeneeded=function(){var db=req.result;if(!db.objectStoreNames.contains('backups'))db.createObjectStore('backups',{keyPath:'id'})};
   req.onsuccess=function(){resolve(req.result)};req.onerror=function(){reject(req.error)};
 });
 return backupDbPromise;
}
function writeIndexedBackup(data){
 openBackupDb().then(function(db){
   var now=Date.now();var tx=db.transaction('backups','readwrite');var st=tx.objectStore('backups');
   st.put({id:'latest',ts:now,data:data});
   var last=Number(localStorage.getItem('communication_cards_v9_snapshot_ts')||0);
   if(now-last>300000){
     st.put({id:'snapshot_'+now,ts:now,data:data});
     localStorage.setItem('communication_cards_v9_snapshot_ts',String(now));
     var all=st.getAll();all.onsuccess=function(){var snaps=(all.result||[]).filter(function(x){return String(x.id).indexOf('snapshot_')===0}).sort(function(a,b){return b.ts-a.ts});snaps.slice(10).forEach(function(x){st.delete(x.id)})};
   }
 }).catch(function(){});
}
function queueIndexedBackup(data){clearTimeout(backupTimer);backupTimer=setTimeout(function(){writeIndexedBackup(clone(data))},250)}
function save(){var data=currentPayload();localStorage.setItem('communication_cards_v9',JSON.stringify(data));queueIndexedBackup(data)}
function restoreIndexedBackupIfNeeded(){
 if(stored)return Promise.resolve(false);
 return openBackupDb().then(function(db){return new Promise(function(resolve){var tx=db.transaction('backups','readonly');var req=tx.objectStore('backups').get('latest');req.onsuccess=function(){var rec=req.result;if(!rec||!rec.data)return resolve(false);var d=rec.data;state.cards=Array.isArray(d.cards)?d.cards.map(normalizeCard):[];state.savedSets=Array.isArray(d.savedSets)?d.savedSets.map(normalizeSet):[];state.settings=Object.assign({},DEFAULT_SETTINGS,d.settings||{});localStorage.setItem('communication_cards_v9',JSON.stringify(currentPayload()));resolve(true)};req.onerror=function(){resolve(false)}})}).catch(function(){return false});
}
function updateStorageStatus(){
 var el=$('storageStatus');if(!el)return;
 if(!navigator.storage||!navigator.storage.persisted){el.textContent='автосохранение включено; постоянное хранилище не поддерживается этим браузером';return Promise.resolve(false)}
 return navigator.storage.persisted().then(function(ok){el.textContent=ok?'автосохранение включено; локальные данные защищены от автоматической очистки браузером':'автосохранение включено; для дополнительной защиты можно запросить постоянное хранилище';return ok}).catch(function(){el.textContent='автосохранение включено';return false});
}
function requestPersistentStorage(){
 if(!navigator.storage||!navigator.storage.persist){toast('постоянное хранилище не поддерживается');return}
 navigator.storage.persist().then(function(ok){updateStorageStatus();toast(ok?'локальное хранилище защищено':'браузер не разрешил постоянное хранилище')}).catch(function(){toast('не получилось изменить режим хранения')});
}
function escapeHTML(s){return String(s).replace(/[&<>'"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]})}
function toast(t){var el=$('toast');el.textContent=t;el.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(function(){el.classList.remove('show')},1500)}
function themeActual(){if(state.settings.theme==='system')return window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';return state.settings.theme}
function applySettings(){var r=document.documentElement;r.setAttribute('data-theme',themeActual());r.setAttribute('data-font',state.settings.font);r.setAttribute('data-contrast',state.settings.contrast?'high':'normal');r.style.setProperty('--scale',state.settings.scale/100);r.style.setProperty('--accent',state.settings.accent)}
function allSets(){return BUILTIN_SETS.map(normalizeSet).concat(state.savedSets)}
function findSet(id){return allSets().find(function(s){return s.id===id})}
function isSavedSet(id){return state.savedSets.some(function(s){return s.id===id})}
function findSavedSet(id){return state.savedSets.find(function(s){return s.id===id})}
function genderValue(forms,fallback){if(forms&&typeof forms==='object'){return forms[state.settings.gender]||forms.male||forms.female||forms.they||forms.it||forms.neutral||fallback||''}return fallback||''}
function addressValue(forms,fallback){if(forms&&typeof forms==='object'){return forms[state.settings.address]||forms.informal||forms.formal||fallback||''}return fallback||''}
function dynamicValue(c,fallback){if(c.dynamic==='profile-name'){var n=String(state.settings.profileName||'').trim();return n?'меня зовут '+n:'меня зовут…'}return fallback||''}
function shortText(c){return dynamicValue(c,addressValue(c.shortAddress,genderValue(c.shortForms,c.short)))}
function longText(c){return addressValue(c.longAddress,genderValue(c.longForms,c.long))}
function prefixText(c){return addressValue(c.prefixAddress,genderValue(c.prefixForms,c.prefix))}
function suffixText(c){return addressValue(c.suffixAddress,genderValue(c.suffixForms,c.suffix))}
function cardLabel(c){return c.type==='choice'?(prefixText(c)+' …'):shortText(c)}
function dedupeKey(c){return c.type+'|'+c.cat+'|'+(c.type==='choice'?(prefixText(c)+'|'+suffixText(c)+'|'+(c.options||[]).join('|')):shortText(c))}
function addCardToMine(card){var c=normalizeCard(clone(card));c.id=uid('c');c.star=false;c.quick=false;if(state.cards.some(function(x){return dedupeKey(x)===dedupeKey(c)})){toast('такая карточка уже есть');return}state.cards.push(c);save();renderMy();toast('добавлено')}
function addWholeSetToMine(set){var added=0;set.cards.forEach(function(c){var n=normalizeCard(clone(c));if(!state.cards.some(function(x){return dedupeKey(x)===dedupeKey(n)})){n.id=uid('c');n.star=false;n.quick=false;state.cards.push(n);added++}});save();renderMy();toast(added?'добавлено: '+added:'новых карточек нет')}

function categories(cards){var arr=[];cards.forEach(function(c){if(arr.indexOf(c.cat)<0)arr.push(c.cat)});return arr}
function renderChips(el,cats,active,onPick,extras){el.innerHTML='';var vals=(extras||[]).concat(['все']).concat(cats);var seen={};vals.forEach(function(cat){if(seen[cat])return;seen[cat]=1;var b=document.createElement('button');b.className='chip'+(cat===active?' active':'');b.textContent=cat;b.onclick=function(){onPick(cat)};el.appendChild(b)})}
function renderMy(){
 var list=state.cards.slice();var extras=[];if(state.cards.some(function(c){return c.star}))extras.push('★ избранное');if(state.cards.some(function(c){return c.quick}))extras.push('⚡ быстрые');
 renderChips($('myChips'),categories(list),state.myCat,function(cat){state.myCat=cat;renderMy()},extras);
 if(state.myCat==='★ избранное')list=list.filter(function(c){return c.star});else if(state.myCat==='⚡ быстрые')list=list.filter(function(c){return c.quick});else if(state.myCat!=='все')list=list.filter(function(c){return c.cat===state.myCat});
 var g=$('myGrid');g.innerHTML='';if(!list.length){g.innerHTML='<div class="empty">здесь пока нет карточек. добавь готовые из «наборов» или создай свою.</div>';return}
 list.forEach(function(c){g.appendChild(cardNode(c,'mine'))})
}
function cardNode(c,source,setId){var d=document.createElement('div');d.className='card';var typeSub=c.type==='choice'?' · с вариантами':'';var editableSet=source==='set'&&isSavedSet(setId);var actions='';if(source==='mine')actions='<button class="tiny edit">редактировать</button><button class="tiny to-set">в набор</button>';else if(editableSet)actions='<button class="tiny primary add">＋ себе</button><button class="tiny edit-set-card">редактировать</button><button class="tiny remove-set-card">удалить из набора</button>';else actions='<button class="tiny primary add">＋ себе</button>';d.innerHTML='<div class="card-row"><button class="card-main"><span>'+escapeHTML(cardLabel(c))+'</span><div class="card-sub">'+escapeHTML(c.cat)+typeSub+'</div></button>'+(source==='mine'?'<button class="mini star '+(c.star?'on':'')+'" title="избранное">'+(c.star?'★':'☆')+'</button><button class="mini quick '+(c.quick?'on':'')+'" title="быстрый доступ">⚡</button>':'')+'</div><div class="card-actions">'+actions+'</div>';
 d.querySelector('.card-main').onclick=function(){openCard(c,source)};
 if(source==='mine'){
  d.querySelector('.star').onclick=function(){c.star=!c.star;save();renderMy()};
  d.querySelector('.quick').onclick=function(){c.quick=!c.quick;save();renderMy()};
  d.querySelector('.edit').onclick=function(){editCard(c.id,null)};
  d.querySelector('.to-set').onclick=function(){addMineCardToSet(c)};
 }else{
  d.querySelector('.add').onclick=function(){addCardToMine(c)};
  if(editableSet){d.querySelector('.edit-set-card').onclick=function(){editCard(c.id,setId)};d.querySelector('.remove-set-card').onclick=function(){removeCardFromSet(setId,c.id)}}
 }
 return d}

function renderSets(){var q=$('setsSearch').value.trim().toLowerCase();var box=$('setsList');box.innerHTML='';var sets=allSets().filter(function(s){return !q||[s.name,s.author,s.description].join(' ').toLowerCase().indexOf(q)>=0});if(!sets.length){box.innerHTML='<div class="empty">ничего не найдено</div>';return}sets.forEach(function(s){var el=document.createElement('div');el.className='set-card';var isBuilt=String(s.id).indexOf('builtin-')===0;el.innerHTML='<div class="set-title">'+escapeHTML(s.name)+'</div><div class="set-meta">'+(s.author?escapeHTML(s.author)+' · ':'')+s.cards.length+' карточек</div><div class="set-desc">'+escapeHTML(s.description)+'</div><div class="set-actions"><button class="tiny open">посмотреть</button><button class="tiny primary add">добавить весь</button>'+(isBuilt?'<button class="tiny copy">сделать копию</button>':'<button class="tiny edit-set">редактировать</button><button class="tiny share">поделиться</button><button class="tiny code">код</button><button class="tiny delete-set">удалить</button>')+'</div>';el.querySelector('.open').onclick=function(){openSet(s.id)};el.querySelector('.add').onclick=function(){addWholeSetToMine(s)};if(isBuilt){el.querySelector('.copy').onclick=function(){copySetEditable(s)}}else{el.querySelector('.edit-set').onclick=function(){editSetMeta(s.id)};el.querySelector('.share').onclick=function(){shareSet(s)};el.querySelector('.code').onclick=function(){showSetCode(s)};el.querySelector('.delete-set').onclick=function(){deleteSet(s.id)}}box.appendChild(el)})}
function openSet(id){state.activeSetId=id;state.setCat='все';var s=findSet(id);if(!s)return;var editable=isSavedSet(id);$('setPreview').hidden=false;$('setPreviewName').textContent=s.name;$('setPreviewMeta').textContent=(s.author?s.author+' · ':'')+s.cards.length+' карточек';$('setPreviewDesc').textContent=s.description;$('setSearch').value='';$('setNewCard').hidden=!editable;$('setEditMeta').hidden=!editable;$('setDelete').hidden=!editable;$('setCopyEditable').hidden=editable;renderSetCards(s);$('setPreview').scrollIntoView({behavior:'smooth',block:'start'})}
function renderSetCards(s){var list=s.cards.slice();var q=$('setSearch').value.trim().toLowerCase();if(q)list=list.filter(function(c){return [cardLabel(c),longText(c),c.cat,(c.options||[]).join(' ')].join(' ').toLowerCase().indexOf(q)>=0});renderChips($('setChips'),categories(list),state.setCat,function(cat){state.setCat=cat;renderSetCards(s)});if(state.setCat!=='все')list=list.filter(function(c){return c.cat===state.setCat});var g=$('setGrid');g.innerHTML='';if(!list.length){g.innerHTML='<div class="empty">ничего не найдено</div>';return}list.forEach(function(c){g.appendChild(cardNode(c,'set',s.id))})}

function showView(v){state.view=v;document.querySelectorAll('.view').forEach(function(x){x.classList.remove('active')});$('view-'+v).classList.add('active');document.querySelectorAll('#nav button').forEach(function(b){b.classList.toggle('active',b.getAttribute('data-view')===v)});if(v==='my')renderMy();if(v==='sets')renderSets();if(v==='settings')syncSettings();if(v==='create'&&!state.editing)updateEditorPreview();window.scrollTo({top:0,behavior:'smooth'})}

function appendSuffix(base,suffix){suffix=String(suffix||'');if(!suffix)return base;if(/^[,.;:!?)]/.test(suffix))return base+suffix;return base+' '+suffix}
function composeChoice(c,spoken){var prefix=prefixText(c),suffix=suffixText(c),sel=state.choiceSelected.slice();if(state.choiceOther)sel.push(state.choiceOther);if(!sel.length)return appendSuffix(prefix+'…',suffix);var body;if(sel.length===1)body=prefix+' '+sel[0];else body=prefix+': '+sel.join(spoken?' и ':' + ');return appendSuffix(body,suffix)}
function currentText(c,spoken){if(c.type==='choice')return composeChoice(c,spoken);return shortText(c)}
function openCard(card,source){state.currentCard=card;state.currentSource=source;state.choiceSelected=[];state.choiceOther='';fillOverlay(card);$('editCard').style.display=source==='mine'?'inline-block':'none'}
function openStandalone(text){openCard({id:null,type:'plain',cat:'быстрый ответ',short:text,long:'',star:false,quick:false},'standalone')}
function fillOverlay(c){$('displayShort').textContent=currentText(c,false);$('displayLong').textContent=longText(c)||'';$('displayLong').classList.remove('show');$('toggleDetails').textContent='подробнее';$('starCard').style.visibility=state.currentSource==='mine'?'visible':'hidden';$('starCard').textContent=c.star?'★':'☆';$('contactPanel').hidden=true;var hasContact=String(state.settings.contactPhone||'').trim().length>0;$('showContact').hidden=!(c.emergency&&hasContact);$('showContact').textContent='показать экстренный контакт';renderChoiceArea(c);$('cardOverlay').classList.add('show');$('cardOverlay').setAttribute('aria-hidden','false')}
function renderChoiceArea(c){var area=$('choiceArea'),box=$('choiceOptions');box.innerHTML='';if(c.type!=='choice'){area.classList.remove('show');return}area.classList.add('show');(c.options||[]).forEach(function(opt){var b=document.createElement('button');b.className='choice-option'+(state.choiceSelected.indexOf(opt)>=0?' selected':'');b.textContent=opt;b.onclick=function(){selectChoice(c,opt)};box.appendChild(b)});if(c.other){var add=document.createElement('button');add.className='choice-add';add.textContent='＋ другое';add.onclick=function(){var v=prompt('напиши свой вариант:');if(v&&v.trim()){state.choiceOther=v.trim();if(!c.multi)state.choiceSelected=[];refreshChoice(c)}};box.appendChild(add)}$('choiceHelp').textContent=c.multi?'можно выбрать несколько: каждый следующий вариант добавится через +.':'выбери один вариант.'}
function selectChoice(c,opt){var i=state.choiceSelected.indexOf(opt);if(c.multi){if(i>=0)state.choiceSelected.splice(i,1);else state.choiceSelected.push(opt)}else{state.choiceSelected=i>=0?[]:[opt];state.choiceOther=''}refreshChoice(c)}
function refreshChoice(c){$('displayShort').textContent=currentText(c,false);renderChoiceArea(c)}
function closeCard(){if('speechSynthesis' in window)window.speechSynthesis.cancel();$('cardOverlay').classList.remove('show');$('cardOverlay').setAttribute('aria-hidden','true');state.currentCard=null;state.currentSource=null;state.choiceSelected=[];state.choiceOther=''}
function speak(c){if(!('speechSynthesis' in window)){toast('tts не поддерживается этим браузером');return}window.speechSynthesis.cancel();var detail=longText(c);var txt=currentText(c,true)+(state.settings.ttsLong&&detail?' . '+detail:'');var u=new SpeechSynthesisUtterance(txt.replace(/…/g,''));u.lang='ru-RU';u.rate=Number(state.settings.ttsRate)||1;window.speechSynthesis.speak(u)}
function cardText(c){var detail=longText(c);return currentText(c,false)+(detail?'\n\n'+detail:'')}
async function copyText(t){try{await navigator.clipboard.writeText(t)}catch(e){window.prompt('скопируй текст:',t)}}
async function shareText(t){try{if(navigator.share){await navigator.share({text:t})}else{await copyText(t);toast('скопировано')}}catch(e){}}

function setEditorType(type){state.editingType=type;document.querySelectorAll('.type-btn').forEach(function(b){b.classList.toggle('active',b.getAttribute('data-type')===type)});$('plainFields').hidden=type!=='plain';$('choiceFields').hidden=type!=='choice';updateEditorPreview()}
function editorCategoryPool(){
 var list=[];
 function add(v){v=String(v||'').trim();if(v&&list.indexOf(v)<0)list.push(v)}
 state.cards.forEach(function(c){add(c.cat)});
 BUILTIN_SETS.forEach(function(s){s.cards.forEach(function(c){add(c.cat)})});
 if(state.editingTarget==='set'&&state.editingSetId){var set=findSavedSet(state.editingSetId);if(set)set.cards.forEach(function(c){add(c.cat)})}
 return list.sort(function(a,b){return a.localeCompare(b,'ru')});
}
function refreshCategoryOptions(selected){
 var sel=$('fCategorySelect'),vals=editorCategoryPool();selected=String(selected||'').trim();
 if(selected&&vals.indexOf(selected)<0)vals.unshift(selected);
 sel.innerHTML='';
 vals.forEach(function(v){var o=document.createElement('option');o.value=v;o.textContent=v;sel.appendChild(o)});
 var n=document.createElement('option');n.value='__new__';n.textContent='＋ новый раздел';sel.appendChild(n);
 if(selected){sel.value=selected}else if(vals.length){sel.value=vals[0]}else{sel.value='__new__'}
 toggleNewCategory();
}
function toggleNewCategory(){
 var isNew=$('fCategorySelect').value==='__new__';$('newCategoryWrap').hidden=!isNew;if(isNew&&document.activeElement===$('fCategorySelect'))setTimeout(function(){$('fCategoryNew').focus()},0)
}
function editorCategory(){
 return $('fCategorySelect').value==='__new__'?$('fCategoryNew').value.trim():$('fCategorySelect').value.trim()
}
function clearEditor(){state.editing=null;state.editingType='plain';state.editingTarget='mine';state.editingSetId=null;$('editorTitle').textContent='новая карточка';$('cardForm').reset();$('deleteCard').hidden=true;$('advancedOptions').open=false;$('fCategoryNew').value='';refreshCategoryOptions('');setEditorType('plain')}
function startNewSetCard(setId){clearEditor();state.editingTarget='set';state.editingSetId=setId;$('editorTitle').textContent='новая карточка в наборе';showView('create')}
function editCard(id,setId){var c;if(setId){var set=findSavedSet(setId);c=set&&set.cards.find(function(x){return x.id===id});state.editingTarget='set';state.editingSetId=setId}else{c=state.cards.find(function(x){return x.id===id});state.editingTarget='mine';state.editingSetId=null}if(!c)return;state.editing=id;state.editingType=c.type;$('editorTitle').textContent=setId?'редактировать карточку набора':'редактировать карточку';$('fShort').value=c.short||'';$('fPrefix').value=c.prefix||'';$('fSuffix').value=c.suffix||'';$('fOptions').value=(c.options||[]).join('\n');$('fMulti').checked=!!c.multi;$('fOther').checked=!!c.other;$('fLong').value=c.long||'';$('fCategoryNew').value='';refreshCategoryOptions(c.cat||'');$('fStar').checked=!!c.star;$('fQuick').checked=!!c.quick;$('fEmergency').checked=!!c.emergency;$('advancedOptions').open=!!(c.star||c.quick||c.emergency);$('deleteCard').hidden=false;closeCard();setEditorType(c.type);showView('create');updateEditorPreview()}
function editorData(){var type=state.editingType,data={type:type,cat:editorCategory(),long:$('fLong').value.trim(),star:$('fStar').checked,quick:$('fQuick').checked,emergency:$('fEmergency').checked};if(type==='choice'){data.prefix=$('fPrefix').value.trim();data.suffix=$('fSuffix').value;data.options=$('fOptions').value.split(/\n/).map(function(x){return x.trim()}).filter(Boolean);data.multi=$('fMulti').checked;data.other=$('fOther').checked}else data.short=$('fShort').value.trim();return data}
function updateEditorPreview(){var d=editorData(),txt;if(d.type==='choice'){txt=(d.prefix||'фраза')+(d.options&&d.options[0]?' '+d.options[0]:' …');txt=appendSuffix(txt,d.suffix)}else txt=d.short||'карточка';$('editorPreviewText').textContent=txt;var box=$('editorPreviewOptions');box.innerHTML='';if(d.type==='choice')(d.options||[]).slice(0,7).forEach(function(o){var s=document.createElement('span');s.className='option-pill';s.textContent=o;box.appendChild(s)})}
function saveEditor(e){e.preventDefault();var data=editorData();if(!data.cat)return alert('добавь раздел.');if(data.type==='plain'&&!data.short)return alert('добавь текст карточки.');if(data.type==='choice'&&(!data.prefix||!data.options.length))return alert('добавь фразу и хотя бы один вариант.');var returnSetId=state.editingTarget==='set'?state.editingSetId:null;if(state.editingTarget==='set'){var set=findSavedSet(state.editingSetId);if(!set)return alert('набор не найден.');if(state.editing){var c=set.cards.find(function(x){return x.id===state.editing});if(c){var id=c.id;Object.keys(c).forEach(function(k){delete c[k]});Object.assign(c,normalizeCard(Object.assign({id:id},data)))}}else set.cards.push(normalizeCard(Object.assign({id:uid('sc')},data)))}else{if(state.editing){var c2=state.cards.find(function(x){return x.id===state.editing});if(c2){var id2=c2.id;Object.keys(c2).forEach(function(k){delete c2[k]});Object.assign(c2,normalizeCard(Object.assign({id:id2},data)))}}else state.cards.push(normalizeCard(Object.assign({id:uid('c')},data)))}save();clearEditor();if(returnSetId){showView('sets');openSet(returnSetId)}else showView('my');toast('карточка сохранена')}
function deleteEditing(){if(!state.editing)return;if(!confirm('удалить эту карточку?'))return;var returnSetId=state.editingTarget==='set'?state.editingSetId:null;if(returnSetId){var set=findSavedSet(returnSetId);if(set)set.cards=set.cards.filter(function(c){return c.id!==state.editing})}else state.cards=state.cards.filter(function(c){return c.id!==state.editing});save();clearEditor();if(returnSetId){showView('sets');openSet(returnSetId)}else showView('my');toast('удалено')}

function openQuick(){var list=state.cards.filter(function(c){return c.quick});var grid=$('quickGrid');grid.innerHTML='';if(!list.length){grid.innerHTML='<div class="empty">быстрый доступ пока пуст. отметь нужные карточки значком ⚡ в разделе «мои».</div>';$('quickOverlay').classList.add('show');return}list.slice(0,12).forEach(function(c){var b=document.createElement('button');b.className='quick-card';b.textContent=cardLabel(c);b.onclick=function(){$('quickOverlay').classList.remove('show');openCard(c,'mine')};grid.appendChild(b)});$('quickOverlay').classList.add('show')}

function addMineCardToSet(card){if(!state.savedSets.length)return alert('сначала создай или импортируй редактируемый набор.');var lines=state.savedSets.map(function(s,i){return (i+1)+'. '+s.name}).join('\n');var raw=prompt('в какой набор добавить карточку? введи номер:\n\n'+lines);if(raw===null)return;var n=Number(raw);if(!Number.isInteger(n)||n<1||n>state.savedSets.length)return alert('такого номера нет.');var set=state.savedSets[n-1];if(set.cards.some(function(x){return dedupeKey(x)===dedupeKey(card)}))return toast('такая карточка уже есть в наборе');var copy=normalizeCard(clone(card));copy.id=uid('sc');copy.star=false;copy.quick=false;set.cards.push(copy);save();renderSets();toast('добавлено в набор')}
function removeCardFromSet(setId,cardId){var set=findSavedSet(setId);if(!set)return;if(!confirm('удалить эту карточку из набора?'))return;set.cards=set.cards.filter(function(c){return c.id!==cardId});save();renderSets();openSet(setId);toast('карточка удалена из набора')}
function editSetMeta(id){var set=findSavedSet(id);if(!set)return;var name=prompt('название набора:',set.name);if(name===null)return;name=name.trim();if(!name)return alert('название не может быть пустым.');var author=prompt('автор / подпись:',set.author||'');if(author===null)author=set.author;var desc=prompt('описание набора:',set.description||'');if(desc===null)desc=set.description;set.name=name;set.author=String(author||'');set.description=String(desc||'');save();renderSets();openSet(id);toast('набор сохранён')}
function deleteSet(id){var set=findSavedSet(id);if(!set)return;if(!confirm('удалить набор «'+set.name+'»? карточки, которые уже добавлены в «мои», останутся.'))return;state.savedSets=state.savedSets.filter(function(s){return s.id!==id});if(state.activeSetId===id){state.activeSetId=null;$('setPreview').hidden=true}save();renderSets();toast('набор удалён')}
function copySetEditable(set){var copy=normalizeSet(clone(set));copy.id=uid('set');copy.name=(set.name||'набор')+' — копия';copy.cards=copy.cards.map(function(c){var n=normalizeCard(clone(c));n.id=uid('sc');return n});state.savedSets.push(copy);save();renderSets();openSet(copy.id);toast('создана редактируемая копия')}
function makeSetFromMine(){if(!state.cards.length)return alert('сначала добавь хотя бы одну карточку.');var name=prompt('название набора:','мой набор');if(!name)return;var author=prompt('автор / подпись (необязательно):','')||'';var desc=prompt('короткое описание (необязательно):','')||'';state.savedSets.push(normalizeSet({id:uid('set'),name:name,author:author,description:desc,cards:clone(state.cards)}));save();renderSets();toast('набор сохранён')}
function exportableSet(set){var s=clone(set);s.format='communication-cards-set';s.version=8;return s}
function safeFilename(s){return String(s||'cards').toLowerCase().replace(/[^a-zа-яё0-9_-]+/gi,'-').replace(/^-+|-+$/g,'')||'cards'}
function utf8ToB64(s){return btoa(unescape(encodeURIComponent(s)))}function b64ToUtf8(s){return decodeURIComponent(escape(atob(s)))}
function encodeSet(set){return 'CCSET1:'+utf8ToB64(JSON.stringify(exportableSet(set)))}
function decodeSetCode(code){code=code.trim();if(code.indexOf('CCSET1:')===0)return normalizeSet(JSON.parse(b64ToUtf8(code.slice(7))));return normalizeSet(JSON.parse(code))}
function downloadBlob(blob,name){var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(function(){URL.revokeObjectURL(a.href)},1200)}
async function shareSet(set){var data=exportableSet(set),json=JSON.stringify(data,null,2),fileName=safeFilename(set.name)+'.ccset.json';try{if(typeof File!=='undefined'&&navigator.share&&navigator.canShare){var file=new File([json],fileName,{type:'application/json'});if(navigator.canShare({files:[file]})){await navigator.share({title:set.name,text:'набор коммуникационных карточек',files:[file]});return}}if(navigator.share){await navigator.share({title:set.name,text:encodeSet(set)});return}}catch(e){if(e&&e.name==='AbortError')return}downloadBlob(new Blob([json],{type:'application/json'}),fileName);toast('файл набора сохранён')}
function showSetCode(set){var code=encodeSet(set);copyText(code);window.prompt('код набора — можно отправить другому человеку:',code)}
function importSetObject(raw){try{var set=normalizeSet(raw);set.id=uid('set');state.savedSets.push(set);save();renderSets();toast('набор импортирован')}catch(e){alert('не получилось прочитать набор.')}}
function importSetFile(file){var r=new FileReader();r.onload=function(){try{importSetObject(JSON.parse(r.result))}catch(e){alert('не получилось прочитать этот файл набора.')}};r.readAsText(file)}
function importSetCode(){var code=prompt('вставь код набора или json:');if(!code)return;try{var set=decodeSetCode(code);set.id=uid('set');state.savedSets.push(set);save();renderSets();toast('набор импортирован')}catch(e){alert('код набора не распознан.')}}

function restoreLocalSnapshot(){
 openBackupDb().then(function(db){return new Promise(function(resolve){var tx=db.transaction('backups','readonly');var req=tx.objectStore('backups').getAll();req.onsuccess=function(){var snaps=(req.result||[]).filter(function(x){return String(x.id).indexOf('snapshot_')===0}).sort(function(a,b){return b.ts-a.ts});resolve(snaps[0]||null)};req.onerror=function(){resolve(null)}})}).then(function(rec){
   if(!rec||!rec.data){toast('локальных снимков пока нет');return}
   if(!confirm('восстановить последний локальный снимок? текущие карточки, наборы и настройки будут заменены.'))return;
   var d=rec.data;state.cards=Array.isArray(d.cards)?d.cards.map(normalizeCard):[];state.savedSets=Array.isArray(d.savedSets)?d.savedSets.map(normalizeSet):[];state.settings=Object.assign({},DEFAULT_SETTINGS,d.settings||{});save();applySettings();renderMy();renderSets();syncSettings();refreshCategoryOptions('');updateEditorPreview();updateStorageStatus();toast('локальный снимок восстановлен');
 }).catch(function(){toast('не получилось восстановить локальный снимок')});
}
function resetSettings(){
 if(!confirm('сбросить все настройки? карточки и наборы останутся.'))return;
 state.settings=Object.assign({},DEFAULT_SETTINGS);
 save();applySettings();syncSettings();renderMy();renderSets();updateEditorPreview();updateStorageStatus();
 toast('настройки сброшены');
}
function deleteAllUserData(){
 if(!confirm('удалить все карточки, наборы, настройки и локальные резервные копии? это нельзя отменить.'))return;
 if(!confirm('точно удалить все данные этого приложения с устройства?'))return;
 clearTimeout(backupTimer);
 var keys=[];
 for(var i=0;i<localStorage.length;i++){var key=localStorage.key(i);if(key&&key.indexOf('communication_cards_')===0)keys.push(key)}
 keys.forEach(function(key){localStorage.removeItem(key)});
 function reload(){setTimeout(function(){location.reload()},50)}
 if(!('indexedDB' in window)){reload();return}
 var dbNames=['communication_cards_v4_backup','communication_cards_v5_backup','communication_cards_v6_backup','communication_cards_v7_backup','communication_cards_v8_backup','communication_cards_v9_backup'];
 function removeDatabases(){
   var left=dbNames.length;if(!left){reload();return}
   dbNames.forEach(function(name){
     try{
       var req=indexedDB.deleteDatabase(name),done=false;
       var finish=function(){if(done)return;done=true;left--;if(left<=0)reload()};
       req.onsuccess=finish;req.onerror=finish;req.onblocked=finish;setTimeout(finish,500);
     }catch(e){left--;if(left<=0)reload()}
   });
 }
 if(backupDbPromise){backupDbPromise.then(function(db){try{db.close()}catch(e){}backupDbPromise=null;removeDatabases()}).catch(removeDatabases)}else removeDatabases();
}
function syncSettings(){var s=state.settings;$('themeSelect').value=s.theme;$('fontSelect').value=s.font;$('genderSelect').value=s.gender||'male';$('addressSelect').value=s.address||'informal';$('profileName').value=s.profileName||'';$('contactName').value=s.contactName||'';$('contactPhone').value=s.contactPhone||'';$('fontScale').value=s.scale;$('fontScaleValue').textContent=s.scale+'%';$('highContrast').checked=!!s.contrast;$('ttsLong').checked=!!s.ttsLong;$('ttsRate').value=s.ttsRate;$('ttsRateValue').textContent=Number(s.ttsRate).toFixed(1)+'×';renderSwatches()}
function renderSwatches(){var box=$('swatches');box.innerHTML='';ACCENTS.forEach(function(c){var b=document.createElement('button');b.className='swatch';b.style.background=c;b.title=c;if(c===state.settings.accent)b.style.outline='3px solid '+c;b.onclick=function(){state.settings.accent=c;save();applySettings();renderSwatches()};box.appendChild(b)})}
function bindSetting(id,key,transform){$(id).addEventListener('input',function(){state.settings[key]=transform?transform(this):this.value;save();applySettings();if(id==='fontScale')$('fontScaleValue').textContent=state.settings.scale+'%';if(id==='ttsRate')$('ttsRateValue').textContent=Number(state.settings.ttsRate).toFixed(1)+'×'})}
function exportData(){var data={app:'communication-cards',version:9,cards:state.cards,sets:state.savedSets,settings:state.settings};downloadBlob(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),'communication-cards-backup-v9.json')}
function importData(file){var r=new FileReader();r.onload=function(){try{var d=JSON.parse(r.result);if(!Array.isArray(d.cards))throw new Error();if(!confirm('это заменит твои текущие карточки и настройки. продолжить?'))return;state.cards=d.cards.map(normalizeCard);state.savedSets=Array.isArray(d.sets)?d.sets.map(normalizeSet):[];state.settings=Object.assign({},DEFAULT_SETTINGS,d.settings||{});save();applySettings();renderMy();renderSets();syncSettings();toast('резервная копия восстановлена')}catch(e){alert('не получилось прочитать резервную копию.')}};r.readAsText(file)}

$('nav').addEventListener('click',function(e){var b=e.target.closest('button[data-view]');if(b)showView(b.getAttribute('data-view'))});
$('newCardTop').onclick=function(){clearEditor();showView('create')};$('cardForm').onsubmit=saveEditor;$('deleteCard').onclick=deleteEditing;
document.querySelectorAll('.type-btn').forEach(function(b){b.onclick=function(){setEditorType(b.getAttribute('data-type'))}});['fShort','fPrefix','fSuffix','fOptions','fLong','fCategoryNew','fMulti','fOther','fEmergency'].forEach(function(id){$(id).addEventListener('input',updateEditorPreview);$(id).addEventListener('change',updateEditorPreview)});$('fCategorySelect').addEventListener('change',function(){toggleNewCategory();updateEditorPreview()});
$('closeCard').onclick=closeCard;$('showContact').onclick=function(){var phone=String(state.settings.contactPhone||'').trim();if(!phone)return;var panel=$('contactPanel');if(panel.hidden){$('contactDisplayName').textContent=String(state.settings.contactName||'').trim()||'контакт для экстренной связи';$('contactDisplayPhone').textContent=phone;panel.hidden=false;this.textContent='скрыть экстренный контакт'}else{panel.hidden=true;this.textContent='показать экстренный контакт'}};$('toggleDetails').onclick=function(){$('displayLong').classList.toggle('show');this.textContent=$('displayLong').classList.contains('show')?'скрыть':'подробнее'};$('copyCard').onclick=function(){if(state.currentCard){copyText(cardText(state.currentCard));toast('скопировано')}};$('shareCard').onclick=function(){if(state.currentCard)shareText(cardText(state.currentCard))};$('speakCard').onclick=function(){if(state.currentCard)speak(state.currentCard)};$('editCard').onclick=function(){if(state.currentCard&&state.currentCard.id)editCard(state.currentCard.id)};$('starCard').onclick=function(){if(state.currentSource==='mine'&&state.currentCard&&state.currentCard.id){state.currentCard.star=!state.currentCard.star;save();$('starCard').textContent=state.currentCard.star?'★':'☆';renderMy()}};
$('quickOpen').onclick=openQuick;$('closeQuick').onclick=function(){$('quickOverlay').classList.remove('show')};document.querySelectorAll('.answer-btn').forEach(function(b){b.onclick=function(){openStandalone(b.getAttribute('data-answer'))}});
$('saveMySet').onclick=makeSetFromMine;$('setsSearch').oninput=renderSets;$('importSetFileBtn').onclick=function(){$('setFile').click()};$('setFile').onchange=function(){if(this.files&&this.files[0])importSetFile(this.files[0]);this.value=''};$('importSetCodeBtn').onclick=importSetCode;$('addWholeSet').onclick=function(){var s=findSet(state.activeSetId);if(s)addWholeSetToMine(s)};$('setNewCard').onclick=function(){if(state.activeSetId&&isSavedSet(state.activeSetId))startNewSetCard(state.activeSetId)};$('setEditMeta').onclick=function(){if(state.activeSetId)editSetMeta(state.activeSetId)};$('setDelete').onclick=function(){if(state.activeSetId)deleteSet(state.activeSetId)};$('setCopyEditable').onclick=function(){var s=findSet(state.activeSetId);if(s)copySetEditable(s)};$('setSearch').oninput=function(){var s=findSet(state.activeSetId);if(s)renderSetCards(s)};
$('themeQuick').onclick=function(){state.settings.theme=(themeActual()==='dark')?'light':'dark';save();applySettings();syncSettings()};bindSetting('themeSelect','theme');bindSetting('fontSelect','font');$('profileName').addEventListener('input',function(){state.settings.profileName=this.value;save();renderMy();renderSets();if(state.currentCard&&$('cardOverlay').classList.contains('show'))fillOverlay(state.currentCard)});$('addressSelect').addEventListener('input',function(){state.settings.address=this.value;save();renderMy();renderSets();if(state.currentCard&&$('cardOverlay').classList.contains('show'))fillOverlay(state.currentCard);updateEditorPreview()});$('contactName').addEventListener('input',function(){state.settings.contactName=this.value;save()});$('contactPhone').addEventListener('input',function(){state.settings.contactPhone=this.value;save();if(state.currentCard&&$('cardOverlay').classList.contains('show'))fillOverlay(state.currentCard)});$('genderSelect').addEventListener('input',function(){state.settings.gender=this.value;save();renderMy();renderSets();if(state.currentCard&&$('cardOverlay').classList.contains('show'))fillOverlay(state.currentCard);updateEditorPreview()});bindSetting('fontScale','scale',function(el){return Number(el.value)});bindSetting('ttsRate','ttsRate',function(el){return Number(el.value)});$('highContrast').onchange=function(){state.settings.contrast=this.checked;save();applySettings()};$('ttsLong').onchange=function(){state.settings.ttsLong=this.checked;save()};
$('exportBtn').onclick=exportData;$('importBtn').onclick=function(){$('importFile').click()};$('persistBtn').onclick=requestPersistentStorage;$('restoreLocalBtn').onclick=restoreLocalSnapshot;$('importFile').onchange=function(){if(this.files&&this.files[0])importData(this.files[0]);this.value=''};$('resetSettingsBtn').onclick=resetSettings;$('deleteAllDataBtn').onclick=deleteAllUserData;
window.addEventListener('keydown',function(e){if(e.key==='Escape'){closeCard();$('quickOverlay').classList.remove('show')}});if(window.matchMedia){var mq=window.matchMedia('(prefers-color-scheme: dark)');if(mq.addEventListener)mq.addEventListener('change',function(){if(state.settings.theme==='system')applySettings()})}
applySettings();renderMy();renderSets();syncSettings();refreshCategoryOptions('');updateEditorPreview();updateStorageStatus();if(stored)save();restoreIndexedBackupIfNeeded().then(function(restored){if(restored){applySettings();renderMy();renderSets();syncSettings();refreshCategoryOptions('');updateEditorPreview();updateStorageStatus();toast('данные восстановлены из локальной копии')}});if(navigator.storage&&navigator.storage.persist){navigator.storage.persist().then(function(){updateStorageStatus()}).catch(function(){})}if('serviceWorker' in navigator&&location.protocol.indexOf('http')===0){navigator.serviceWorker.register('sw.js').catch(function(){})}
})();
