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
  console.log('AI Director live status:',response.status)
  if(!response.ok) throw Error('Endpoint returned '+response.status+': '+JSON.stringify(data))
  if(!payload.candidates.some(c=>c.id===data?.selectedId)) {
    throw Error('AI selected an unknown card ID: '+JSON.stringify(data))
  }
  if(typeof data.intro!=='string'||!data.intro.trim())throw Error('AI intro missing')
  console.log('AI Director live OK:',JSON.stringify(data))
  const twistUrl=url.replace(/\/game\/director$/, '/game/modifier')
  const twistPayload={
    version:1,scenario:'afterdark',stage:0,risk:2,cardType:'dare',
    chains:['chaos','social'],
    cardText:'Пятнадцать секунд рекламируй ночной перекус как дорогую вещь, используя голос, походку и мимику.',
    allowedKinds:['reaction','performance'],
    recentLabels:['НЕЛОВКАЯ ПАУЗА'],
  }
  const twistResponse=await fetch(twistUrl,{
    method:'POST',
    headers:{'Origin':'https://swaggyt00.github.io','Content-Type':'application/json'},
    body:JSON.stringify(twistPayload),signal:controller.signal,
  })
  const twistData=await twistResponse.json().catch(()=>null)
  console.log('AI Modifier live status:',twistResponse.status)
  if(!twistResponse.ok)throw Error('Modifier endpoint rejected: '+JSON.stringify(twistData))
  if(!twistPayload.allowedKinds.includes(twistData?.kind)||!twistData?.description||!twistData?.label)
    throw Error('Invalid live modifier: '+JSON.stringify(twistData))
  console.log('AI Modifier live OK:',JSON.stringify(twistData))
}catch(error){
  console.error('AI Director smoke failed:',error)
  process.exitCode=1
}finally{clearTimeout(timer)}
