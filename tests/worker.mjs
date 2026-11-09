import assert from 'node:assert/strict';
import worker from '../worker/worker.js';
const origin='https://swaggyt00.github.io';
const env={ALLOWED_ORIGIN:origin,GROQ_API_KEY:'fake-for-tests',ACCESS_TOKEN:'test-access-token-at-least-24-characters'};
const health=await worker.fetch(new Request('https://test.local/health'),env);
assert.equal(health.status,200);
assert.equal((await health.json()).ready,true);
const missing=await worker.fetch(new Request('https://test.local/health'),{ALLOWED_ORIGIN:origin});
assert.equal((await missing.json()).ready,false);
const sample={question:'Получу ли я повышение в декабре?',category:'Карьера',cards:[
  {name:'Королева Жезлов',position:'Что помогает',orientation:'прямая',meaning:'Инициатива и уверенность.'},
  {name:'Девятка Жезлов',position:'Что мешает',orientation:'перевёрнутая',meaning:'Истощение.'}
]};
const request=(access,org=origin)=>new Request('https://test.local/',{method:'POST',headers:{Origin:org,'X-Arcanum-Access':access,'Content-Type':'application/json'},body:JSON.stringify(sample)});
assert.equal((await worker.fetch(request('invalid'),env)).status,401,'invalid password rejected');
assert.equal((await worker.fetch(request(env.ACCESS_TOKEN,'https://bad.example'),env)).status,403,'bad origin rejected');
const preflight=await worker.fetch(new Request('https://test.local/',{method:'OPTIONS',headers:{Origin:origin}}),env);
assert.equal(preflight.status,204,'CORS preflight works');
assert.match(preflight.headers.get('Access-Control-Allow-Headers'),/X-Arcanum-Access/);
const expected={answer:'Возможность есть, но не гарантия.',pattern:'Уверенность сочетается с усталостью.',cards:[{insight:'Инициатива помогает.'},{insight:'Усталость может мешать.'}],nextStep:'Уточните критерии.',uncertainty:'Сроки решения неизвестны.'};
let requestBody;
const nativeFetch=globalThis.fetch;
globalThis.fetch=async (url,options)=>{
  assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');
  requestBody=JSON.parse(options.body);
  assert.equal(options.headers.Authorization,'Bearer fake-for-tests');
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(expected)}}]}),{status:200,headers:{'Content-Type':'application/json'}});
};
try{
  const response=await worker.fetch(request(env.ACCESS_TOKEN),env);
  assert.equal(response.status,200,'successful Groq response');
  const data=await response.json();
  assert.deepEqual(data.analysis,expected,'structured answer survives proxy');
  assert.equal(requestBody.response_format.type,'json_schema','strict structured outputs requested');
  assert.equal(requestBody.response_format.json_schema.strict,true);
  assert.equal(requestBody.messages[1].content.includes('Получу ли я повышение'),true);
}finally{globalThis.fetch=nativeFetch;}
console.log('PASS: Cloudflare Worker secrets, CORS, authentication and strict Groq JSON schema.');
