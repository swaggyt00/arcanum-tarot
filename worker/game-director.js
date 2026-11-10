/**
 * AI Director for "Без Фильтров".
 * This endpoint chooses ONLY from prevalidated card identifiers; it never
 * generates or edits challenge text and never sees player names or card text.
 */
import { completeGameJSON } from './game-providers.js'

const SYSTEM = [
  'Ты AI Director русскоязычной игры для совершеннолетних «Без Фильтров».',
  'Твоя задача — не придумывать карточки, а режиссировать темп: выбрать ОДИН ID из предложенных кандидатов.',
  'Каждый кандидат уже проверен игровым движком по текущему риску, стадии, границам и ограничениям.',
  'Никогда не выходи за список ID, не меняй уровни риска, не сочиняй новые правила и не объявляй повышения стадии.',
  'Учитывай цепочку, tension, повторения типов и предыдущие ходы.',
  'Поля players и events — обезличенная память об игровом поведении: уровни риска разных игроков, пропуски, прошлые AI-события и решения принять/отклонить их.',
  'Учитывай историю событий, не повторяй однотипную драматургию и не противоречь только что принятому игровому событию.',
  'Поле pacing — безопасный локальный план темпа, рассчитанный по сыгранным ходам, а не по эмоциям участников. Следуй этому плану при выборе ID.',
  'pacing.intent=develop: развивай подходящую цепочку; pivot: смени повторяющийся тип или тему; recover: после пропуска НЕ повторяй ту же тему; breather: дай контраст внутри выбранного риска; explore: ищи разнообразие.',
  'pacing.focusChain и avoidChain — предпочтения, НЕ разрешение нарушать границы. Если shortlist не допускает точного темпа, просто выбери самый логичный разрешённый ID.',
  'pacing.momentum и players.targetedRecent — обезличенная статистика участия, а не оценки отношений или удовольствия. Не делай психологических выводов.',
  'Выбор игроком уровня риска всегда главнее твоего сценария; ты не можешь повышать риск и не предлагаешь наказания за пропуски.',
  'Для sex не обрывай последовательную интимную сцену ради разнообразия и не предлагай неожиданных новых практик.',
  'Ты НЕ слышишь устные ответы на «Правду», не знаешь реальных эмоций или отношений игроков. НЕ выдумывай сказанного ими.',
  'Если игроки несколько ходов застряли в одной семье, используй контраст; если сцена развивается логично, продолжай её.',
  'Для режима sex сохраняй дерзкий, чувственный, провокационный вайб взрослых людей; не превращай напряжённую сцену в детский утренник.',
  'Теперь ты также решаешь, стоит ли добавить ОДНО AI-условие к карточке. Если allowCondition=false, addCondition всегда false.',
  'Если forceCondition=true, addCondition всегда true. Иначе: на риске 2 добавляй условие примерно в трети ходов, на риске 3 — примерно в половине; не каждый раз.',
  'Если недавние ходы содержали условия, делай паузу. Не дублируй атмосферные подводки.',
  'Между похожими Truth-картами предпочитай смену на Dare, а после однообразной цепочки выбирай контраст. Но не ломай логическую связь сцены.',
  'Но не перескакивай через стадию: сильный риск на ранней стадии — это смелость в рамках ранней стадии.',
  'Поле intro — одна короткая живая русская подводка к следующему повороту, 6–18 слов.',
  'Подводка эмоциональна и игрива, но НЕ содержит инструкций, конкретных действий, таймеров, ссылок на невидимую карточку, имён игроков или сексуальных подробностей.',
  'Никакой морали, канцелярита, извинений, ссылок на ИИ, JSON или ограничения.',
  'Верни строго JSON с полями selectedId и intro.',
].join(' ')

function respond(data, status, origin, extra = {}) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
    'Access-Control-Allow-Origin': origin,
    ...extra,
  }
  return new Response(JSON.stringify(data), { status, headers })
}

