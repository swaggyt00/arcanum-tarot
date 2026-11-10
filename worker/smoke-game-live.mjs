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
const timer=setTimeout(()=>controller.abort(),30000)
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
  console.log('AI Director live OK:',JSON.stringify(data))
  const twistUrl=url.replace(/\/game\/director$/, '/game/modifier')
  const twistPayload={
    version:3,scenario:'afterdark',stage:0,risk:2,cardType:'dare',
    chains:['chaos','social'],
    cardText:'Пятнадцать секунд рекламируй ночной перекус как дорогую вещь, используя голос, походку и мимику.',
    allowedAxes:['precision','sequence','constraint','tempo'],
    recentLabels:['ПРЕДЫДУЩАЯ СЛОЖНОСТЬ'],
  }
  let liveTwist=null
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
    if(response.status===422)continue // Rejected creativity is expected sometimes.
    if(!response.ok)throw Error('AI modifier endpoint unavailable: '+JSON.stringify(candidate))
    liveTwist=candidate
    break
  }
  if(!liveTwist)throw Error('No creative modifier passed independent validation across three samples.')
  if(!twistPayload.allowedAxes.includes(liveTwist.axis)
    ||typeof liveTwist.label!=='string'||typeof liveTwist.description!=='string'){
    throw Error('Invalid new AI modifier format: '+JSON.stringify(liveTwist))
  }
  if(/После выполнения|подними бров|вздохни|шепни\s*[«"]|подмигни/i.test(liveTwist.description)){
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
