import { test } from 'node:test'
import assert from 'node:assert/strict'
import worker from './worker.js'
import { handleGameDirector } from './game-director.js'

const origin = 'https://swaggyt00.github.io'
const env = { GROQ_API_KEY: 'test-secret', ALLOWED_ORIGIN: origin }
const body = {
  version: 1,
  scenario: 'sex',
  risk: 3,
  stage: 1,
  tension: 35,
  chainFamily: 'tease',
  chainDepth: 2,
  recent: [{ type:'truth', risk: 2, chains:['tease'], skipped:false }],
  candidates:[
    { id:'v09:sex-light-dare-001', type:'dare', chains:['tease'],score:44 },
    { id:'v09-native-sex-kiss-001', type:'dare', chains:['kissing'],score:38 },
  ],
}

function req(value=body) {
  return new Request('https://example.workers.dev/game/director', {
    method:'POST',
    headers:{Origin:origin,'Content-Type':'application/json'},
    body:JSON.stringify(value),
  })
}

test('game route validates input and rejects unknown fields / invalid risk', async () => {
  const bad = await handleGameDirector(req({...body,risk:9}),env,origin)
  assert.equal(bad.status,400)
  const invalid = await handleGameDirector(req({...body,candidates:[{id:'<injection>',type:'dare',chains:[],score:0}]}),env,origin)
  assert.equal(invalid.status,400)
})

test('game route rejects non-POST and overlarge payload', async () => {
  const invalid = await handleGameDirector(new Request('https://example.workers.dev/game/director'),env,origin)
  assert.equal(invalid.status,405)
  const huge = await handleGameDirector(req({...body, garbage:'a'.repeat(11000)}),env,origin)
  assert.equal(huge.status,413)
})

test('Groq only sees safe metadata; chosen ID is validated and intro sanitized', async () => {
  const original=globalThis.fetch
  let sent
  try {
    globalThis.fetch = async (_url,options) => {
      sent=JSON.parse(options.body)
      return Response.json({choices:[{message:{content:JSON.stringify({
        selectedId:body.candidates[1].id,intro:'  Готовы\nк следующему повороту?  ',
      })}}]})
    }
    const answer=await handleGameDirector(req(),env,origin)
    assert.equal(answer.status,200)
    const result=await answer.json()
    assert.equal(result.selectedId,body.candidates[1].id)
    assert.equal(result.intro,'Готовы к следующему повороту?')
    assert.equal(answer.headers.get('Access-Control-Allow-Origin'),origin)
    const payload=JSON.stringify(sent)
    assert.ok(!payload.includes('Максим'))
    assert.ok(!payload.includes('Рада'))
    assert.ok(!payload.includes('сними одежду'))
    assert.equal(sent.response_format.json_schema.schema.properties.selectedId.enum.length,2)
  } finally { globalThis.fetch=original }
})

test('invented AI card ID is rejected and fallback can safely run', async () => {
  const original=globalThis.fetch
  try {
    globalThis.fetch=async()=>Response.json({choices:[{message:{content:JSON.stringify({
      selectedId:'hallucinated-card',intro:'Bad',
    })}}]})
    const answer=await handleGameDirector(req(),env,origin)
    assert.equal(answer.status,502)
  } finally {globalThis.fetch=original}
})

test('worker routes game separately and keeps tarot health and root behavior', async () => {
  const health=await worker.fetch(new Request('https://example.workers.dev/health'),env)
  assert.equal(health.status,200)
  assert.equal((await health.json()).service,'arcanum-tarot-ai')

  const forbidden=await worker.fetch(
    new Request('https://example.workers.dev/game/director',{
      method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},
      body:JSON.stringify(body),
    }),env)
  assert.equal(forbidden.status,403)

  const preflight=await worker.fetch(
    new Request('https://example.workers.dev/game/director',{
      method:'OPTIONS',headers:{Origin:origin},
    }),env)
  assert.equal(preflight.status,204)

  const tarotInvalid=await worker.fetch(
    new Request('https://example.workers.dev/',{
      method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},
      body:JSON.stringify({question:'x',cards:[]}),
    }),env)
  assert.equal(tarotInvalid.status,400)
})
