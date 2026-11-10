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
  'Ты также создаёшь короткий НЕВИДИМЫЙ сюжетный план scenePlan: РОВНО три будущих шага в строгом порядке build → twist → payoff. Каждый шаг — только phase, chain, preferredType. Это направления выбора карт, а НЕ действия, обязательства, новые правила или обещания событий.',
  'Придумай согласованную драматургическую дугу на основе имеющихся chain-тем, истории принятых и пропущенных ходов, а не выдуманных устных признаний и эмоций.',
  'ОБЯЗАТЕЛЬНО: первый beat build и третий beat payoff должны иметь chain, присутствующий в chains выбранной selectedId карточки. Так финал вернётся к началу истории. Средний beat twist вправе сменить chain только в разрешённых темах.',
  'В couple/party/afterdark второй beat twist ОБЯЗАТЕЛЬНО меняет chain относительно selectedId, когда среди candidates есть иная chain. Если иной chain нет, сохрани исходную. Третий beat payoff возвращается к chain selectedId.',
  'В sex во время физической сцены twist означает изменение нюанса ВНУТРИ уже допустимой темы, НЕ новую сексуальную практику и не переключение на неожиданный опрос.',
  'Указывай в scenePlan только chain из списка доступных candidate chains. Если на будущем ходе выбран другой риск, стадия или участник, план необязателен и отступает перед реальной проверкой допустимости.',
  'Если activeScene задан, это уже сохранённый предыдущий план. Выбирай подходящую доступную карточку, если это не противоречит актуальному риску, skip или локальному pacing.',
  'Никаких текстов будущих заданий, инструкций, имён, фантазий за игроков или требований выполнить что-либо в будущем: только chain, phase, preferredType. Согласие и границы важнее сюжета.',
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
  'Создай также НОВУЮ AI Chains цепочку с оригинальным кратким названием chainPlan.title (6–55 символов), и тремя будущими фазами chainPlan.beats. Каждый beat содержит phase, normalTarget, boldTarget, line.',
  'normalTarget применяется при выборе 🔥 или 🔥🔥, boldTarget — только при добровольном выборе 🔥🔥🔥. Это НЕ повышает риск задания и никогда не меняет игрока, который сейчас ходит.',
  'Значения normalTarget и boldTarget только: fair, opener, first-target, previous-actor, previous-target. Это реальные обезличенные роли из истории игры; при отсутствии подходящего адресата приложение выбирает обычную допустимую цель.',
  'Для компании используй социальную эстафету, возвращения к прежним участникам и неожиданные смены фокуса. Для sex всегда выбирай оба target-правила fair: физическую сцену не следует разрывать.',
  'Каждый beat.line — оригинальная короткая русская подводка 12–125 символов без новых заданий, команд, откровенных действий, упоминаний неуслышанных ответов или выдуманных эмоций. Название и подводки не должны повторяться дословно.',
  'В уже активной цепочке activeChain продолжай историю, а не создавай новую за спиной участников. Если цепочка завершилась или была пропущена, разрешён новый сюжет.',
  'chainOutcomes сообщает только о завершении, пропуске или невозможности предыдущей цепочки. Никогда не превращай пропуск в наказание.',
  'Верни строго JSON с полями selectedId, intro, addCondition, scenePlan и chainPlan.',
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
const storyPhases = ['build','twist','payoff']
const validPreferredType = value => ['truth','dare','either'].includes(value)
const chainTargetRules = ['fair','opener','first-target','previous-actor','previous-target']
const validChainResult = value => ['finished','skipped','unavailable'].includes(value)
const unsafeChainCopy = /[{}<>\r\n\u0000-\u001f]|https?:|www\.|@|#|(?:обязан|застав|прикаж|накаж|сними\s+бель|занимайся\s+сексом|поцелуй|трах|минет|кунилинг|проникнов|не\s+сможешь\s+отказ)/i
const cleanChainText = (value,min,max) => typeof value === 'string'
  && value === value.trim() && value.length>=min && value.length<=max
  && !unsafeChainCopy.test(value) ? value : null

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
  const activeScene=body.activeScene??null
  if(activeScene!==null && (
    typeof activeScene!=='object'
    || !Number.isInteger(activeScene.originTurn) || activeScene.originTurn<0 || activeScene.originTurn>100000
    || !Number.isInteger(activeScene.beatIndex) || activeScene.beatIndex<0 || activeScene.beatIndex>2
    || !storyPhases.includes(activeScene.phase)
    || !safeChain(activeScene.chain)
    || !validPreferredType(activeScene.preferredType)
  ))return null
  const activeChain=body.activeChain??null
  if(activeChain!==null&&(
    typeof activeChain!=='object'
    ||!Number.isInteger(activeChain.beatIndex)||activeChain.beatIndex<0||activeChain.beatIndex>2
    ||!Number.isInteger(activeChain.openerActorIndex)||activeChain.openerActorIndex<0||activeChain.openerActorIndex>5
    ||!(activeChain.openerTargetIndex===null||(Number.isInteger(activeChain.openerTargetIndex)&&activeChain.openerTargetIndex>=0&&activeChain.openerTargetIndex<=5))
    ||!chainTargetRules.includes(activeChain.normalTarget)
    ||!chainTargetRules.includes(activeChain.boldTarget)
  ))return null
  const chainOutcomes=body.chainOutcomes??[]
  if(!Array.isArray(chainOutcomes)||chainOutcomes.length>5
    ||chainOutcomes.some(x=>!x||typeof x!=='object'
      ||!validChainResult(x.result)||!safeChain(x.openingChain)))return null
  const players=Array.isArray(body.players)?body.players:[]
  const events=Array.isArray(body.events)?body.events:[]
  const actorIndex=body.actorIndex ?? 0
  if(!Number.isInteger(actorIndex)||actorIndex<0||actorIndex>5)return null
  if(players.length>6||players.some((p,i)=>p.index!==i||!Array.isArray(p.lastRisks)
    ||p.lastRisks.length>5||p.lastRisks.some(x=>![1,2,3].includes(x))
    ||!Number.isInteger(p.skippedRecent)||p.skippedRecent<0||p.skippedRecent>12
    ||(p.targetedRecent!==undefined&&(!Number.isInteger(p.targetedRecent)||p.targetedRecent<0||p.targetedRecent>16))))return null
  if(players.length>0 && actorIndex>=players.length)return null
  if(activeChain&&players.length>0&&(activeChain.openerActorIndex>=players.length
    ||activeChain.openerTargetIndex!==null&&activeChain.openerTargetIndex>=players.length))return null
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
    chainOutcomes:chainOutcomes.map(item=>({
      result:item.result,openingChain:item.openingChain,
    })),
    activeChain:activeChain===null?null:{
      beatIndex:activeChain.beatIndex,
      openerActorIndex:activeChain.openerActorIndex,
      openerTargetIndex:activeChain.openerTargetIndex,
      normalTarget:activeChain.normalTarget,
      boldTarget:activeChain.boldTarget,
    },
    activeScene:activeScene===null?null:{
      originTurn:activeScene.originTurn,beatIndex:activeScene.beatIndex,
      phase:activeScene.phase,chain:activeScene.chain,preferredType:activeScene.preferredType,
    },
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

  const planChains=[...new Set(parsed.candidates.flatMap(item=>item.chains))]
  // A plan is only a soft, expiring direction: the future selected risk and
  // actual card eligibility always outrank it.
  const schema = {
    type:'object',
    properties:{
      selectedId:{type:'string',enum:parsed.candidates.map(candidate=>candidate.id)},
      intro:{type:'string'},
      addCondition:{type:'boolean'},
      chainPlan:{
        type:'object',
        properties:{
          title:{type:'string'},
          beats:{
            type:'array',
            items:{
              type:'object',
              properties:{
                phase:{type:'string',enum:storyPhases},
                normalTarget:{type:'string',enum:chainTargetRules},
                boldTarget:{type:'string',enum:chainTargetRules},
                line:{type:'string'},
              },
              required:['phase','normalTarget','boldTarget','line'],
              additionalProperties:false,
            },
          },
        },
        required:['title','beats'],
        additionalProperties:false,
      },
      scenePlan:{
        type:'object',
        properties:{
          beats:{
            type:'array',
            items:{
              type:'object',
              properties:{
                phase:{type:'string',enum:storyPhases},
                chain:{type:'string',enum:planChains.length?planChains:['conversation']},
                preferredType:{type:'string',enum:['truth','dare','either']},
              },
              required:['phase','chain','preferredType'],
              additionalProperties:false,
            },
          },
        },
        required:['beats'],
        additionalProperties:false,
      },
    },
    required:['selectedId','intro','addCondition','scenePlan','chainPlan'],
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
      tokens:1700,
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
    const selected=parsed.candidates.find(item=>item.id===result.selectedId)
    const beats=result?.scenePlan?.beats
    const validPlan=Array.isArray(beats) && beats.length===3
      && selected?.chains.includes(beats[0]?.chain)
      && selected?.chains.includes(beats[2]?.chain)
      && (parsed.scenario==='sex'
        || !planChains.some(chain=>!selected.chains.includes(chain))
        || !selected.chains.includes(beats[1]?.chain))
      && beats.every((beat,index)=>beat&&typeof beat==='object'
        && beat.phase===storyPhases[index]
        && planChains.includes(beat.chain)
        && validPreferredType(beat.preferredType))
    const scenePlan=validPlan
      ?{beats:beats.map(beat=>({
        phase:beat.phase,chain:beat.chain,preferredType:beat.preferredType,
      }))}
      :null
    const proposedChain=result?.chainPlan
    const chainBeats=proposedChain?.beats
    const chainTitle=cleanChainText(proposedChain?.title,6,55)
    const validChain=Boolean(scenePlan&&chainTitle&&Array.isArray(chainBeats)
      &&chainBeats.length===3&&chainBeats.every((beat,index)=>beat
        &&beat.phase===storyPhases[index]
        &&chainTargetRules.includes(beat.normalTarget)
        &&chainTargetRules.includes(beat.boldTarget)))
    const chainPlan=validChain?{
      title:chainTitle,
      beats:chainBeats.map((beat,index)=>({
        phase:storyPhases[index],
        normalTarget:parsed.scenario==='sex'?'fair':beat.normalTarget,
        boldTarget:parsed.scenario==='sex'?'fair':beat.boldTarget,
        line:cleanChainText(beat.line,12,125)??'',
      })),
    }:null
    const intro = typeof result?.intro === 'string'
      ? result.intro.replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,150)
      : ''
    return respond({
      selectedId:result.selectedId,
      intro,
      addCondition:parsed.allowCondition && (parsed.forceCondition || result.addCondition === true),
      scenePlan,
      chainPlan,
    },200,origin,{'X-AI-Provider':generated.provider,'X-AI-Fallback':String(generated.fallback),
      'X-AI-Attempts':generated.attempts})
  } catch {
    return respond({error:'Не удалось получить ответ AI.'},502,origin)
  }
}
