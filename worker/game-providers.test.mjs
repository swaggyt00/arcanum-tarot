import {test} from 'node:test'
import assert from 'node:assert/strict'
import {completeGameJSON,gameProviderReadiness,resetGameProviderStateForTests} from './game-providers.js'
import worker from './worker.js'

const env={GROQ_API_KEY:'fake-groq-secret',GEMINI_API_KEY:'fake-gemini-secret',
  ALLOWED_ORIGIN:'https://swaggyt00.github.io'}
const shape={
  route:'game-provider-test',
  system:'Pick one card from the candidate list.',
  payload:{candidates:['v09:couple-test-a','v09:couple-test-b']},
  schema:{
    type:'object',
    properties:{selectedId:{type:'string',enum:['v09:couple-test-a','v09:couple-test-b']}},
    required:['selectedId'],additionalProperties:false,
  },
  name:'game_router_pick_test',temperature:0.5,tokens:450,
}
const groq=(selectedId='v09:couple-test-a',init={})=>
  Response.json({choices:[{message:{content:JSON.stringify({selectedId})}}],
    usage:{total_tokens:37}},init)
const gemini=(selectedId='v09:couple-test-b',init={})=>
  Response.json({candidates:[{content:{parts:[{text:JSON.stringify({selectedId})}]}}],
    usageMetadata:{totalTokenCount:42}},init)

test('only uses Groq if it succeeds, without wasting Gemini quota',async()=>{
  resetGameProviderStateForTests()
  const original=globalThis.fetch
  const calls=[]
  try{
    globalThis.fetch=async (url,init)=>{
      calls.push({url,init})
      return groq()
    }
    const result=await completeGameJSON(env,shape)
    assert.equal(result.provider,'groq')
    assert.equal(result.fallback,false)
    assert.equal(result.value.selectedId,'v09:couple-test-a')
    assert.equal(calls.length,1)
    assert.match(calls[0].url,/api.groq.com/)
    assert.equal(JSON.parse(calls[0].init.body).response_format.type,'json_schema')
  }finally{globalThis.fetch=original}
})

test('Groq 429 -> Gemini model, schema and payload; next call skips Groq cooldown',async()=>{
  resetGameProviderStateForTests()
  const original=globalThis.fetch
  let groqCalls=0,geminiCalls=0
  try{
    globalThis.fetch=async (url,init)=>{
      if(String(url).includes('api.groq.com')){
        groqCalls++
        return Response.json({error:{message:'rate limited'}},{
          status:429,headers:{'retry-after':'47','x-ratelimit-remaining-tokens':'0',
            'x-ratelimit-remaining-requests':'980'},
        })
      }
      geminiCalls++
      assert.match(url,/generativelanguage.googleapis.com\/v1beta\/models\/gemini-3.8-flash:generateContent/)
      assert.equal(init.headers['x-goog-api-key'],'fake-gemini-secret')
      assert.ok(!String(url).includes('fake-gemini-secret'),'secret must never go in URL')
      const data=JSON.parse(init.body)
      assert.equal(data.generationConfig.thinkingConfig.thinkingLevel,'low')
      assert.equal(data.generationConfig.temperature,undefined)
      assert.equal(data.generationConfig.responseMimeType,'application/json')
      assert.deepEqual(data.generationConfig.responseSchema,shape.schema)
      assert.ok(data.systemInstruction.parts[0].text.includes('Pick one card'))
      assert.ok(data.contents[0].parts[0].text.includes('candidates'))
      return gemini()
    }
    const first=await completeGameJSON(env,shape)
    assert.equal(first.provider,'gemini')
    assert.equal(first.fallback,true)
    assert.equal(first.value.selectedId,'v09:couple-test-b')
    const next=await completeGameJSON(env,shape)
    assert.equal(next.provider,'gemini')
    assert.equal(groqCalls,1,'must not hammer exhausted Groq on next turn')
    assert.equal(geminiCalls,2)
  }finally{globalThis.fetch=original}
})

