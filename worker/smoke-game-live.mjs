// Live production smoke check for the game route; uses only public metadata.
const url=process.env.GAME_AI_ENDPOINT || 'https://arcanum-tarot-ai.kunicin27522.workers.dev/game/director'
const payload={
  version:1,
  scenario:'couple',
  risk:2,
  stage:1,
  tension:22,
  chainFamily:'flirt',
  chainDepth:1,
  pacing:{intent:'develop',momentum:2,preferType:null,focusChain:'flirt',
    avoidChain:null,suppressOptionalModifier:false},
  recent:[
    {type:'truth',risk:1,chains:['conversation'],skipped:false},
    {type:'dare',risk:2,chains:['flirt'],skipped:false},
  ],
  candidates:[
    {id:'v09:couple-light-dare-001',type:'dare',chains:['flirt'],score:42},
    {id:'v09-game-smoke-b',type:'truth',chains:['confession'],score:32},
    {id:'v09-game-smoke-c',type:'dare',chains:['connection'],score:26},
  ],
}
const controller=new AbortController()
const timer=setTimeout(()=>controller.abort(),65000)
try{
  const response=await fetch(url,{
    method:'POST',
    headers:{'Origin':'https://swaggyt00.github.io','Content-Type':'application/json'},
    body:JSON.stringify(payload),
    signal:controller.signal,
  })
  const data=await response.json().catch(()=>null)
  console.log('AI Director live status:',response.status,
    'provider:',response.headers.get('X-AI-Provider'),
    'attempts:',response.headers.get('X-AI-Attempts'))
  if(!response.ok) throw Error('Endpoint returned '+response.status+': '+JSON.stringify(data))
  if(!payload.candidates.some(c=>c.id===data?.selectedId)) {
    throw Error('AI selected an unknown card ID: '+JSON.stringify(data))
  }
  if(typeof data.intro!=='string'||!data.intro.trim())throw Error('AI intro missing')
  const phases=['build','twist','payoff']
  const permittedThemes=new Set(payload.candidates.flatMap(card=>card.chains))
  if(!Array.isArray(data.scenePlan?.beats)||data.scenePlan.beats.length!==3
    ||!data.scenePlan.beats.every((beat,index)=>beat.phase===phases[index]
      && permittedThemes.has(beat.chain)
      && ['truth','dare','either'].includes(beat.preferredType))){
    throw Error('AI Director failed to construct a safe three-beat story arc: '+JSON.stringify(data.scenePlan))
  }
  console.log('LIVE AI STORY ARC PASSED:',JSON.stringify(data.scenePlan))
  const chainRules=new Set(['fair','opener','first-target','previous-actor','previous-target'])
  if(typeof data.chainPlan?.title!=='string'||data.chainPlan.title.length<6
    ||!Array.isArray(data.chainPlan.beats)||data.chainPlan.beats.length!==3
    ||!data.chainPlan.beats.every((beat,index)=>beat.phase===phases[index]
      &&chainRules.has(beat.normalTarget)&&chainRules.has(beat.boldTarget)
      &&typeof beat.line==='string')){
    throw Error('AI Chains live generation failed or returned an unsafe structure: '
      +JSON.stringify(data.chainPlan))
  }
  console.log('LIVE AI CHAIN PASSED:',JSON.stringify(data.chainPlan))
  console.log('AI Director live OK:',JSON.stringify(data))
  // A Boss is composed by the model but its actual challenges are selected
  // from verified mechanic IDs. This endpoint has an independent fallback
  // path in the browser, so a transient 429/503 is a warning, not fake success.
  const bossUrl=url.replace(/\/game\/director$/, '/game/boss')
  const bossPayload={
    version:1,scenario:'afterdark',stage:2,tension:82,turnsPlayed:14,
    chainFamily:'social',playersCount:2,
    allowedMechanics:[
      ['night-callback','voluntary-ballot','opening-echo'],
      ['double-improv','role-handoff','duel-remix'],
      ['ensemble-remix','group-reveal','final-chorus'],
    ],
    recent:[
      {actorIndex:0,targetIndex:1,type:'truth',risk:2,skipped:false,chains:['social']},
      {actorIndex:1,targetIndex:0,type:'dare',risk:3,skipped:false,chains:['social']},
    ],
    chainOutcomes:[{result:'finished',openingChain:'social'}],
    bossHistory:[],
  }
  const bossResponse=await fetch(bossUrl,{
    method:'POST',
    headers:{Origin:'https://swaggyt00.github.io','Content-Type':'application/json'},
    body:JSON.stringify(bossPayload),
    signal:controller.signal,
  })
  const bossData=await bossResponse.json().catch(()=>null)
  console.log('AI BOSS live status:',bossResponse.status,
    'provider:',bossResponse.headers.get('X-AI-Provider'),
    'attempts:',bossResponse.headers.get('X-AI-Attempts'))
  if(bossResponse.ok){
    if(typeof bossData?.title!=='string'
      ||!Array.isArray(bossData.phases)||bossData.phases.length!==3
      ||!bossData.phases.every((phase,index)=>bossPayload.allowedMechanics[index].includes(phase.mechanic)
        &&['all','last-actor','last-target','chain-opener'].includes(phase.role)
        &&typeof phase.caption==='string')){
      throw Error('AI Boss endpoint returned an unsafe/unplayable structure: '+JSON.stringify(bossData))
    }
    console.log('LIVE AI BOSS PASSED:',JSON.stringify(bossData))
  }else if([429,502,503,504].includes(bossResponse.status)){
    console.warn('::warning::AI Boss model unavailable (HTTP '+bossResponse.status
      +'). Verified game fallback is covered by E2E, but live Boss generation remains unverified.')
  }else{
    throw Error('Unexpected Boss endpoint failure: '+bossResponse.status+' '+JSON.stringify(bossData))
  }
  const twistUrl=url.replace(/\/game\/director$/, '/game/modifier')
  const twistPayload={
    version:3,scenario:'afterdark',stage:0,risk:2,cardType:'dare',
    chains:['chaos','social'],
    cardText:'Пятнадцать секунд рекламируй ночной перекус как дорогую вещь, используя голос, походку и мимику.',
    allowedAxes:['precision','sequence','constraint','tempo'],
    recentLabels:['ПРЕДЫДУЩАЯ СЛОЖНОСТЬ'],
  }
  let liveTwist=null
  let modifierUnavailable=null
  for(let attempt=1;attempt<=3;attempt++){
    const response=await fetch(twistUrl,{
      method:'POST',
      headers:{Origin:'https://swaggyt00.github.io','Content-Type':'application/json'},
      body:JSON.stringify(twistPayload),
      signal:controller.signal,
    })
    const candidate=await response.json().catch(()=>null)
    console.log('Creative AI attempt',attempt,'status:',response.status,
      'reviewer:',response.headers.get('X-AI-Provider'),
      'creator:',response.headers.get('X-AI-Creator-Provider'),
      'failed-stage:',response.headers.get('X-AI-Error-Stage'),
      'attempts:',response.headers.get('X-AI-Attempts'),
      JSON.stringify(candidate))
    if(response.status===422)continue // Correctly rejected drafts are not a successful condition.
    if([429,502,503,504].includes(response.status)){
      modifierUnavailable=response.status
      if(response.status===429)break // Respect upstream rate limit.
      if(attempt<3){
        console.log('RETRY: modifier HTTP '+response.status+' after provider cooldown')
        await new Promise(resolve=>setTimeout(resolve,8500))
        continue
      }
      break
    }
    if(!response.ok)throw Error('Unexpected AI modifier endpoint status: '+response.status)
    liveTwist=candidate
    break
  }
  if(!liveTwist && modifierUnavailable){
    console.warn('::warning::Original AI modifier generation unavailable (HTTP '
      +modifierUnavailable+'); live generation is not verified. Safe no-condition fallback has E2E coverage.')
  }else if(!liveTwist){
    throw Error('No creative modifier passed independent validation across three samples.')
  }
  if(!liveTwist)return
  if(!twistPayload.allowedAxes.includes(liveTwist.axis)
    ||typeof liveTwist.label!=='string'||typeof liveTwist.description!=='string'){
    throw Error('Invalid new AI modifier format: '+JSON.stringify(liveTwist))
  }
  if(/После выполнения|подними бров|вздохни|шепни\s*[«"]|подмигни|каждый\s+произнес[её]нный\s+слово|букв|слог|алфавит|повторяющ(?:иеся|ихся)\s+символ/i.test(liveTwist.description)){
    throw Error('Creative model drifted into irrelevant post-task gestures: '+JSON.stringify(liveTwist))
  }
  if(!/(кажд|без |ни разу|не повтор|не использ|только|ровно|минимум|чередуй|одновременн|два |две |три |конкретн|нельзя|ни одного|ни одной|запрещен|не допускается)/i.test(liveTwist.description)){
    throw Error('Creative modifier did not increase difficulty: '+JSON.stringify(liveTwist))
  }
  console.log('ORIGINAL AI MODIFIER PASSED:',JSON.stringify(liveTwist))

}catch(error){
  console.error('AI Director smoke failed:',error)
  process.exitCode=1
}finally{clearTimeout(timer)}
