import assert from 'node:assert/strict';
import { CARDS } from '../cards.js';
assert.equal(CARDS.length,78);
assert.equal(new Set(CARDS.map(c=>c.id)).size,78);
assert(CARDS.every(c=>c.up&&c.rev&&c.name&&c.image.startsWith('https://')));

const events = {};
class FakeEl {
  constructor(name=''){this.name=name;this.value='';this.dataset={};this.children=[];this.textContent='';this.innerHTML='';this.style={setProperty(){}};this.classList={add(){},remove(){},toggle(){}};}
  addEventListener(event,fn){(events[this.name+':'+event]??=[]).push(fn);}
  replaceChildren(){this.children=[];this.innerHTML='';}
  appendChild(x){this.children.push(x);return x;}
  querySelector(sel){return new FakeEl(sel);}
  scrollIntoView(){}
  focus(){}
  showModal(){}
  close(){}
}
const dom=new Map();
const get=s=>{if(!dom.has(s))dom.set(s,new FakeEl(s));return dom.get(s);};
get('#question').value='Какие перспективы у нового проекта?';
const storage=new Map();
let aiCalls=0;
globalThis.fetch=async (url,options)=>{
  aiCalls++;
  assert.match(url,/workers\.dev/);
  assert.deepEqual(options.headers,{'Content-Type':'application/json'},'Visitors do not send passwords');
  const body=JSON.parse(options.body);
  const payload={answer:'Возможность есть, но она не гарантирована.',pattern:'Карты показывают взаимодействие возможностей и ограничений.',cards:body.cards.map(c=>({insight:'В позиции «'+c.position+'» эта карта указывает на важный фактор.'})),nextStep:'Уточни критерии.',uncertainty:'Карты не подтверждают решение работодателя.'};
  return {ok:true,json:async()=>({analysis:payload})};
};
globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
globalThis.window={crypto:globalThis.crypto,scrollTo(){}};
globalThis.document={querySelector:get,querySelectorAll:()=>[],createElement:tag=>new FakeEl(tag)};
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async()=>{}}}});
globalThis.confirm=()=>true;
await import('../app.js');
assert(events['#drawButton:click']?.length===1);
for(let i=0;i<100;i++)events['#drawButton:click'][0]();
const records=JSON.parse(storage.get('arcanum-readings-v1'));
assert.equal(records.length,50,'history bounded to last 50');
for(const r of records){assert.equal(r.cards.length,3);assert.equal(new Set(r.cards.map(c=>c.id)).size,3);assert(r.cards.every(c=>typeof c.reversed==='boolean'));}
assert.equal(get('#cardsGrid').children.length,3,'rendered three cards');
await new Promise(resolve=>setTimeout(resolve,10));
const latest=JSON.parse(storage.get('arcanum-readings-v1'))[0];
assert.equal(aiCalls,100,'AI starts automatically after every draw');
assert.equal(get('#aiIndicator').textContent,'AI-разбор готов');
assert.equal(latest.ai?.cards.length,3,'AI result saved with exact card spread');
assert(get('#interpretation').children.length>=3,'unified interpretation rendered');
console.log('PASS: 78 unique cards, 100 draws with no duplicates, automatic AI, structured reading, journal history cap.');
