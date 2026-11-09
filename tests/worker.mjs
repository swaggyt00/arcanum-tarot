import assert from 'node:assert/strict';
import worker, {AIUsageBudget} from '../worker/worker.js';
const origin='https://swaggyt00.github.io', state=new Map();
const budget=new AIUsageBudget({storage:{transaction:async fn=>fn({
  get:async k=>state.get(k),put:async(k,v)=>state.set(k,v)
})}});
let calls=0;
const env={
  ALLOWED_ORIGIN:origin,GROQ_API_KEY:'test-server-only-secret',
  VISITOR_RATE_LIMITER:{limit:async()=>({success:++calls<=3})},
  AI_USAGE_BUDGET:{idFromName:()=>({}),get:()=>({fetch:(url,opts)=>budget.fetch(new Request(url,opts))})}
};
const health=await worker.fetch(new Request('https://test.local/health'),env);
assert.equal((await health.json()).ready,true);
const missing=await worker.fetch(new Request('https://test.local/health'),{ALLOWED_ORIGIN:origin});
assert.equal((await missing.json()).ready,false);
const payload={question:'Получу ли я повышение в декабре?',category:'Карьера',cards:[
  {name:'Королева Жезлов',position:'Что помогает',orientation:'прямая',meaning:'Инициатива.'}
]};
const request=(o=origin)=>new Request('https://test.local/',{
  method:'POST',headers:{Origin:o,'Content-Type':'application/json','CF-Connecting-IP':'1.2.3.4'},
  body:JSON.stringify(payload)
});
assert.equal((await worker.fetch(request('https://bad.example'),env)).status,403,'bad origin rejected');
const preflight=await worker.fetch(new Request('https://test.local/',{method:'OPTIONS',headers:{Origin:origin}}),env);
assert.equal(preflight.status,204);
assert.equal(preflight.headers.get('Access-Control-Allow-Headers'),'Content-Type');
const expected={answer:'Возможность есть, но не гарантия.',pattern:'Уверенность важна.',
  cards:[{insight:'Инициатива поможет.'}],nextStep:'Уточнить критерии.',uncertainty:'Карты не доказывают результат.'};
const original=globalThis.fetch;
let upstreamCalls=0;
globalThis.fetch=async(url,options)=>{
  upstreamCalls++;
  assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(options.headers.Authorization,'Bearer test-server-only-secret');
  const sent=JSON.parse(options.body);
  assert.equal(sent.response_format.type,'json_schema');
  assert.equal(sent.response_format.json_schema.strict,true);
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(expected)}}]}),{status:200});
};
try{
  for(let i=0;i<3;i++){
    const response=await worker.fetch(request(),env);
    assert.equal(response.status,200,'public access works without password');
    assert.deepEqual((await response.json()).analysis,expected);
  }
  assert.equal((await worker.fetch(request(),env)).status,429,'per-visitor limiter protects Groq');
  assert.equal(state.get('day').count,3);
  assert.equal(upstreamCalls,3,'denied requests never reach Groq');
  state.set('day',{day:new Date().toISOString().slice(0,10),count:200});
  const limit=await budget.fetch(new Request('https://budget.internal/consume',{method:'POST'}));
  assert.equal(limit.status,429);
  assert.equal((await limit.json()).reason,'daily');
}finally{globalThis.fetch=original;}
console.log('PASS: Public password-free API, strict day budget, visitor quotas, CORS and JSON schema.');
