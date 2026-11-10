import { completeGameJSON } from './game-providers.js'

/**
 * AI Director Boss: chooses three composable, trusted game mechanics.
 * The Worker NEVER sends arbitrary model-authored dares to the browser.
 * Trusted, locally authored mechanic templates become the actual challenge.
 */
const allowed = {
  party: [
    ['callback-spotlight','voluntary-ballot','opening-echo'],
    ['duel-remix','role-handoff','double-improv'],
    ['ensemble-remix','group-reveal','final-chorus'],
  ],
  afterdark: [
    ['night-callback','voluntary-ballot','opening-echo'],
    ['double-improv','role-handoff','duel-remix'],
    ['ensemble-remix','group-reveal','final-chorus'],
  ],
  couple: [
    ['shared-memory','wish-echo','mutual-choice'],
    ['perspective-switch','paired-improv','surprise-reframe'],
    ['shared-finale','future-choice','open-ending'],
  ],
  sex: [
    ['resume-consented','shared-choice','slow-connection'],
    ['trade-initiative','change-pacing','keep-thread'],
    ['open-ending','together-decide','no-timer-finish'],
  ],
}
const roles=['all','last-actor','last-target','chain-opener','both']
const safeToken=x=>typeof x==='string'&&/^[a-z-]{2,35}$/.test(x)
const safeCopy=/[{}<>\r\n\u0000-\u001f]|https?:|www\.|@|#|(?:обязан|застав|прикаж|накаж|наказ|сними\s+бель|занимайся\s+сексом|поцелуй|трах|минет|кунилинг|проникнов|не\s+можешь\s+отказ)/i
const commands=/^(?:сделай|скажи|назови|выбери|сними|потрогай|поцелуй|начни|выполни|попроси|подойди)(?=\s|[!,.?:]|$)/i
const clean=(x,min,max)=>typeof x==='string'&&x===x.trim()
  &&x.length>=min&&x.length<=max&&!safeCopy.test(x)&&!commands.test(x)?x:null

const SYSTEM=[
  'Ты драматург кульминационных AI Boss Events для совершеннолетней русскоязычной игры «Без Фильтров».',
  'Сгенерируй ОРИГИНАЛЬНОЕ короткое название и три тематически связанные фазы по реальным метаданным уже сыгранных раундов.',
  'Твой результат — ТОЛЬКО JSON title и phases: ровно 3 элемента с mechanic, role и caption.',
  'Каждый mechanic выбирай строго из allowedMechanics соответствующего индекса фазы (первая / поворот / финал). Механики превращаются в готовое безопасное действие на устройстве; ты НЕ можешь писать свои действия.',
  'Не повторяй комбинацию mechanics из bossHistory. Свяжи начало и финал через recent и chainOutcomes, если там есть подтверждённые факты.',
  'role: в party/afterdark all, last-actor, last-target или chain-opener; в sex/couple только both. role — предложение добровольному участнику, не принуждение и не доказательство согласия.',
  'caption — короткая оригинальная атмосферная фраза (12–110 символов), а НЕ команда: никаких действий, сексуальных подробностей, наказаний, новых практик, таймеров, подглядывания, фотографии или раскрытия секретов.',
  'Для sex не предлагай новой практики, смены позы, обнажения или эскалации. Доступная механика относится лишь к тому, на что уже согласились оба.',
  'У тебя НЕТ информации об устных ответах, переживаниях или желаниях людей. Никогда их не выдумывай.',
  'Сложность 🔥 определяет только игрок в обычных ходах; Boss не может изменить риск, границы или роли без желания участников.',
  'Дай живое, неожиданное русское название, а не формулу «Финальный раунд». Не упоминай AI, JSON и ограничения.',
].join(' ')

function respond(data,status,origin,headers={}) {
  return new Response(JSON.stringify(data),{status,headers:{
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store','Vary':'Origin',
    'Access-Control-Allow-Origin':origin,...headers,
  }})
}

