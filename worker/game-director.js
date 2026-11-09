/**
 * AI Director for "Без Фильтров".
 * This endpoint chooses ONLY from prevalidated card identifiers; it never
 * generates or edits challenge text and never sees player names or card text.
 */
const GAME_MODEL = 'openai/gpt-oss-120b'

const SYSTEM = [
  'Ты AI Director русскоязычной игры для совершеннолетних «Без Фильтров».',
  'Твоя задача — не придумывать карточки, а режиссировать темп: выбрать ОДИН ID из предложенных кандидатов.',
  'Каждый кандидат уже проверен игровым движком по текущему риску, стадии, границам и ограничениям.',
  'Никогда не выходи за список ID, не меняй уровни риска, не сочиняй новые правила и не объявляй повышения стадии.',
  'Учитывай цепочку, tension, повторения типов и предыдущие ходы.',
  'Если игроки несколько ходов застряли в одной семье, используй контраст; если сцена развивается логично, продолжай её.',
  'Для режима sex сохраняй дерзкий, чувственный, провокационный вайб взрослых людей; не превращай напряжённую сцену в детский утренник.',
  'Но не перескакивай через стадию: сильный риск на ранней стадии — это смелость в рамках ранней стадии.',
  'Поле intro — одна короткая живая русская подводка к следующему повороту, 6–18 слов.',
  'Подводка эмоциональна и игрива, но НЕ содержит инструкций, конкретных действий, таймеров, ссылок на невидимую карточку, имён игроков или сексуальных подробностей.',
  'Никакой морали, канцелярита, извинений, ссылок на ИИ, JSON или ограничения.',
  'Верни строго JSON с полями selectedId и intro.',
].join(' ')

function respond(data, status, origin) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
    'Access-Control-Allow-Origin': origin,
  }
  return new Response(JSON.stringify(data), { status, headers })
}

const safeToken = value => typeof value === 'string' && /^[a-z0-9-]{2,120}$/.test(value)
const safeChain = value => typeof value === 'string' && /^[a-z-]{2,35}$/.test(value)

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
  }))
  if (recent.some(item =>
    !['truth','dare'].includes(item.type) || ![1,2,3].includes(item.risk)
    || !Array.isArray(item.chains) || item.chains.length > 3
    || item.chains.some(chain => !safeChain(chain)) || typeof item.skipped !== 'boolean'
  )) return null
  return {
    scenario: body.scenario, risk: body.risk, stage: body.stage,
    tension: body.tension, chainFamily: body.chainFamily,
    chainDepth: body.chainDepth, recent, candidates,
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
    },
    required:['selectedId','intro'],
    additionalProperties:false,
  }
  try {
    const model = env.GROQ_GAME_MODEL || GAME_MODEL
    const supportsStrict = /^openai\/gpt-oss-(20b|120b)$/.test(model)
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions',{
      method:'POST',
      headers:{Authorization:'Bearer '+env.GROQ_API_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({
        model,
        temperature:0.65,
        max_completion_tokens:850,
        ...(supportsStrict ? {reasoning_effort:'low'} : {}),
        response_format:supportsStrict
          ? {type:'json_schema',json_schema:{name:'game_director_pick',strict:true,schema}}
          : {type:'json_object'},
        messages:[
          {role:'system',content:SYSTEM},
          {role:'user',content:JSON.stringify(parsed)},
        ],
      }),
    })
    if (!response.ok) {
      return respond({error:response.status === 429 ? 'Провайдер перегружен.' : 'AI сейчас недоступен.'},
        response.status === 429 ? 429 : 502, origin)
    }
    const data = await response.json().catch(()=>null)
    const raw = data?.choices?.[0]?.message?.content
    if (typeof raw !== 'string') return respond({error:'Пустой AI-ответ.'},502,origin)
    let result
    try { result=JSON.parse(raw) } catch { return respond({error:'Неверный AI-ответ.'},502,origin) }
    if (!parsed.candidates.some(item => item.id === result?.selectedId)) {
      return respond({error:'AI выбрал недоступную карточку.'},502,origin)
    }
    const intro = typeof result?.intro === 'string'
      ? result.intro.replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,150)
      : ''
    return respond({selectedId:result.selectedId,intro},200,origin)
  } catch {
    return respond({error:'Не удалось получить ответ AI.'},502,origin)
  }
}
