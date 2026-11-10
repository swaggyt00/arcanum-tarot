import { test } from 'node:test'
import assert from 'node:assert/strict'
import worker from './worker.js'
import { handleGameBoss } from './game-boss.js'
import { resetGameProviderStateForTests } from './game-providers.js'

const origin='https://swaggyt00.github.io'
const env={GROQ_API_KEY:'unit-groq',GEMINI_API_KEY:'unit-gemini',ALLOWED_ORIGIN:origin}
const allowed={
  party:[
    ['callback-spotlight','voluntary-ballot','opening-echo'],
    ['duel-remix','role-handoff','double-improv'],
    ['ensemble-remix','group-reveal','final-chorus'],
  ],
  sex:[
    ['resume-consented','shared-choice','slow-connection'],
    ['trade-initiative','change-pacing','keep-thread'],
    ['open-ending','together-decide','no-timer-finish'],
  ],
  afterdark:[
    ['night-callback','voluntary-ballot','opening-echo'],
    ['double-improv','role-handoff','duel-remix'],
    ['ensemble-remix','group-reveal','final-chorus'],
  ],
}
const body={
  version:1,scenario:'party',stage:2,tension:75,turnsPlayed:16,
  chainFamily:'social',playersCount:3,allowedMechanics:allowed.party,
  recent:[
    {actorIndex:0,targetIndex:1,risk:2,type:'truth',skipped:false,chains:['social']},
    {actorIndex:1,targetIndex:2,risk:3,type:'dare',skipped:false,chains:['chaos']},
    {actorIndex:2,targetIndex:0,risk:2,type:'dare',skipped:false,chains:['social']},
  ],
  chainOutcomes:[{result:'finished',openingChain:'social'}],
  bossHistory:[{mechanics:['opening-echo','role-handoff','final-chorus'],outcome:'finished'}],
}
const proposal={
  title:'Возвращение ночного ведущего',
  phases:[
    {mechanic:'callback-spotlight',role:'last-actor',
      caption:'Прошлая тема неожиданно возвращается на первый план.'},
    {mechanic:'duel-remix',role:'last-target',
      caption:'Теперь история поворачивает в другую сторону.'},
    {mechanic:'ensemble-remix',role:'all',
      caption:'Финал собирает воедино всё самое неожиданное.'},
  ],
}
const req=(value=body,url='https://example.workers.dev/game/boss')=>
  new Request(url,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},
    body:JSON.stringify(value)})
const groq=value=>Response.json({choices:[{message:{content:JSON.stringify(value)}}]})

test('AI Boss generates a unique playable 3-phase structure from anonymous party memory',async()=>{
  resetGameProviderStateForTests()
  const original=globalThis.fetch
  try{
    let prompt
    globalThis.fetch=async(_url,options)=>{prompt=JSON.parse(options.body);return groq(proposal)}
    const response=await handleGameBoss(req(),env,origin)
    assert.equal(response.status,200)
    assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin)
    assert.deepEqual(await response.json(),proposal)
    assert.deepEqual(prompt.response_format.json_schema.schema.properties.phases.items.properties.role.enum,
      ['all','last-actor','last-target','chain-opener'])
    const memory=JSON.parse(prompt.messages[1].content)
    assert.equal(memory.recent[0].actorIndex,0)
    assert.equal(memory.chainOutcomes[0].result,'finished')
    assert.deepEqual(memory.bossHistory[0].mechanics,body.bossHistory[0].mechanics)
    assert.ok(!JSON.stringify(prompt).includes('Игрок А'))
  }finally{globalThis.fetch=original;resetGameProviderStateForTests()}
})

test('Boss provider does not see names, card text or extra user-provided instructions',async()=>{
  resetGameProviderStateForTests()
  const original=globalThis.fetch
  const forged={
    ...body,secret:'DONT_SEND_SECRET',
    recent:body.recent.map(item=>({...item,privateAnswer:'DONT_SEND_SECRET'})),
    chainOutcomes:[{...body.chainOutcomes[0],title:'DONT_SEND_SECRET'}],
    bossHistory:[{...body.bossHistory[0],playerName:'DONT_SEND_SECRET'}],
  }
  try{
    globalThis.fetch=async(_url,options)=>{
      assert.ok(!String(options.body).includes('DONT_SEND_SECRET'))
      return groq(proposal)
    }
    assert.equal((await handleGameBoss(req(forged),env,origin)).status,200)
  }finally{globalThis.fetch=original;resetGameProviderStateForTests()}
})

