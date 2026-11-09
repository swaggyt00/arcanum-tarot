/**
 * Generates only a small, non-graphic challenge twist. The engine still owns
 * the base card, risk, participant choice and consent boundaries.
 * No session names or personalized answers are sent to this endpoint.
 */
const MODEL = 'openai/gpt-oss-120b'

const SYSTEM = [
  'Ты сценарист дерзкой русскоязычной игры 18+ «Без Фильтров».',
  'Сформулируй ОДНО оригинальное дополнительное условие для уже готовой карточки.',
  'Базовую карточку НЕЛЬЗЯ переписать, заменить или продлить. Только небольшой драматургический поворот.',
  'Условие должно быть самодостаточным и выполнимым; без непонятных «это», «то же самое», «выбранное действие».',
  'Учитывай основное действие и не создавай конфликтов: если карточка молчаливая, нельзя требовать говорить; если она длится 10 секунд, не требуй отдельную минуту.',
  'Уважай границы участников: не вводи нового сексуального действия, физического контакта, раздевания, смены позы, контроля над телом, алкогольных заданий, фото или переписок.',
  'Слово sex в контексте обозначает взрослый режим: сохраняй интригу и игру, но описание условия должно оставаться НЕграфическим.',
  'Для Truth выбери kind=followup: дополнительная конкретная деталь к ответу. Начинай description строго со слов «После ответа».',
  'Для Dare с kind=reaction: только короткая реакция ПОСЛЕ базового действия (пауза, один взгляд, мимика или одно короткое признание), начинай description со слов «После выполнения».',
  'Для Dare с kind=performance: манера исполнения уже указанного действия, без новых объектов, начинать description со слов «Во время выполнения».',
  'Не делай одинаковые условия на каждом ходу: проверь recentLabels и не используй похожую формулировку.',
  'Описание: конкретное одно предложение длиной примерно 55–125 символов; не более двух простых последовательных шагов.',
  'Название: выразительные 2–4 слова без эмодзи, не похожие на последние названия.',
  'Никаких фраз «ИИ решил», «безопасный вариант», «если хотите»; не добавляй новые карточки и не вводи участников.',
  'Верни только JSON: kind, label, description. Используй kind только из allowedKinds.',
].join(' ')

function respond(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,headers:{
      'Content-Type':'application/json; charset=utf-8',
      'Cache-Control':'no-store',
      'Vary':'Origin',
      'Access-Control-Allow-Origin':origin,
    },
  })
}
const safeChain = value=>typeof value==='string' && /^[a-z-]{2,35}$/.test(value)
const performanceAction = /(танц|разыгра|изобраз|пантомим|реклам|парод|сыгра|спой|пой|театрал|подиум|позир|сцен[уаые]|покажи походк|покажи.*мимик)/i
const forbiddenNewAction = /(раздев|раздет|сними(?:те)?\s+(?:одежд|бель|лиф|трус|вещ)|целуй|поцелу|тронь|трогай|трогайте|прикосн|косн(?:ись|итесь)|обним|массаж|генитал|вагин|аналь|проникнов|оральн|минет|кунилинг|оргазм|стимуляц|шл[её]п|свяж|связыв|удуш|алкогол|выпей|напиток|телефон|фотограф|видео|снимай на камеру|отправ|опубликуй|запиши голос|сделай фото|застав|обязательн|штраф|наказан|не имеешь права|ты должен)/i
const forbiddenExtraRule = /(не (?:используй|используйте) рук|не (?:двигай|двигайтесь)|закр(?:ой|ойте) глаза|смени(?:те)? позу|держи(?:те)? глаза закрыт|не говори(?:те)?|поменяй(?:тесь)? ролями|не (?:останавливай|останавливайтесь))/i

function validateBody(body) {
  if (!body||typeof body!=='object'||body.version!==1) return null
  if(!['couple','sex','party','afterdark'].includes(body.scenario))return null
  if(![0,1,2,3,4].includes(body.stage)||![1,2,3].includes(body.risk))return null
  if(!['truth','dare'].includes(body.cardType))return null
  if(!Array.isArray(body.chains)||body.chains.length>3||body.chains.some(chain=>!safeChain(chain)))return null
  if(typeof body.cardText!=='string'||body.cardText.length<15||body.cardText.length>550
    ||/[{}<>\u0000-\u001f]/.test(body.cardText))return null
  if(!Array.isArray(body.allowedKinds)||body.allowedKinds.length<1||body.allowedKinds.length>2
    ||new Set(body.allowedKinds).size!==body.allowedKinds.length)return null
  const possible=body.cardType==='truth'?['followup']:['reaction']
  if(body.cardType==='dare'&&body.scenario!=='sex'&&performanceAction.test(body.cardText))possible.push('performance')
  if(body.allowedKinds.some(kind=>!possible.includes(kind)))return null
  if(!Array.isArray(body.recentLabels)||body.recentLabels.length>5
    ||body.recentLabels.some(label=>typeof label!=='string'||label.length>50||/[{}<>\u0000-\u001f]/.test(label)))return null
  return{
    scenario:body.scenario,stage:body.stage,risk:body.risk,
    cardType:body.cardType,chains:body.chains,
    cardText:body.cardText,allowedKinds:body.allowedKinds,
    recentLabels:body.recentLabels,
  }
}

