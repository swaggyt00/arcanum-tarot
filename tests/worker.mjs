import assert from 'node:assert/strict';
import worker from '../worker/worker.js';
const origin='https://swaggyt00.github.io';
const env={ALLOWED_ORIGIN:origin,GROQ_API_KEY:'fake-server-only-secret'};
const h=await worker.fetch(new Request('https://test.local/health'),env);
assert.equal(h.status,200);
assert.equal((await h.json()).ready,true);
const wrong=await worker.fetch(new Request('https://test.local/health'),{ALLOWED_ORIGIN:origin});
assert.equal((await wrong.json()).ready,false);
const body={question:'Получу ли я повышение в декабре?',category:'Карьера',cards:[
 {name:'Королева Жезлов',position:'Что помогает',orientation:'прямая',meaning:'Инициатива.'}
]};
const request=(source=origin)=>new Request('https://test.local/',{
 method:'POST',headers:{Origin:source,'Content-Type':'application/json'},body:JSON.stringify(body)
});
assert.equal((await worker.fetch(request('https://bad.example'),env)).status,403,'Origin CORS enforced');
const pre=await worker.fetch(new Request('https://test.local/',{method:'OPTIONS',headers:{Origin:origin}}),env);
assert.equal(pre.status,204);
assert.equal(pre.headers.get('Access-Control-Allow-Headers'),'Content-Type');
const result={answer:'Возможно.',pattern:'Работа с уверенностью.',
 cards:[{insight:'Действия важны.'}],nextStep:'Уточнить критерии.',uncertainty:'Без гарантии.'};
const previous=globalThis.fetch;
let upstream=0;
globalThis.fetch=async(url,options)=>{
 upstream++;
 assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');
 assert.equal(options.headers.Authorization,'Bearer fake-server-only-secret');
 const req=JSON.parse(options.body);
 assert.equal(req.response_format.json_schema.strict,true);
 assert.equal(req.model,'openai/gpt-oss-120b','stronger default model');
 assert.equal(req.reasoning_effort,'medium','deeper reasoning');
 assert(req.max_completion_tokens>2500,'not truncated to short template');
 const payload=JSON.parse(req.messages[1].content);
 assert.equal(payload.question,body.question);
 assert.equal(payload.cards[0].name,body.cards[0].name);
 return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]}),{status:200});
};
try{
 for(let i=0;i<210;i++){
   const reply=await worker.fetch(request(),env);
   assert.equal(reply.status,200,'No app-imposed visitor or daily limits');
   assert.deepEqual((await reply.json()).analysis,result);
 }
 assert.equal(upstream,210,'Every valid request reaches Groq without local quotas');
}finally{globalThis.fetch=previous;}
console.log('PASS: Public AI without password or app-imposed limits, preserved server-only key, CORS, structured response.');