test('Boss rejects impossible structures, repeated mechanics and unwanted copy',async()=>{
  resetGameProviderStateForTests()
  const original=globalThis.fetch
  const invalid=[
    {...proposal,phases:proposal.phases.slice(0,2)},
    {...proposal,phases:proposal.phases.map((p,i)=>i===1?{...p,mechanic:'unknown'}:p)},
    {...proposal,phases:proposal.phases.map((p,i)=>i===2?{...p,role:'both'}:p)},
    {...proposal,title:'<script>prompt injection</script>'},
    {...proposal,phases:[
      {mechanic:'opening-echo',role:'all',caption:'Продолжаем.'},
      {mechanic:'role-handoff',role:'all',caption:'Продолжаем.'},
      {mechanic:'final-chorus',role:'all',caption:'Продолжаем.'},
    ]},
  ]
  try{
    for(const value of invalid){
      globalThis.fetch=async()=>groq(value)
      const response=await handleGameBoss(req(),env,origin)
      assert.equal(response.status,422)
    }
    globalThis.fetch=async()=>groq({...proposal,phases:proposal.phases.map((p,i)=>
      i===1?{...p,caption:'Сними бельё и выполни новое задание.'}:p)})
    const sanitized=await handleGameBoss(req(),env,origin)
    assert.equal(sanitized.status,200)
    assert.equal((await sanitized.json()).phases[1].caption,'')
  }finally{globalThis.fetch=original;resetGameProviderStateForTests()}
})

test('Sex finales never accept invented activity or forced third participant',async()=>{
  resetGameProviderStateForTests()
  const original=globalThis.fetch
  const sex={
    ...body,scenario:'sex',stage:3,playersCount:2,allowedMechanics:allowed.sex,
    recent:[{actorIndex:0,targetIndex:1,type:'dare',risk:3,skipped:false,chains:['kissing']}],
    chainOutcomes:[],bossHistory:[],chainFamily:'kissing',
  }
  const safe={
    title:'Близость без таймера',
    phases:[
      {mechanic:'resume-consented',role:'both',caption:'Вы сохраняете выбранный ритм.'},
      {mechanic:'trade-initiative',role:'both',caption:'Инициатива мягко меняет направление.'},
      {mechanic:'open-ending',role:'both',caption:'Теперь у этой истории свободное завершение.'},
    ],
  }
  try{
    globalThis.fetch=async()=>groq(safe)
    assert.equal((await handleGameBoss(req(sex),env,origin)).status,200)
    globalThis.fetch=async()=>groq({...safe,phases:[
      {...safe.phases[0],role:'last-actor'},...safe.phases.slice(1),
    ]})
    assert.equal((await handleGameBoss(req(sex),env,origin)).status,422)
    assert.equal((await handleGameBoss(req({...sex,allowedMechanics:allowed.party}),env,origin)).status,400)
  }finally{globalThis.fetch=original;resetGameProviderStateForTests()}
})

test('Boss route validates CORS, size and game-only routing without changing Tarot',async()=>{
  assert.equal((await handleGameBoss(req({...body,playersCount:2}),env,origin)).status,400)
  assert.equal((await handleGameBoss(req({...body,allowedMechanics:[['invent'],[],[]]}),env,origin)).status,400)
  assert.equal((await handleGameBoss(req({...body,recent:[{...body.recent[0],actorIndex:10}]}),env,origin)).status,400)
  assert.equal((await handleGameBoss(req({...body,nonce:'x'.repeat(12001)}),env,origin)).status,413)
  assert.equal((await handleGameBoss(new Request('https://example.workers.dev/game/boss'),env,origin)).status,405)
  const forbidden=await worker.fetch(new Request('https://example.workers.dev/game/boss',{
    method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},
    body:JSON.stringify(body),
  }),env)
  assert.equal(forbidden.status,403)
  const preflight=await worker.fetch(new Request('https://example.workers.dev/game/boss',{
    method:'OPTIONS',headers:{Origin:origin},
  }),env)
  assert.equal(preflight.status,204)
  const tarot=await worker.fetch(new Request('https://example.workers.dev/',{
    method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},
    body:JSON.stringify({question:'test',cards:[]}),
  }),env)
  assert.equal(tarot.status,400)
})

