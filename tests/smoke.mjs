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
assert(get('#interpretation').children.length>0,'has interpretation');
console.log('PASS: 78 unique cards, 100 random draws, no duplicates, history cap, UI render.');