// Legacy Director IDs are prefixed with v09:; the colon is a valid separator.
const safeToken = value => typeof value === 'string' && /^[a-z0-9:-]{2,120}$/.test(value)
const safeChain = value => typeof value === 'string' && /^[a-z-]{2,35}$/.test(value)
const validIntent = new Set(['explore','develop','pivot','recover','breather'])
const validTypeOrNull = value => value === null || value === 'truth' || value === 'dare'
const validChainOrNull = value => value === null || safeChain(value)

function validateRequest(body) {
  if (!body || typeof body !== 'object' || body.version !== 1) return null
  if (!['couple','sex','party','afterdark'].includes(body.scenario)) return null
  if (![1,2,3].includes(body.risk) || !Number.isInteger(body.stage) || body.stage < 0 || body.stage > 4) return null
  if (typeof body.tension !== 'number' || body.tension < 0 || body.tension > 160) return null
  if (!Number.isInteger(body.chainDepth) || body.chainDepth < 0 || body.chainDepth > 20) return null
  if (body.chainFamily !== null && !safeChain(body.chainFamily)) return null
  if (!Array.isArray(body.candidates) || body.candidates.length < 2 || body.candidates.length > 16) return null
  if (!Array.isArray(body.recent) || body.recent.length > 8) return null

  const candidates = body.candidates.map(item => ({
    id: item?.id,
    type: item?.type,
    chains: item?.chains,
    score: item?.score,
  }))
  if (candidates.some(item =>
    !safeToken(item.id)
    || !['truth','dare'].includes(item.type)
    || !Array.isArray(item.chains) || item.chains.length > 3
    || item.chains.some(chain => !safeChain(chain))
    || !Number.isFinite(item.score) || Math.abs(item.score) > 500
  )) return null
  if (new Set(candidates.map(item => item.id)).size !== candidates.length) return null
  const recent = body.recent.map(item => ({
    type: item?.type, risk: item?.risk, chains: item?.chains, skipped: item?.skipped,
    modifierCount: item?.modifierCount ?? 0,
    actorIndex: item?.actorIndex ?? 0,
  }))
  if (recent.some(item =>
    !['truth','dare'].includes(item.type) || ![1,2,3].includes(item.risk)
    || !Array.isArray(item.chains) || item.chains.length > 3
    || item.chains.some(chain => !safeChain(chain)) || typeof item.skipped !== 'boolean'
    || (item.modifierCount !== undefined && (!Number.isInteger(item.modifierCount) || item.modifierCount < 0 || item.modifierCount > 2))
    || !Number.isInteger(item.actorIndex) || item.actorIndex < 0 || item.actorIndex > 5
  )) return null
  // Optional v2 pacing metadata preserves compatibility with existing v1 clients.
  const pacing=body.pacing ?? null
  if(pacing!==null && (
    !pacing || typeof pacing!=='object' || !validIntent.has(pacing.intent)
    || !Number.isInteger(pacing.momentum) || pacing.momentum<0 || pacing.momentum>3
    || !validTypeOrNull(pacing.preferType) || !validChainOrNull(pacing.focusChain)
    || !validChainOrNull(pacing.avoidChain)
    || typeof pacing.suppressOptionalModifier!=='boolean'
  ))return null
  const players=Array.isArray(body.players)?body.players:[]
  const events=Array.isArray(body.events)?body.events:[]
  const actorIndex=body.actorIndex ?? 0
  if(!Number.isInteger(actorIndex)||actorIndex<0||actorIndex>5)return null
  if(players.length>6||players.some((p,i)=>p.index!==i||!Array.isArray(p.lastRisks)
    ||p.lastRisks.length>5||p.lastRisks.some(x=>![1,2,3].includes(x))
    ||!Number.isInteger(p.skippedRecent)||p.skippedRecent<0||p.skippedRecent>12
    ||(p.targetedRecent!==undefined&&(!Number.isInteger(p.targetedRecent)||p.targetedRecent<0||p.targetedRecent>16))))return null
  if(players.length>0 && actorIndex>=players.length)return null
  if(recent.some(item=>players.length>0&&item.actorIndex>=players.length))return null
  if(events.length>6||events.some(x=>!Number.isInteger(x.turn)||x.turn<0
    ||typeof x.title!=='string'||x.title.length>55||/[{}<>\u0000-\u001f]/.test(x.title)
    ||!Array.isArray(x.mechanics)||x.mechanics.length>2
    ||x.mechanics.some(key=>!['risk-handoff','truth-only','dare-only','mirror-type','contrast-type','change-theme','continue-theme'].includes(key))
    ||typeof x.accepted!=='boolean'))return null
  const sanitizedPlayers=players.map((p,index)=>({
    index,lastRisks:p.lastRisks.slice(0,5),skippedRecent:p.skippedRecent,
    targetedRecent:p.targetedRecent??0,
  }))
  const sanitizedEvents=events.map(x=>({
    turn:x.turn,title:x.title,mechanics:x.mechanics.slice(0,2),accepted:x.accepted,
  }))
  const sanitizedPacing=pacing===null
    ?{intent:'explore',momentum:0,preferType:null,focusChain:null,avoidChain:null,suppressOptionalModifier:false}
    :{
      intent:pacing.intent,momentum:pacing.momentum,preferType:pacing.preferType,
      focusChain:pacing.focusChain,avoidChain:pacing.avoidChain,
      suppressOptionalModifier:pacing.suppressOptionalModifier,
    }
  return {
    scenario: body.scenario, risk: body.risk, stage: body.stage,
    tension: body.tension, chainFamily: body.chainFamily,
    chainDepth: body.chainDepth, recent, candidates,
    actorIndex, players:sanitizedPlayers, events:sanitizedEvents,
    pacing:sanitizedPacing,
    allowCondition: body.allowCondition === true,
    forceCondition: body.forceCondition === true && body.allowCondition === true,
  }
}