test('new Boss win and defeat outcomes reach AI while extra personal data is dropped',async()=>{
  resetGameProviderStateForTests()
  const original=globalThis.fetch
  try{
    let sent
    globalThis.fetch=async (_url,options)=>{
      sent=JSON.parse(options.body)
      return groq(proposal)
    }
    const updated={...body,bossHistory:[
      {mechanics:['opening-echo','role-handoff','final-chorus'],
        outcome:'lost',challengerIndex:2,reason:'forfeit',name:'PRIVATE_PLAYER_NAME'},
      {mechanics:['voluntary-ballot','double-improv','group-reveal'],
        outcome:'won',challengerIndex:0,name:'PRIVATE_PLAYER_NAME'},
    ]}
    const response=await handleGameBoss(req(updated),env,origin)
    assert.equal(response.status,200)
    const input=JSON.parse(sent.messages[1].content)
    assert.deepEqual(input.bossHistory.map(x=>x.outcome),['lost','won'])
    assert.ok(!JSON.stringify(input).includes('PRIVATE_PLAYER_NAME'))
    assert.ok(!JSON.stringify(input).includes('challengerIndex'))
    const bad=await handleGameBoss(req({...updated,bossHistory:[
      {mechanics:['opening-echo'],outcome:'forced-intimacy'},
    ]}),env,origin)
    assert.equal(bad.status,400)
  }finally{globalThis.fetch=original;resetGameProviderStateForTests()}
})

test('expanded 5×5×5 Boss catalog supports new verified mechanics and legacy sessions',async()=>{
  resetGameProviderStateForTests()
  const original=globalThis.fetch
  const updated={
    ...body,
    allowedMechanics:allowed.party.map((choices,index)=>[
      ...choices,
      ...[
        ['callback-witness','team-captain'],
        ['alibi-exchange','reversal-duel'],
        ['group-verdict','finale-callback'],
      ][index],
    ]),
  }
  const newDraft={
    title:'Суд над прошедшим раундом',
    phases:[
      {mechanic:'callback-witness',role:'last-actor',caption:'Из прошлого снова появляется свидетель истории.'},
      {mechanic:'reversal-duel',role:'last-target',caption:'Соперники теперь неожиданно меняются ролями.'},
      {mechanic:'group-verdict',role:'all',caption:'Вся компания завершает историю общим решением.'},
    ],
  }
  try{
    globalThis.fetch=async(_url,options)=>{
      const request=JSON.parse(options.body)
      const message=JSON.parse(request.messages[1].content)
      assert.deepEqual(message.allowedMechanics,updated.allowedMechanics)
      return groq(newDraft)
    }
    const accepted=await handleGameBoss(req(updated),env,origin)
    assert.equal(accepted.status,200)
    assert.deepEqual(await accepted.json(),newDraft)
    const injected={...updated,allowedMechanics:updated.allowedMechanics.map((c,i)=>
      i===2?[...c.slice(0,-1),'invent-a-punishment']:c)}
    assert.equal((await handleGameBoss(req(injected),env,origin)).status,400)
    const mixed={...updated,allowedMechanics:updated.allowedMechanics.map((c,i)=>
      i===1?c.slice(0,3):c)}
    assert.equal((await handleGameBoss(req(mixed),env,origin)).status,400)

    // Existing open browser tabs still submit their old three-option catalog.
    globalThis.fetch=async()=>groq(proposal)
    assert.equal((await handleGameBoss(req(body),env,origin)).status,200)
  }finally{globalThis.fetch=original;resetGameProviderStateForTests()}
})

test('expanded intimate Boss allows only existing-scene mechanics and both participants',async()=>{
  resetGameProviderStateForTests()
  const original=globalThis.fetch
  const extended={
    ...body,scenario:'sex',stage:3,playersCount:2,chainFamily:'manual',
    allowedMechanics:[
      ['resume-consented','shared-choice','slow-connection','stay-with-spark','gentle-checkin'],
      ['trade-initiative','change-pacing','keep-thread','mutual-rhythm','initiative-offer'],
      ['open-ending','together-decide','no-timer-finish','quiet-finale','choose-finish'],
    ],
    recent:[],chainOutcomes:[],bossHistory:[],
  }
  const draft={
    title:'Финал без обязательств',
    phases:[
      {mechanic:'stay-with-spark',role:'both',caption:'Сцена остаётся такой, как вы сами решили.'},
      {mechanic:'mutual-rhythm',role:'both',caption:'Комфортный ритм выбирают только двое.'},
      {mechanic:'quiet-finale',role:'both',caption:'Финал остаётся совершенно открытым.'},
    ],
  }
  try{
    globalThis.fetch=async()=>groq(draft)
    assert.equal((await handleGameBoss(req(extended),env,origin)).status,200)
    globalThis.fetch=async()=>groq({...draft,phases:draft.phases.map((phase,i)=>
      i===1?{...phase,role:'last-target'}:phase)})
    assert.equal((await handleGameBoss(req(extended),env,origin)).status,422)
    const bad={...extended,allowedMechanics:extended.allowedMechanics.map((choices,i)=>
      i===2?[...choices.slice(0,4),'force-new-practice']:choices)}
    assert.equal((await handleGameBoss(req(bad),env,origin)).status,400)
  }finally{globalThis.fetch=original;resetGameProviderStateForTests()}
})
