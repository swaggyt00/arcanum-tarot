import { CARDS } from './cards.js';

const STORAGE = 'arcanum-readings-v1';
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
let analysisController = null;
let analysisSequence = 0;

const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const getHistory = () => { try { const data=JSON.parse(localStorage.getItem(STORAGE)||'[]');return Array.isArray(data)?data:[];}catch{return [];} };
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
function makeNode(tag, className='', content=null){
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(content!==null)node.textContent=String(content);
  return node;
}
function setAIState(label,muted=false,loading=false){
  const indicator=$('#aiIndicator');indicator.textContent=label;
  indicator.classList.toggle('is-muted',muted);
  indicator.classList.toggle('is-loading',loading);
}
function setAnalysisActions(retry=false){
  $('#analysisActions').classList.toggle('hidden',!retry);
  $('#retryAI').classList.toggle('hidden',!retry);
}
function renderPending(){
  setAIState('Анализирую карты',false,true);
  $('#aiStatus').classList.add('hidden');
  setAnalysisActions(false);
  const root=$('#interpretation');root.replaceChildren();
  const line=makeNode('div','ai-loading');
  line.appendChild(makeNode('span','ai-pulse','✦'));
  const copy=makeNode('div');
  copy.appendChild(makeNode('strong','','Собираю историю расклада…'));
  copy.appendChild(makeNode('p','','Сопоставляю все карты и отвечаю на твой вопрос.'));
  line.appendChild(copy);root.appendChild(line);
}
function renderStructured(r,a){
  if(!a||typeof a.answer!=='string'||!a.answer.trim()||!Array.isArray(a.cards)||a.cards.length!==r.cards.length)throw new Error('AI вернул неполный разбор. Попробуй ещё раз.');
  setAIState('AI-разбор готов');setAnalysisActions(false);
  $('#aiStatus').classList.add('hidden');
  const root=$('#interpretation');root.replaceChildren();
  const verdict=makeNode('section','ai-verdict');
  verdict.appendChild(makeNode('span','ai-kicker','Главный ответ'));
  verdict.appendChild(makeNode('p','',a.answer));
  root.appendChild(verdict);
  if(a.pattern){
    const block=makeNode('section','ai-connection');
    block.appendChild(makeNode('h4','','Как складывается картина'));
    block.appendChild(makeNode('p','',a.pattern));
    root.appendChild(block);
  }
  const wrap=makeNode('section');
  const heading=makeNode('div','ai-card-heading');
  heading.appendChild(makeNode('h4','','Роль каждой карты'));
  wrap.appendChild(heading);
  const grid=makeNode('div','ai-card-grid');
  r.cards.forEach((entry,i)=>{
    const c=cardInfo(entry),note=makeNode('div','ai-card-note');
    note.appendChild(makeNode('div','ai-position',(i+1)+'. '+SPREADS[r.spread][i]));
    const title=makeNode('h5','',c.name+' · '+orientation(entry));
    note.appendChild(title);
    note.appendChild(makeNode('p','',String(a.cards[i]?.insight||meaning(entry))));
    grid.appendChild(note);
  });
  wrap.appendChild(grid);root.appendChild(wrap);
  if(a.nextStep){
    const step=makeNode('section','ai-conclusion');
    step.appendChild(makeNode('h4','','Что делать дальше'));
    const focus=makeNode('div','ai-practical');
    focus.appendChild(makeNode('p','',a.nextStep));
    step.appendChild(focus);root.appendChild(step);
  }
  root.appendChild(makeNode('p','ai-caveat',a.uncertainty||'Карты предлагают символическую перспективу, а не гарантируют события или чужие решения.'));
}
function renderLegacy(r,raw){
  setAIState('AI-разбор готов');setAnalysisActions(false);$('#aiStatus').classList.add('hidden');
  const root=$('#interpretation');root.replaceChildren();
  const blocks=String(raw).split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean);
  for(const block of blocks){
    if(/^-{2,}$/.test(block))continue;
    const section=makeNode('div','ai-old-section');
    const isHeading=/^#{1,5}\s/.test(block);
    const cleaned=block.replace(/^#{1,5}\s*/,'').replace(/\*\*/g,'').replace(/^\s*[-*]\s+/gm,'• ').trim();
    if(!cleaned)continue;
    section.appendChild(makeNode(isHeading?'h4':'p','',cleaned));
    root.appendChild(section);
  }
}
function renderFallback(r,reason){
  setAIState('Базовый разбор',true,false);setAnalysisActions(true);
  const status=$('#aiStatus');status.textContent=reason;status.classList.remove('hidden');
  const root=$('#interpretation');root.replaceChildren();
  const intro=makeNode('div','ai-verdict');
  intro.appendChild(makeNode('span','ai-kicker','Пока без AI'));
  intro.appendChild(makeNode('p','','Карты уже выпали и сохранены. Ниже — их краткие значения, пока полный анализ недоступен.'));
  root.appendChild(intro);
  const heading=makeNode('div','ai-card-heading');heading.appendChild(makeNode('h4','','Значения выпавших карт'));root.appendChild(heading);
  const grid=makeNode('div','ai-card-grid');
  r.cards.forEach((entry,i)=>{
    const block=makeNode('div','ai-card-note');
    block.appendChild(makeNode('div','ai-position',SPREADS[r.spread][i]));
    block.appendChild(makeNode('h5','',cardInfo(entry).name+' · '+orientation(entry)));
    block.appendChild(makeNode('p','',meaning(entry)));grid.appendChild(block);
  });
  root.appendChild(grid);
  root.appendChild(makeNode('p','ai-fallback-note','Если сервис временно недоступен, можно нажать «Повторить анализ».'));
}
function rememberAnalysis(r,analysis){
  r.ai=analysis;
  try{
    const history=getHistory();
    const index=history.findIndex(item=>item.id===r.id);
    if(index>=0){history[index].ai=analysis;localStorage.setItem(STORAGE,JSON.stringify(history));}
  }catch{notify('AI-разбор показан, но не удалось сохранить его в дневнике.');}
}
function stopAnalysis(){
  analysisSequence++;
  if(analysisController){analysisController.abort();analysisController=null;}
}
function renderReading(r,scroll=true){
  stopAnalysis();
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
  if(r.ai?.answer)renderStructured(r,r.ai);
  else if(r.ai?.legacy)renderLegacy(r,r.ai.legacy);
  else aiInterpret(r,analysisSequence);
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
  const lines=['ARCANUM · '+new Date(r.createdAt).toLocaleDateString('ru-RU'),'Вопрос: '+r.question,'Тема: '+r.category,''];
  if(r.ai?.answer){
    lines.push('Главный ответ:',r.ai.answer,'','Связи карт:',r.ai.pattern||'','');
    r.cards.forEach((entry,i)=>lines.push((i+1)+'. '+SPREADS[r.spread][i]+' — '+cardInfo(entry).name+' ('+orientation(entry)+')',r.ai.cards[i]?.insight||meaning(entry),''));
    lines.push('Что делать дальше:',r.ai.nextStep||'',r.ai.uncertainty||'');
  }else if(r.ai?.legacy){
    lines.push(r.ai.legacy);
  }else{
    r.cards.forEach((entry,i)=>lines.push((i+1)+'. '+SPREADS[r.spread][i]+' — '+cardInfo(entry).name+' ('+orientation(entry)+')',meaning(entry),''));
  }
  return lines.join('\n');
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
async function aiInterpret(r=reading,sequence=analysisSequence){
  if(!r||reading?.id!==r.id)return;
  renderPending();
  const controller=new AbortController();analysisController=controller;
  const timeout=setTimeout(()=>controller.abort(),55000);
  try{
    const response=await fetch(AI_ENDPOINT,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({question:r.question,category:r.category,cards:r.cards.map((entry,i)=>({
        name:cardInfo(entry).name,position:SPREADS[r.spread][i],orientation:orientation(entry),meaning:meaning(entry)
      }))}),signal:controller.signal
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(result.error||'Ошибка AI-сервиса: '+response.status);
    if(controller.signal.aborted||sequence!==analysisSequence||reading?.id!==r.id)return;
    if(result.analysis&&typeof result.analysis==='object'){
      renderStructured(r,result.analysis);rememberAnalysis(r,result.analysis);
    }else if(typeof result.analysis==='string'&&result.analysis.trim()){
      renderLegacy(r,result.analysis);rememberAnalysis(r,{legacy:result.analysis});
    }else throw new Error('Сервер вернул пустой ответ.');
  }catch(err){
    if(controller.signal.aborted&&sequence!==analysisSequence)return;
    if(sequence!==analysisSequence||reading?.id!==r.id)return;
    const message=controller.signal.aborted?'AI не ответил за 55 секунд. Попробуй повторить.':(err?.message||'Не удалось получить разбор.');
    renderFallback(r,'AI-анализ пока недоступен: '+message);
  }finally{
    clearTimeout(timeout);
    if(analysisController===controller)analysisController=null;
  }
}
function initialize(){
  $('#question').addEventListener('input',()=>$('#questionCounter').textContent=`${$('#question').value.length} / 800`);
  document.querySelectorAll('[data-category]').forEach(btn=>btn.addEventListener('click',()=>{category=btn.dataset.category;document.querySelectorAll('[data-category]').forEach(el=>el.classList.toggle('selected',el===btn));}));
  document.querySelectorAll('[data-spread]').forEach(btn=>btn.addEventListener('click',()=>{spread=btn.dataset.spread;document.querySelectorAll('[data-spread]').forEach(el=>el.classList.toggle('selected',el===btn));}));
  document.querySelectorAll('[data-view]').forEach(btn=>btn.addEventListener('click',()=>setView(btn.dataset.view)));
  $('#drawButton').addEventListener('click',draw);
  $('#againButton').addEventListener('click',()=>{stopAnalysis();$('#resultSection').classList.add('hidden');$('#question').focus();$('.question-panel').scrollIntoView({behavior:'smooth'});});
  $('#copyResult').addEventListener('click',async()=>{if(!reading)return;try{await navigator.clipboard.writeText(toPlainText(reading));notify('Расклад скопирован.');}catch{notify('Буфер обмена недоступен.');}});
  $('#retryAI').addEventListener('click',()=>{if(!reading)return;stopAnalysis();aiInterpret(reading,analysisSequence);});
  $('#clearJournal').addEventListener('click',()=>{if(confirm('Удалить все сохранённые расклады из этого браузера?')){localStorage.removeItem(STORAGE);renderJournal();updateCount();notify('История удалена.');}});
  updateCount();
}
initialize();