function validateResult(data, parsed) {
  if(!data||typeof data!=='object'||!parsed.allowedKinds.includes(data.kind))return null
  if(typeof data.label!=='string'||typeof data.description!=='string')return null
  if(/[\n\r<>\u0000-\u001f{}]/.test(data.label+data.description))return null
  const label=data.label.replace(/\s+/g,' ').trim()
  const description=data.description.replace(/\s+/g,' ').trim()
  if(label.length<4||label.length>40||description.length<40||description.length>190)return null
  if(/https?:|www\.|@|#|\*/i.test(label+description))return null
  if(forbiddenNewAction.test(description)||forbiddenExtraRule.test(description))return null
  if(data.kind==='followup'&&!/^После ответа[, ]/i.test(description))return null
  if(data.kind==='reaction'&&!/^После выполнения[, ]/i.test(description))return null
  if(data.kind==='performance'&&!/^Во время выполнения[, ]/i.test(description))return null
  if(parsed.cardType==='dare'&&/(без слов|молча|не разговаривая)/i.test(parsed.cardText)
    &&/(?:скажи|говори|произнеси|голосом|вслух|расскажи|назови)/i.test(description))return null
  if(/(?:вместо (?:этого|основного)|замени|отмени|пропусти|на одну минуту|на две минуты)/i.test(description))return null
  if(parsed.recentLabels.some(item=>item.toLowerCase()===label.toLowerCase()))return null
  return{kind:data.kind,label,description}
}

export async function handleGameModifier(request,env,origin) {
  if(request.method!=='POST')return respond({error:'Доступен только POST.'},405,origin)
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||''))return respond({error:'Ожидается JSON.'},415,origin)
  if(Number(request.headers.get('Content-Length')||0)>6500)return respond({error:'Слишком большой запрос.'},413,origin)
  let parsed
  try {
    const raw=await request.text()
    if(raw.length>6500)return respond({error:'Слишком большой запрос.'},413,origin)
    parsed=validateBody(JSON.parse(raw))
  } catch {return respond({error:'Некорректный JSON.'},400,origin)}
  if(!parsed)return respond({error:'Недопустимая карточка или условия.'},400,origin)
  const schema={
    type:'object',
    properties:{
      kind:{type:'string',enum:parsed.allowedKinds},
      label:{type:'string'},
      description:{type:'string'},
    },
    required:['kind','label','description'],additionalProperties:false,
  }
  try {
    const model=env.GROQ_GAME_MODEL||MODEL
    const strict=/^openai\/gpt-oss-(20b|120b)$/.test(model)
    const completion=await fetch('https://api.groq.com/openai/v1/chat/completions',{
      method:'POST',
      headers:{Authorization:'Bearer '+env.GROQ_API_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({
        model,temperature:0.8,max_completion_tokens:900,
        ...(strict?{reasoning_effort:'low'}:{}),
        response_format:strict?{type:'json_schema',json_schema:{name:'game_modifier',strict:true,schema}}:{type:'json_object'},
        messages:[{role:'system',content:SYSTEM},{role:'user',content:JSON.stringify(parsed)}],
      }),
    })
    if(!completion.ok)return respond({error:'AI-сервис не ответил.'},completion.status===429?429:502,origin)
    const response=await completion.json().catch(()=>null)
    const raw=response?.choices?.[0]?.message?.content
    if(typeof raw!=='string')return respond({error:'Пустой AI-ответ.'},502,origin)
    let answer
    try{answer=JSON.parse(raw)}catch{return respond({error:'Неверный AI-ответ.'},502,origin)}
    const validated=validateResult(answer,parsed)
    if(!validated)return respond({error:'AI-условие не прошло проверку совместимости.'},422,origin)
    return respond(validated,200,origin)
  }catch{
    return respond({error:'Не удалось получить AI-условие.'},502,origin)
  }
}
