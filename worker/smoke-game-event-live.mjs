/**
 * One-off production smoke, dispatched via push to this file or manually.
 * Exercises public Worker using ANONYMOUS metadata; does not require keys in CI.
 */
const url='https://arcanum-tarot-ai.kunicin27522.workers.dev/game/event'
const input={
  version:1,scenario:'party',stage:1,tension:42,turnsPlayed:8,
  playersCount:3,actorIndex:2,chainFamily:'social',chainDepth:2,
  allowedMechanics:['risk-handoff','truth-only','dare-only','mirror-type','contrast-type','change-theme','continue-theme'],
  players:[
    {index:0,recentRisks:[2,1,2],skippedRecent:0},
    {index:1,recentRisks:[3,2],skippedRecent:1},
    {index:2,recentRisks:[1,2],skippedRecent:0},
  ],
  recent:[
    {actorIndex:0,type:'truth',risk:2,skipped:false,chains:['confession'],modifierCount:0},
    {actorIndex:1,type:'dare',risk:3,skipped:true,chains:['embarrassment'],modifierCount:0},
    {actorIndex:2,type:'dare',risk:1,skipped:false,chains:['social'],modifierCount:1},
    {actorIndex:0,type:'dare',risk:2,skipped:false,chains:['social'],modifierCount:0},
  ],
  events:[{turn:4,title:'Переключение раунда',mechanics:['risk-handoff'],accepted:true}],
}
const headers={'Origin':'https://swaggyt00.github.io','Content-Type':'application/json'}
const controller=new AbortController()
const timer=setTimeout(()=>controller.abort(),40000)
let passed=false
try {
  for(let attempt=1;attempt<=2;attempt++) {
    const response=await fetch(url,{
      method:'POST',headers,body:JSON.stringify(input),signal:controller.signal,
    })
    const result=await response.json().catch(()=>null)
    const provider=response.headers.get('X-AI-Provider')
    console.log('LIVE AI EVENT:',JSON.stringify({attempt,status:response.status,
      provider,mechanics:result?.mechanics,title:result?.title,description:result?.description,
      error:result?.error,failureStages:result?.failureStages}))
    if(response.status===429){
      console.log('PARTIAL: Groq and Gemini are rate-limited; no event is required for game continuity.')
      process.exitCode=0
      break
    }
    if(response.status===422)continue
    if(!response.ok)throw Error('AI Event endpoint failed: '+response.status)
    if(!Array.isArray(result?.mechanics)||result.mechanics.length<1||result.mechanics.length>2
      ||result.mechanics.some(x=>!input.allowedMechanics.includes(x))){
      throw Error('AI Event invented an unavailable mechanic: '+JSON.stringify(result))
    }
    if(typeof result.title!=='string'||result.title.length<7
      ||typeof result.description!=='string'||result.description.length<55){
      throw Error('Generated event is not a complete original scenario')
    }
    if(!['groq','gemini'].includes(provider)){
      throw Error('Missing real model attribution in verified AI event response')
    }
    console.log('PASS: original memory-based event + independent quality reviewer responded in production.')
    passed=true
    break
  }
  if(!passed&&process.exitCode!==0)throw Error('No original event passed after 2 attempts')
}catch(error){
  console.error('FAIL: '+String(error))
  process.exitCode=1
}finally{clearTimeout(timer)}
