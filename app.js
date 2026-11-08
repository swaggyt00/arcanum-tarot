import { CARDS } from './cards.js';

const STORAGE = 'arcanum-readings-v1';
const SETTINGS = 'arcanum-settings-v1';
const ACCESS = 'arcanum-ai-access-v1';
const AI_ENDPOINT = 'https://arcanum-tarot-ai.kunicin27522.workers.dev';
const SPREADS = {
  one: ['Главный символ ситуации'],
  three: ['Что привело к ситуации', 'Что происходит сейчас', 'Куда направить внимание'],
  five: ['Суть ситуации', 'Что помогает', 'Что мешает', 'Скрытый фактор', 'Совет и возможный вектор'],
  seven: ['Отправная точка', 'Осознанное желание', 'Внутренний мотив', 'Внешние обстоятельства', 'Главное препятствие', 'Ближайший шаг', 'Потенциал развития']
};
const CATEGORY_NOTES = {
  'Общее': 'Сопоставь смысл карт со своими наблюдениями: что подтверждается фактами, а что пока остаётся гипотезой?',
  'Отношения': 'Чужие чувства нельзя узнать по картам: проверяй взаимность через слова, действия и уважение границ.',
  'Карьера': 'Преврати трактовку в конкретные рабочие критерии: результат, навыки и обратную связь.',
  'Деньги': 'Не принимай финансовых решений только по символам. Проверяй бюджет, риски и реальные договорённости.',
  'Выбор': 'Сравни последствия обоих вариантов и отдели свои ценности от страха ошибиться.'
};
const SUIT_NOTES = {
  'Старшие арканы': 'важные личные темы и привычные жизненные сценарии',
  'Жезлов': 'инициатива, энергия, амбиции и поступки',
  'Кубков': 'чувства, близость, эмпатия и эмоциональные ожидания',
  'Мечей': 'мышление, границы, сомнения и сложные решения',
  'Пентаклей': 'работа, ресурсы, стабильность и конкретные результаты'
};
const $ = (selector) => document.querySelector(selector);
let category = 'Общее';
let spread = 'three';
let reading = null;
let toastTimeout;