test('Gemini-only game can operate while Tarot health still requires Groq',async()=>{
  resetGameProviderStateForTests()
  const original=globalThis.fetch
  const single={ALLOWED_ORIGIN:env.ALLOWED_ORIGIN,GEMINI_API_KEY:'fake-gemini-secret'}
  try{
    globalThis.fetch=async(url)=>{
      assert.match(url,/generativelanguage.googleapis.com/)
      return gemini()
    }
    const answer=await completeGameJSON(single,shape)
    assert.equal(answer.provider,'gemini')
    assert.equal(answer.fallback,false)
    assert.deepEqual(gameProviderReadiness(single),{groq:false,gemini:true,ready:true})
    const health=await worker.fetch(new Request('https://some.workers.dev/health'),single)
    assert.equal(health.status,200)
    assert.equal((await health.json()).ready,false,'Tarot keeps its original Groq dependency')
  }finally{globalThis.fetch=original}
})

test('Groq 503 or bad JSON routes to Gemini, but never accepts an invented card ID',async()=>{
  resetGameProviderStateForTests()
  const original=globalThis.fetch
  let count=0
  try{
    globalThis.fetch=async url=>{
      count++
      return String(url).includes('api.groq.com')
        ?Response.json({error:'unavailable'},{status:503})
        :gemini('invalid-card-id')
    }
    const result=await completeGameJSON(env,shape)
    assert.equal(result.provider,'gemini')
    assert.equal(result.value.selectedId,'invalid-card-id')
    // The route calling this still validates the selected ID, so the
    // provider router itself never makes an eligibility decision.
    assert.equal(count,2)
  }finally{globalThis.fetch=original}
})

test('both providers 429 -> fast cooldown, no request storm or fake response',async()=>{
  resetGameProviderStateForTests()
  const original=globalThis.fetch
  let calls=0
  try{
    globalThis.fetch=async()=>{
      calls++
      return Response.json({error:{code:429}}, {status:429,headers:{'retry-after':'25'}})
    }
    const first=await completeGameJSON(env,shape)
    assert.equal(first.error,429)
    assert.equal(calls,2)
    const second=await completeGameJSON(env,shape)
    assert.equal(second.error,429)
    assert.ok(second.retryAfterSeconds>=1)
    assert.equal(calls,2,'cooldown prevents immediate duplicate retries')
  }finally{globalThis.fetch=original}
})

test('Gemini blocked or incomplete JSON never leaks into UI as a success',async()=>{
  resetGameProviderStateForTests()
  const original=globalThis.fetch
  const single={GEMINI_API_KEY:'fake-gemini-secret'}
  try{
    globalThis.fetch=async()=>Response.json({
      candidates:[{finishReason:'SAFETY',content:{parts:[]}}],
    })
    const result=await completeGameJSON(single,shape)
    assert.equal(result.error,502)
  }finally{globalThis.fetch=original}
})

test('structured telemetry captures real limits without logging prompts or credentials',async()=>{
  resetGameProviderStateForTests()
  const original=globalThis.fetch,log=console.log
  const entries=[]
  try{
    console.log=v=>entries.push(String(v))
    globalThis.fetch=async()=>groq(undefined,{
      headers:{'x-ratelimit-remaining-tokens':'1650',
        'x-ratelimit-remaining-requests':'982','x-ratelimit-reset-tokens':'1m1s'},
    })
    const result=await completeGameJSON(env,shape)
    assert.equal(result.provider,'groq')
    const info=entries.map(s=>JSON.parse(s)).find(x=>x.status===200)
    assert.equal(info.remainingTokens,1650)
    assert.equal(info.remainingRequests,982)
    const output=entries.join(' ')
    assert.ok(!output.includes('fake-groq-secret'))
    assert.ok(!output.includes('fake-gemini-secret'))
    assert.ok(!output.includes('v09:couple-test'))
    assert.ok(!output.includes('Pick one card'))
  }finally{globalThis.fetch=original;console.log=log}
})


test('a server-side Gemini-first canary chooses real Gemini without a client flag',async()=>{
  resetGameProviderStateForTests()
  const original=globalThis.fetch
  let groqCalls=0,geminiCalls=0
  try{
    globalThis.fetch=async (url)=>{
      if(String(url).includes('api.groq.com')){groqCalls++;return groq()}
      geminiCalls++;return gemini()
    }
    const result=await completeGameJSON({...env,GEMINI_GAME_PRIMARY:'true'},shape)
    assert.equal(result.provider,'gemini')
    assert.equal(geminiCalls,1)
    assert.equal(groqCalls,0)
  }finally{globalThis.fetch=original;resetGameProviderStateForTests()}
})