export async function handleGameDirector(request, env, origin) {
  if (request.method !== 'POST') return respond({error: 'Доступен только POST.'}, 405, origin)
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type') || '')) {
    return respond({error:'Ожидается JSON.'},415,origin)
  }
  if (Number(request.headers.get('Content-Length') || 0) > 10000) {
    return respond({error:'Слишком большой запрос.'},413,origin)
  }
  let parsed
  try {
    const raw = await request.text()
    if (raw.length > 10000) return respond({error:'Слишком большой запрос.'},413,origin)
    parsed = validateRequest(JSON.parse(raw))
  } catch {
    return respond({error:'Некорректный JSON.'},400,origin)
  }
  if (!parsed) return respond({error:'Недопустимое состояние игры.'},400,origin)

  const schema = {
    type:'object',
    properties:{
      selectedId:{type:'string',enum:parsed.candidates.map(candidate=>candidate.id)},
      intro:{type:'string'},
      addCondition:{type:'boolean'},
    },
    required:['selectedId','intro','addCondition'],
    additionalProperties:false,
  }
  try {
    const generated = await completeGameJSON(env,{
      route:'game-director',
      system:SYSTEM,
      payload:parsed,
      schema,
      name:'game_director_pick',
      temperature:0.65,
      tokens:850,
    })
    if (!generated.value) {
      const status=generated.error===429?429:generated.error===503?503:502
      return respond({error:status===429?'AI-провайдеры временно ограничили запросы.':'AI сейчас недоступен.'},
        status,origin,
        generated.retryAfterSeconds ? {'Retry-After':String(generated.retryAfterSeconds)}:{})
    }
    const result=generated.value
    if (!parsed.candidates.some(item => item.id === result?.selectedId)) {
      return respond({error:'AI выбрал недоступную карточку.'},502,origin)
    }
    const intro = typeof result?.intro === 'string'
      ? result.intro.replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,150)
      : ''
    return respond({
      selectedId:result.selectedId,
      intro,
      addCondition:parsed.allowCondition && (parsed.forceCondition || result.addCondition === true),
    },200,origin,{'X-AI-Provider':generated.provider,'X-AI-Fallback':String(generated.fallback),
      'X-AI-Attempts':generated.attempts})
  } catch {
    return respond({error:'Не удалось получить ответ AI.'},502,origin)
  }
}