function validateRequest(body) {
  if(!body||typeof body!=='object'||body.version!==1)return null
  const scenario=body.scenario
  if(!Object.hasOwn(allowed,scenario))return null
  if(!Number.isInteger(body.stage)||body.stage<0||body.stage>4
    ||!Number.isInteger(body.turnsPlayed)||body.turnsPlayed<0||body.turnsPlayed>100000
    ||!Number.isFinite(body.tension)||body.tension<0||body.tension>160
    ||!Number.isInteger(body.playersCount)||body.playersCount<2||body.playersCount>6
    ||body.chainFamily!==null&&!safeToken(body.chainFamily))return null
  if(scenario==='party'&&body.playersCount<3)return null
  if((scenario==='couple'||scenario==='sex')&&body.playersCount!==2)return null
  if(!Array.isArray(body.allowedMechanics)||body.allowedMechanics.length!==3
    ||body.allowedMechanics.some((p,i)=>!Array.isArray(p)
      ||p.length!==allowed[scenario][i].length
      ||p.some((mechanic,j)=>mechanic!==allowed[scenario][i][j])))return null
  if(!Array.isArray(body.recent)||body.recent.length>8)return null
  const recent=body.recent.map(item=>({
    actorIndex:item?.actorIndex,targetIndex:item?.targetIndex,type:item?.type,
    risk:item?.risk,skipped:item?.skipped,chains:item?.chains,
  }))
  if(recent.some(x=>!Number.isInteger(x.actorIndex)||x.actorIndex<0||x.actorIndex>=body.playersCount
    ||x.targetIndex!==null&&(!Number.isInteger(x.targetIndex)||x.targetIndex<0||x.targetIndex>=body.playersCount)
    ||!['truth','dare'].includes(x.type)||![1,2,3].includes(x.risk)
    ||typeof x.skipped!=='boolean'||!Array.isArray(x.chains)
    ||x.chains.length>3||x.chains.some(c=>!safeToken(c))))return null
  const chainOutcomes=body.chainOutcomes??[]
  if(!Array.isArray(chainOutcomes)||chainOutcomes.length>4
    ||chainOutcomes.some(x=>!x||!['finished','skipped','unavailable'].includes(x.result)
      ||!safeToken(x.openingChain)))return null
  const bossHistory=body.bossHistory??[]
  if(!Array.isArray(bossHistory)||bossHistory.length>4
    ||bossHistory.some(x=>!x||!Array.isArray(x.mechanics)||x.mechanics.length>3
      ||x.mechanics.some(m=>!safeToken(m))
      ||!['finished','skipped'].includes(x.outcome)))return null
  return {
    version:1,scenario,stage:body.stage,turnsPlayed:body.turnsPlayed,
    tension:body.tension,chainFamily:body.chainFamily,playersCount:body.playersCount,
    allowedMechanics:allowed[scenario].map(p=>[...p]),
    recent,
    chainOutcomes:chainOutcomes.map(x=>({result:x.result,openingChain:x.openingChain})),
    bossHistory:bossHistory.map(x=>({outcome:x.outcome,mechanics:x.mechanics.slice(0,3)})),
  }
}

export async function handleGameBoss(request,env,origin) {
  if(request.method!=='POST')return respond({error:'Доступен только POST.'},405,origin)
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')??'')){
    return respond({error:'Ожидается JSON.'},415,origin)
  }
  if(Number(request.headers.get('Content-Length')||0)>12000)return respond({error:'Слишком большой запрос.'},413,origin)
  let input
  try {
    const raw=await request.text()
    if(raw.length>12000)return respond({error:'Слишком большой запрос.'},413,origin)
    input=validateRequest(JSON.parse(raw))
  }catch{return respond({error:'Некорректный JSON.'},400,origin)}
  if(!input)return respond({error:'Недопустимые параметры Boss.'},400,origin)
  const scenarioRoles=input.scenario==='sex'||input.scenario==='couple'?['both']:roles.slice(0,4)
  const schema={
    type:'object',properties:{
      title:{type:'string'},
      phases:{
        type:'array',items:{
          type:'object',properties:{
            mechanic:{type:'string',enum:input.allowedMechanics.flat()},
            role:{type:'string',enum:scenarioRoles},
            caption:{type:'string'},
          },
          required:['mechanic','role','caption'],additionalProperties:false,
        },
      },
    },required:['title','phases'],additionalProperties:false,
  }
  try {
    const generation=await completeGameJSON(env,{
      route:'game-boss',system:SYSTEM,payload:input,schema,
      name:'game_boss_v1',temperature:0.75,tokens:1300,
    })
    if(!generation.value){
      const status=generation.error===429?429:generation.error===503?503:502
      return respond({error:'AI Boss временно недоступен.'},status,origin,
        generation.retryAfterSeconds?{'Retry-After':String(generation.retryAfterSeconds)}:{})
    }
    const raw=generation.value
    const title=clean(raw?.title,6,58)
    const phases=raw?.phases
    const seen=new Set()
    if(!title||!Array.isArray(phases)||phases.length!==3
      ||!phases.every((phase,i)=>{
        if(!phase||!input.allowedMechanics[i].includes(phase.mechanic)
          ||!scenarioRoles.includes(phase.role)||seen.has(phase.mechanic))return false
        seen.add(phase.mechanic)
        return true
      })
      ||input.bossHistory.some(old=>old.mechanics.join('|')===phases.map(p=>p.mechanic).join('|'))){
      return respond({error:'Boss не прошёл проверку структуры.'},422,origin)
    }
    return respond({
      title,
      phases:phases.map(p=>({
        mechanic:p.mechanic,role:p.role,caption:clean(p.caption,12,110)??'',
      })),
    },200,origin,{'X-AI-Provider':generation.provider,
      'X-AI-Fallback':String(generation.fallback),'X-AI-Attempts':generation.attempts})
  }catch{return respond({error:'Не удалось создать Boss.'},502,origin)}
}
