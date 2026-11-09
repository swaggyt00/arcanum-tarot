/**
 * AI Director extra-difficulty selector (v2).
 *
 * The language model sees a card and selects one legitimate, engine-approved
 * game mechanic. It cannot write extra instructions. The server renders
 * immutable, mechanically verifiable rules, eliminating decorative gestures,
 * irrelevant post-task antics, consent coercion and contradictory prose.
 * Player names, past answers and actual participant data never reach Groq.
 */
const MODEL = 'openai/gpt-oss-120b'

const RULES = {
  'truth-details': {
    label: 'ДВЕ КОНКРЕТНЫЕ ДЕТАЛИ',
    description: 'В ответе назови минимум две конкретные детали. Общих фраз без подробностей недостаточно.',
  },
  'truth-reason': {
    label: 'ОБЪЯСНИ СВОЙ ВЫБОР',
    description: 'Помимо ответа обязательно объясни одну конкретную причину, почему выбрал именно этот вариант.',
  },
  'truth-fast': {
    label: 'ОТВЕТ БЕЗ ПОДГОТОВКИ',
    description: 'Дай первый содержательный ответ в течение десяти секунд после прочтения вопроса.',
  },
  'dare-one-take': {
    label: 'ТОЛЬКО ОДИН ДУБЛЬ',
    description: 'Выполни основное задание с первой попытки: без репетиций, повторов и перезапуска.',
  },
  'dare-no-pause': {
    label: 'БЕЗ ПАУЗ',
    description: 'Выполни всё основное задание непрерывно: без пауз и остановок для обдумывания. Прервать можно в любой момент.',
  },
  'dare-quick-start': {
    label: 'ПЯТЬ СЕКУНД НА СТАРТ',
    description: 'Приступи к основному заданию не позднее чем через пять секунд после прочтения, без подготовки.',
  },
  'dare-silence': {
    label: 'НИ ОДНОГО СЛОВА',
    description: 'Выполни основное задание без слов и пояснений. Стоп-сигнал и отказ всегда разрешены.',
  },
  'dare-no-hands': {
    label: 'РУКИ НЕ ПОМОГАЮТ',
    description: 'Выполни основное задание без использования рук. При необходимости можно остановиться.',
  },
  'dare-eyes-closed': {
    label: 'ВСЛЕПУЮ',
    description: 'Выполни основное задание с закрытыми глазами, не меняя места. Если неудобно — остановись.',
  },
  'dare-keep-position': {
    label: 'БЕЗ СМЕНЫ ПОЛОЖЕНИЯ',
    description: 'Выполни основное задание, сохраняя текущее положение тела. Можно прекратить в любой момент.',
  },
}

const SYSTEM = [
  'Ты интеллектуальный режиссёр взрослой русскоязычной игры «Без Фильтров».',
  'Твоя задача — выбрать ОДИН реальный модификатор СЛОЖНОСТИ для исходной карточки.',
  'В ответе укажи ТОЛЬКО kind из allowedKinds. Ничего не дописывай от себя.',
  'Сложность означает проверяемое усложнение исполнения: нехватка времени, запрет повторов, отсутствие пауз, ограничение рук/слов/зрения или необходимость конкретного ответа.',
  'Выбирай то, что лучше подходит исходному заданию и уровню риска. Не добавляй новый сюжет, не украшай мимикой, вздохами, шёпотом или театральным жестом.',
  'Для Truth предпочитай конкретику и дополнительные детали. Для выступления/пантомимы — один дубль, быстрый старт или отсутствие пауз.',
  'Для физического действия бери только явно разрешённые ограничения из allowedKinds.',
  'Учитывай recentLabels: старайся не повторять недавние типы.',
  'Сексуальный режим не является разрешением для нового сексуального действия — ты выбираешь лишь совместимый тип сложности.',
  'Стоп, пропуск задания и личные границы всегда важнее игрового усложнения.',
  'Верни только JSON вида {"kind":"..."} с kind ровно из allowedKinds.',
].join(' ')

function respond(body,status,origin){
  return new Response(JSON.stringify(body),{status,headers:{
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Origin':origin,
  }})
}

const safeChain = value => typeof value === 'string' && /^[a-z-]{2,35}$/.test(value)
const performanceAction =
  /(танц|разыгра|изобраз|пантомим|реклам|парод|сыгра|спой|пой |театрал|подиум|позир|сцен[уаые]|покажи походк|покажи.*мимик|расскаж|произнес|прочитай|объясни|тост)/i
const pauseRequired = /(пауза|паузу|паузами|останов|замри|замереть|задерж|подожди|дождись|по очереди|чередуй|сначала.*затем)/i
const needsSpeech = /(скажи|шепни|назови|ответь|говори|произнес|вслух|команд|слово|спроси|объясни|расскаж|прочитай|тост|реклам|спой|деклам|перескаж|зачитай|объяви)/i
const needsHands = /(рук|ладон|пальц|запяст|держ|массаж|стимуляц|сними|надень|возьми|полож|прикосн|косн|обним|открой|напиш|набери|покажи|обмен|поправ|сожми)/i
const needsVision = /(смотри|взгляд|глаз|прочитай|покажи|экран|галере|фото|заметк|карта|мимик|одежд|аксессуар)/i
const requiresMovement = /(встан|сяд|ляг|перейд|подой|отойд|шаг|танц|пройд|поверн|поз[ауеы]|положени|у стены|между ног|дистанц)/i