const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const getHistory = () => { try { const data=JSON.parse(localStorage.getItem(STORAGE)||'[]');return Array.isArray(data)?data:[];}catch{return [];} };
const getSettings = () => { try { return JSON.parse(localStorage.getItem(SETTINGS)||'{}'); } catch {return {};}};
function notify(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>el.classList.remove('show'),3200);}
function randomBelow(max){
  if (!window.crypto?.getRandomValues) throw new Error('Для случайной вытяжки необходим безопасный HTTPS-контекст.');
  const lim = 0x100000000 - (0x100000000 % max);
  const buf = new Uint32Array(1);
  do { crypto.getRandomValues(buf); } while (buf[0] >= lim);
  return buf[0] % max;
}
function randomCards(n){
  const ids=CARDS.map(c=>c.id);
  for(let i=ids.length-1;i>0;i--){const j=randomBelow(i+1);[ids[i],ids[j]]=[ids[j],ids[i]];}
  return ids.slice(0,n).map(id=>({id,reversed:randomBelow(2)===1}));
}
const cardInfo = entry => CARDS.find(c=>c.id===entry.id);
const orientation = entry => entry.reversed?'перевёрнутая':'прямая';
const meaning = entry => { const c=cardInfo(entry); return entry.reversed?c.rev:c.up; };
function buildAnalysis(r){
  const entries=r.cards.map((entry,i)=>({entry,card:cardInfo(entry),position:SPREADS[r.spread][i]}));
  const major=entries.filter(e=>e.card.arcana==='major').length;
  const reverse=entries.filter(e=>e.entry.reversed).length;
  const counts={};entries.forEach(e=>{counts[e.card.suit]=(counts[e.card.suit]||0)+1;});
  const maxCount=Math.max(...Object.values(counts));
  const primary=Object.keys(counts).filter(k=>counts[k]===maxCount);
  const results=[];
  if(major>=2)results.push(`В раскладе ${major} старших аркана: это подчёркивает тему ценностей, внутренних установок и значимых решений.`);
  if(primary.length===1 && maxCount>=2)results.push(`Преобладает масть «${primary[0]}» — символически акцент на теме: ${SUIT_NOTES[primary[0]]}.`);
  if(primary.length>1 || maxCount===1)results.push('Карты относятся к разным мастям: у ситуации несколько сторон, поэтому один простой ответ может быть недостаточен.');
  if(reverse>r.cards.length/2)results.push('Перевёрнутых карт больше половины: в трактовке сильнее звучат внутренние препятствия, паузы и пересмотр привычных реакций.');
  else if(reverse===0)results.push('Все карты прямые: здесь больше символов проявленных возможностей, но действия всё равно зависят от тебя.');
  else results.push('Прямые и перевёрнутые положения соседствуют: возможности и ограничения стоит рассматривать одновременно.');
  return results;
}
function renderInterpretation(r){
  const el=$('#interpretation');el.replaceChildren();
  r.cards.forEach((entry,index)=>{
    const c=cardInfo(entry); const block=document.createElement('div');block.className='position-analysis';
    block.innerHTML=`<h4><span>${index+1}.</span> ${escapeHTML(SPREADS[r.spread][index])} — ${escapeHTML(c.name)}</h4><p>${escapeHTML(meaning(entry))} <span class="subtone">${escapeHTML(c.archetype)}.</span></p>`;
    el.appendChild(block);
  });
  const summary=document.createElement('div');summary.className='analysis-summary';
  const h=document.createElement('h3');h.textContent='Общий смысл расклада';summary.appendChild(h);
  for(const s of buildAnalysis(r)){const p=document.createElement('p');p.textContent=s;summary.appendChild(p);}
  const advice=document.createElement('p');advice.innerHTML=`<strong>Практический фокус.</strong> ${escapeHTML(CATEGORY_NOTES[r.category]||CATEGORY_NOTES['Общее'])}`;summary.appendChild(advice);
  const question=document.createElement('p');question.innerHTML='<strong>Вопрос к себе.</strong> Какой один конкретный шаг можно сделать на основе этого размышления — без предположений о чужих мыслях?';summary.appendChild(question);
  el.appendChild(summary);
}
function renderReading(r,scroll=true){
  reading=r;
  $('#resultSection').classList.remove('hidden');
  $('#resultQuestion').textContent=r.question;
  const grid=$('#cardsGrid');grid.replaceChildren();
  grid.style.setProperty('--card-cols',Math.min(r.cards.length,7));
  r.cards.forEach((entry,i)=>{
    const c=cardInfo(entry);const article=document.createElement('article');article.className='reading-card';article.style.setProperty('--card-index',i);
    article.innerHTML=`<div class="card-art"><img loading="lazy" src="${c.image}" class="${entry.reversed?'reversed':''}" alt="${escapeHTML(c.name)}"><div class="art-fallback"><span>✧</span><strong>${escapeHTML(c.name)}</strong></div></div><div class="card-position">${escapeHTML(SPREADS[r.spread][i])}</div><h4>${escapeHTML(c.name)}</h4><div class="card-orientation">${entry.reversed?'↕ Перевёрнутая':'↑ Прямая'}</div>`;
    const img=article.querySelector('img');
    // Independent CDN fallback if GitHub raw image delivery is blocked or times out.
    let imageRetry=0;
    img.addEventListener('error',()=>{
      if(imageRetry++===0){img.src=`https://cdn.jsdelivr.net/gh/sixseeds/tarot-api@main/cards/${c.id}.jpg`;return;}
      img.style.display='none';article.querySelector('.art-fallback').style.display='flex';
    });
    grid.appendChild(article);
  });
  $('#aiOutput').classList.add('hidden');$('#aiOutput').textContent='';
  renderInterpretation(r);
  if(scroll)$('#resultSection').scrollIntoView({behavior:'smooth',block:'start'});
}
function saveReading(r){
  const all=getHistory();all.unshift(r);
  try{localStorage.setItem(STORAGE,JSON.stringify(all.slice(0,50)));}catch{notify('Не удалось сохранить историю в этом браузере.');}
  updateCount();
}
function updateCount(){$('#journalCount').textContent=getHistory().length;}
function draw(){
  const question=$('#question').value.trim();
  if(question.length<5){notify('Сформулируй вопрос хотя бы в нескольких словах.');$('#question').focus();return;}
  let selected;try{selected=randomCards(SPREADS[spread].length);}catch(e){notify(e.message);return;}
  const r={id:`${Date.now()}-${randomBelow(1000000)}`,createdAt:new Date().toISOString(),question,category,spread,cards:selected};
  saveReading(r);renderReading(r);
}
function toPlainText(r){
  const body=r.cards.map((entry,i)=>`${i+1}. ${SPREADS[r.spread][i]}: ${cardInfo(entry).name} — ${orientation(entry)}\n${meaning(entry)}`).join('\n\n');
  return `ARCANUM · ${new Date(r.createdAt).toLocaleDateString('ru-RU')}\nВопрос: ${r.question}\nТема: ${r.category}\n\n${body}\n\nОбщий смысл:\n${buildAnalysis(r).join('\n')}\n\n${CATEGORY_NOTES[r.category]}\n\nТаро не определяет будущее и чужие мысли.`;
}
function setView(view){
  $('#homeView').classList.toggle('hidden',view!=='home');$('#journalView').classList.toggle('hidden',view!=='journal');
  document.querySelectorAll('[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===view));
  if(view==='journal')renderJournal();window.scrollTo({top:0,behavior:'smooth'});
}
function renderJournal(){
  const list=$('#journalEntries');list.replaceChildren();const history=getHistory();
  if(!history.length){list.innerHTML='<div class="journal-empty">✧<br>Здесь пока тихо.<br>Сделай первый расклад, и он появится в дневнике.</div>';return;}
  for(const r of history){
    if(!r?.cards || !SPREADS[r.spread] || r.cards.some(e=>!cardInfo(e)))continue;
    const row=document.createElement('button');row.className='journal-entry';row.type='button';
    row.innerHTML=`<div class="journal-date"><span>${escapeHTML(new Date(r.createdAt).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'}))}</span><span>${escapeHTML(r.category)} · ${r.cards.length} карт</span></div><h3>${escapeHTML(r.question)}</h3><div class="journal-cards">${r.cards.map(e=>escapeHTML(cardInfo(e).name)+(e.reversed?' ↕':' ↑')).join(' · ')}</div>`;
    row.addEventListener('click',()=>{setView('home');renderReading(r);});list.appendChild(row);
  }
}
function sanitizeEndpoint(str){
  if(!str.trim())return '';
  const u=new URL(str.trim());
  if(u.protocol!=='https:')throw new Error('Адрес должен начинаться с https://');
  if(u.username||u.password)throw new Error('Не вставляй логины, пароли и API-ключи в адрес.');
  return u.toString().replace(/\/$/,'');
}
async function aiInterpret(){
  if(!reading)return;
  const endpoint=getSettings().endpoint||AI_ENDPOINT;
  if(!endpoint){$('#settingsDialog').showModal();notify('Сначала настрой серверный AI-прокси, либо используй бесплатную трактовку ниже карт.');return;}
  const access=sessionStorage.getItem(ACCESS)||'';
  if(!access){$('#settingsDialog').showModal();notify('Введи личный пароль доступа к AI в настройках. Это не ключ Groq.');return;}
  const btn=$('#aiButton'),output=$('#aiOutput');btn.disabled=true;btn.textContent='Думаю над раскладом…';output.classList.remove('hidden');output.textContent='Составляю глубокую интерпретацию…';
  try{
    const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),45000);
    let response;
    try{response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Arcanum-Access':access},body:JSON.stringify({question:reading.question,category:reading.category,cards:reading.cards.map((e,i)=>({name:cardInfo(e).name,position:SPREADS[reading.spread][i],orientation:orientation(e),meaning:meaning(e)}))}),signal:controller.signal});}
    finally{clearTimeout(timer);}
    const json=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(json.error||`Ошибка сервера: ${response.status}`);
    if(typeof json.analysis!=='string'||!json.analysis.trim())throw new Error('Сервер не вернул текст разбора.');
    output.textContent=json.analysis;
  }catch(e){output.textContent='Не удалось выполнить запрос: '+e.message+'. Базовый расклад по-прежнему доступен.';}
  finally{btn.disabled=false;btn.textContent='✧ Глубокий разбор';}
}
function initialize(){
  $('#question').addEventListener('input',()=>$('#questionCounter').textContent=`${$('#question').value.length} / 800`);
  document.querySelectorAll('[data-category]').forEach(btn=>btn.addEventListener('click',()=>{category=btn.dataset.category;document.querySelectorAll('[data-category]').forEach(el=>el.classList.toggle('selected',el===btn));}));
  document.querySelectorAll('[data-spread]').forEach(btn=>btn.addEventListener('click',()=>{spread=btn.dataset.spread;document.querySelectorAll('[data-spread]').forEach(el=>el.classList.toggle('selected',el===btn));}));
  document.querySelectorAll('[data-view]').forEach(btn=>btn.addEventListener('click',()=>setView(btn.dataset.view)));
  $('#drawButton').addEventListener('click',draw);
  $('#againButton').addEventListener('click',()=>{$('#resultSection').classList.add('hidden');$('#question').focus();$('.question-panel').scrollIntoView({behavior:'smooth'});});
  $('#copyResult').addEventListener('click',async()=>{if(!reading)return;try{await navigator.clipboard.writeText(toPlainText(reading));notify('Расклад скопирован.');}catch{notify('Буфер обмена недоступен.');}});
  $('#settingsOpen').addEventListener('click',()=>{$('#endpoint').value=getSettings().endpoint||AI_ENDPOINT;$('#aiAccess').value='';$('#aiAccess').placeholder=sessionStorage.getItem(ACCESS)?'Пароль уже введён для этой вкладки':'Личный пароль Worker';$('#settingsDialog').showModal();});
  $('#settingsClose').addEventListener('click',()=>$('#settingsDialog').close());
  $('#settingsDialog').addEventListener('click',e=>{if(e.target===$('#settingsDialog'))$('#settingsDialog').close();});
  $('#settingsSave').addEventListener('click',()=>{try{const endpoint=sanitizeEndpoint($('#endpoint').value);localStorage.setItem(SETTINGS,JSON.stringify({endpoint}));if($('#aiAccess').value.trim())sessionStorage.setItem(ACCESS,$('#aiAccess').value.trim());$('#aiAccess').value='';$('#settingsDialog').close();notify(endpoint?'AI-прокси сохранён.':'Настройки сохранены.');}catch(e){notify(e.message);}});
  $('#endpointClear').addEventListener('click',()=>{$('#endpoint').value='';$('#aiAccess').value='';localStorage.removeItem(SETTINGS);sessionStorage.removeItem(ACCESS);notify('Адрес и пароль доступа очищены.');});
  $('#aiButton').addEventListener('click',aiInterpret);
  $('#clearJournal').addEventListener('click',()=>{if(confirm('Удалить все сохранённые расклады из этого браузера?')){localStorage.removeItem(STORAGE);renderJournal();updateCount();notify('История удалена.');}});
  updateCount();
}
initialize();