function validateBody(body){
  if(!body||typeof body!=='object'||body.version!==2)return null
  if(!['couple','sex','party','afterdark'].includes(body.scenario))return null
  if(![0,1,2,3,4].includes(body.stage)||![1,2,3].includes(body.risk))return null
  if(!['truth','dare'].includes(body.cardType))return null
  if(!Array.isArray(body.chains)||body.chains.length>3||body.chains.some(c=>!safeChain(c)))return null
  if(typeof body.cardText!=='string'||body.cardText.length<15||body.cardText.length>550
    ||/[{}<>\u0000-\u001f]/.test(body.cardText))return null
  if(!Array.isArray(body.allowedKinds)||body.allowedKinds.length<1||body.allowedKinds.length>10
    ||new Set(body.allowedKinds).size!==body.allowedKinds.length)return null
  if(body.allowedKinds.some(kind=>!(kind in RULES)))return null
  if(body.cardType==='truth' && body.allowedKinds.some(kind=>!kind.startsWith('truth-')))return null
  if(body.cardType==='dare' && body.allowedKinds.some(kind=>!kind.startsWith('dare-')))return null

  if(body.allowedKinds.includes('truth-reason')&&/почему|по какой причине|объясни|что заставило|чем обусловлен/i.test(body.cardText))return null
  const hasPerformance=body.scenario!=='sex'&&performanceAction.test(body.cardText)
  if(body.allowedKinds.some(kind=>['dare-one-take','dare-quick-start','dare-no-pause'].includes(kind))&&!hasPerformance)return null
  if(body.allowedKinds.includes('dare-no-pause')&&pauseRequired.test(body.cardText))return null
  if(body.scenario==='sex'&&body.allowedKinds.some(kind=>
    ['dare-silence','dare-eyes-closed','dare-one-take','dare-quick-start','dare-no-pause'].includes(kind)))return null
  if(body.allowedKinds.includes('dare-silence') && needsSpeech.test(body.cardText))return null
  if(body.allowedKinds.includes('dare-no-hands') && needsHands.test(body.cardText))return null
  if(body.allowedKinds.includes('dare-eyes-closed') && (needsVision.test(body.cardText)||requiresMovement.test(body.cardText)))return null
  if(body.allowedKinds.includes('dare-keep-position') && requiresMovement.test(body.cardText))return null
  if(!Array.isArray(body.recentLabels)||body.recentLabels.length>5
    ||body.recentLabels.some(x=>typeof x!=='string'||x.length>50||/[{}<>\u0000-\u001f]/.test(x)))return null
  if(body.allowedKinds.some(kind=>body.recentLabels.includes(RULES[kind].label)))return null
  return {
    scenario:body.scenario,stage:body.stage,risk:body.risk,
    cardType:body.cardType,chains:body.chains,
    cardText:body.cardText,allowedKinds:body.allowedKinds,recentLabels:body.recentLabels,
  }
}

export async function handleGameModifier(request,env,origin){
  if(request.method!=='POST')return respond({error:'Доступен только POST.'},405,origin)
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||''))return respond({error:'Ожидается JSON.'},415,origin)
  if(Number(request.headers.get('Content-Length')||0)>6500)return respond({error:'Слишком большой запрос.'},413,origin)
  let parsed
  try{
    const raw=await request.text()
    if(raw.length>6500)return respond({error:'Слишком большой запрос.'},413,origin)
    parsed=validateBody(JSON.parse(raw))
  }catch{return respond({error:'Некорректный JSON.'},400,origin)}
  if(!parsed)return respond({error:'Несовместимая сложность или устаревшая версия игры.'},400,origin)
  const schema={
    type:'object',
    properties:{kind:{type:'string',enum:parsed.allowedKinds}},
    required:['kind'],additionalProperties:false,
  }
  try {
    const model=env.GROQ_GAME_MODEL||MODEL
    const strict=/^openai\/gpt-oss-(20b|120b)$/.test(model)
    const completion=await fetch('https://api.groq.com/openai/v1/chat/completions',{
      method:'POST',
      headers:{Authorization:'Bearer '+env.GROQ_API_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({
        model,temperature:0.55,max_completion_tokens:500,
        ...(strict?{reasoning_effort:'low'}:{}),
        response_format:strict?{type:'json_schema',json_schema:{name:'game_difficulty_v2',strict:true,schema}}:{type:'json_object'},
        messages:[{role:'system',content:SYSTEM},{role:'user',content:JSON.stringify(parsed)}],
      }),
    })
    if(!completion.ok)return respond({error:'AI-сервис не ответил.'},completion.status===429?429:502,origin)
    const data=await completion.json().catch(()=>null)
    const raw=data?.choices?.[0]?.message?.content
    if(typeof raw!=='string')return respond({error:'Пустой AI-ответ.'},502,origin)
    let chosen
    try {chosen=JSON.parse(raw)}catch{return respond({error:'Неверный AI-ответ.'},502,origin)}
    if(!parsed.allowedKinds.includes(chosen?.kind)||!RULES[chosen.kind]){
      return respond({error:'AI выбрал недопустимый вид сложности.'},422,origin)
    }
    return respond({kind:chosen.kind,...RULES[chosen.kind]},200,origin)
  } catch {
    return respond({error:'Не удалось подобрать усложнение.'},502,origin)
  }
}
