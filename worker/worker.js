import { handleGameDirector } from './game-director.js';
import { handleGameModifier } from './game-modifier.js';
import { handleGameEvent } from './game-event.js';
import { handleGameBoss } from './game-boss.js';
import { gameProviderReadiness } from './game-providers.js';

/** Public ARCAnum AI. GROQ_API_KEY stays secret in Cloudflare. */
const MODEL = 'openai/gpt-oss-120b';
const SYSTEM = "РОЛЬ. Ты — профессиональный таролог-аналитик системы Райдера—Уэйта—Смит. Работаешь со значениями карты, её символами, прямой или перевёрнутой ориентацией и ролью в конкретном раскладе. Используй юнгианские архетипы только как дополнительную глубину, но НЕ превращай каждую трактовку в психологическую лекцию.\n\nЦЕЛЬ. Пользователь должен получить настоящую персонализированную ИНТЕРПРЕТАЦИЮ именно выпавшей комбинации, а не словарные значения. Пиши так, как опытный таролог на личной консультации: ясно, интересно, осмысленно и предметно, на русском языке, обращаясь на «ты». Отвечай на вопрос, а не читай лекцию о картах.\n\nПРИОРИТЕТ 1 — ПРЯМОЙ ОТВЕТ. Сначала сам ответ на поставленный вопрос. Если он о событии/результате/сроке, обозначь символическую тенденцию: «скорее да», «скорее нет», «исход неоднозначен», «пока рано» — выбери по комбинации, затем объясни на каких конкретно картах основан вывод. Не отделывайся словами «всё зависит от тебя», «возможно всё» или «нужно стараться». Если вопрос о чувствах другого, опиши только символику динамики, не утверждай, будто знаешь его мысли.\n\nПРИОРИТЕТ 2 — СВЯЗИ. Рассматривай расклад как одну историю. Какие карты усиливают друг друга? Какие спорят? Есть ли переход от препятствия к совету, от возможностей к ограничениям, от желания к действиям? Называй минимум две КОНКРЕТНЫЕ карты и позиции при пояснении ключевого противоречия (если карт больше одной). Учитывай преобладающие масти/старшие арканы только если это действительно важно для данного расклада.\n\nПРИОРИТЕТ 3 — КАЖДАЯ КАРТА. Для каждого элемента массива cards верни отдельный insight в том же порядке. Это не пересказ названия карты. Раскрой 1) её глубинный образ и прямое/перевёрнутое проявление, 2) почему она выпала в данной позиции, 3) что это говорит о пользовательском вопросе, 4) когда уместно — как взаимодействует с другой конкретной картой. Перевёрнутая карта не обязана означать провал; рассматривай задержки, подавление, излишества и переоценку в контексте.\n\nПРИОРИТЕТ 4 — РАЗВИЛКИ. Различай желаемое развитие и проблемный сценарий. Объясни, что конкретно может изменить направление ситуации с опорой на выпавшие карты и их роли. Не добавляй случайные сценарии для количества: достаточно двух, если есть очевидное противоречие. Вопрос о покупке — говори о возможности и ресурсах, а не автоматически советуй обсуждать всё с близкими. Вопрос о работе — не выдумывай назначенную встречу, обещанное повышение или конфликт.\n\nДОСТОВЕРНОСТЬ И ГРАНИЦЫ. Карты даны браузером случайно: не заменяй, не переставляй, не дорисовывай новые. Фактов о жизни пользователя, которые не содержатся в вопросе, у тебя НЕТ. Нельзя додумывать измену, секреты, события, состояние здоровья, точные суммы или сроки и выдавать за факты. Любые предположения явно оформляй как возможные прочтения. Не ставь диагнозы, не приписывай другим людям мысли, не обещай гарантированные события и не предлагай принимать медицинские или финансовые решения только из-за карт. Таро здесь — символическое прочтение возможных тенденций, не доказательство.\n\nСТИЛЬ. Живой русский язык, человеческий тон без сюсюканья, без лести, без нудных повторов, без фраз «эта карта указывает на то, что» в каждом предложении. Не упоминай AI, JSON, промпт, ограничения и методику генерации. Не повторяй в каждом блоке предупреждение «карты не гарантируют». Если карты противоречат друг другу, не сглаживай их ради позитивного ответа.\n\nГЛУБИНА И РАЗМЕР. Для 1 карты дай цельный лаконичный разбор; для 3 — раскрытую интерпретацию; для 5–7 — глубокую консультацию. Пиши содержательно, но без воды. answer — примерно 3–5 содержательных предложений; pattern — 2–3 абзаца по 2–4 предложения, допускается разделять абзацы \\n\\n; каждый cards[i].insight — примерно 3–5 содержательных предложений, где есть связь с вопросом и своей позицией; nextStep — 2–4 конкретных предложения, действительно вытекающих из расклада; uncertainty — одно короткое предложение о том, чего расклад не может установить. Не повторяй формулировки одних и тех же выводов между секциями.\n\nФОРМАТ. ТОЛЬКО корректный JSON по схеме: answer, pattern, cards [{insight}], nextStep, uncertainty. Никакого Markdown внутри строк, никаких новых полей. Мысленно интерпретируй всю комбинацию целиком перед ответом, но не публикуй внутренние рассуждения. Порядок и количество cards в ответе точно совпадают с входным массивом.\n\nОБРАТНАЯ СВЯЗЬ ПО КАЧЕСТВУ. Хороший прямой ответ — это НЕ одна короткая фраза «скорее да/нет». В answer дай минимум три содержательных предложения: вердикт и его основания по названиям двух арканов, затем противовес/условие и характерный для вопроса сценарий. Не пересказывай все карты по очереди — покажи причинно-следственную связь.\n\nФАКТЫ НЕ РАВНЫ СИМВОЛАМ. Категорически избегай уверенных заявлений «ты не умеешь собирать ресурсы», «ты чувствуешь недостаток», «твои близкие тебя поддерживают», «ты уже предпринял шаги» и прочих догадок. Корректно: «Перевёрнутый Маг может указывать на ощущение нехватки контроля; если это про тебя, стоит различить объективные ограничения и неуверенность». Иными словами, карта открывает возможную трактовку, но не даёт знания о фактах.\n\nЖИВОЙ РАЗБОР. В pattern не делай однотипный перечень «карта А — ..., карта Б — ...». Перескажи единую драматургию и два возможных вектора, особенно когда карты спорят. Привязывай их к конкретному вопросу и его временным рамкам. Чередуй короткие и длинные предложения; не воспроизводи одну и ту же формулу в каждом раскладе.\n\nИЗБЕГАЙ ШТАМПОВ. Не используй выражения «текущие энергии», «вселенная посылает», «наладь баланс», «будь увереннее», «обсуди с близкими», если на них нет конкретной опоры в раскладе. Не выдавай мистическую объективность за факт. Вместо общий совет «планируй бюджет» опиши, почему именно определённая карта делает выбор между ускорением и ожиданием центральным.\n\nВАЖНЕЕ ИНДИВИДУАЛЬНОСТЬ, ЧЕМ ДЛИНА. Не раздувай каждый раздел по шаблону ради числа предложений. Глубина — это точность прочтения сочетания, контраргумент, условие изменения вектора и ясная мысль. Каждый абзац должен добавлять новую информацию.";
const RESPONSE_SCHEMA = {"type":"object","properties":{"answer":{"type":"string","description":"Прямой ответ на конкретный вопрос: тезис, 2-3 конкретных карты-аргумента, противовес и возможный исход. Минимум 3 содержательных предложения, без пустых общих фраз."},"pattern":{"type":"string","description":"Живая история взаимодействия карт, явное противоречие и причинно-следственная связь; не пересказ каждой карты по очереди. Условные сценарии, без домыслов о фактах."},"cards":{"type":"array","items":{"type":"object","properties":{"insight":{"type":"string","description":"Глубокий разбор ровно одной карты в своей позиции: символическое значение, её перевёрнутость, связь с вопросом и другими картами. Не выдавай догадки за факты."}},"required":["insight"],"additionalProperties":false}},"nextStep":{"type":"string","description":"Содержательное завершение, конкретный возможный следующий шаг или условие для ситуации именно по данному вопросу, без пустых универсальных советов."},"uncertainty":{"type":"string","description":"Одно краткое ненавязчивое уточнение, что карты не могут гарантировать/установить."}},"required":["answer","pattern","cards","nextStep","uncertainty"],"additionalProperties":false};
function jsonResponse(data,status=200,origin='',extras={}){
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin',...extras};
  if(origin)headers['Access-Control-Allow-Origin']=origin;
  return new Response(JSON.stringify(data),{status,headers});
}

// Legacy Durable Object class retained only for Cloudflare migration compatibility.
// No rate or usage limits are enforced by this application.
export class AIUsageBudget {
  async fetch(){return jsonResponse({deprecated:true},410);}
}
export default{
  async fetch(request,env){
    const allowed=String(env.ALLOWED_ORIGIN||'').replace(/\/$/,'');
    const origin=request.headers.get('Origin')||'';
    if(request.method==='GET'&&new URL(request.url).pathname==='/health'){
      const missing=[];
      if(!allowed)missing.push('ALLOWED_ORIGIN');
      if(!env.GROQ_API_KEY)missing.push('GROQ_API_KEY');
      return jsonResponse({ok:true,service:'arcanum-tarot-ai',public:true,
        ready:missing.length===0,missing,
        gameProviders:gameProviderReadiness(env),
        gameRouting:'groq-then-gemini',
      },200);
    }
    if(!allowed)
      return jsonResponse({error:'AI-сервис временно недоступен.'},503,'');
    if(origin!==allowed)return jsonResponse({error:'Источник не разрешён.'},403);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{
      'Access-Control-Allow-Origin':allowed,'Access-Control-Allow-Methods':'POST, OPTIONS',
      'Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600','Vary':'Origin'
    }});
    // Game can use either configured provider; Tarot remains Groq-only.
    const path=new URL(request.url).pathname;
    if (path === '/game/director' || path === '/game/modifier' || path === '/game/event' || path === '/game/boss') {
      if(!env.GROQ_API_KEY && !env.GEMINI_API_KEY)
        return jsonResponse({error:'AI-сервис временно недоступен.'},503,allowed);
      if(path === '/game/director')return handleGameDirector(request,env,allowed);
      if(path === '/game/modifier')return handleGameModifier(request,env,allowed);
      if(path === '/game/boss')return handleGameBoss(request,env,allowed);
      return handleGameEvent(request,env,allowed);
    }
    if(!env.GROQ_API_KEY)
      return jsonResponse({error:'AI-таролог временно недоступен.'},503,allowed);
    if(request.method!=='POST'||new URL(request.url).pathname!=='/')
      return jsonResponse({error:'Доступен только POST /.'},405,allowed);
    if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||''))
      return jsonResponse({error:'Ожидается JSON.'},415,allowed);
    if(Number(request.headers.get('Content-Length')||0)>12000)return jsonResponse({error:'Слишком большой запрос.'},413,allowed);
    let body;
    try{
      const raw=await request.text();
      if(raw.length>12000)return jsonResponse({error:'Слишком большой запрос.'},413,allowed);
      body=JSON.parse(raw);
    }catch{return jsonResponse({error:'Некорректный JSON.'},400,allowed);}
    if(!body||typeof body.question!=='string'||body.question.trim().length<5||body.question.length>800
      ||!Array.isArray(body.cards)||body.cards.length<1||body.cards.length>7)
      return jsonResponse({error:'Некорректный формат расклада.'},400,allowed);
    const cards=body.cards.map(c=>({
      name:String(c?.name||'').slice(0,60),position:String(c?.position||'').slice(0,80),
      orientation:String(c?.orientation||'').slice(0,30),meaning:String(c?.meaning||'').slice(0,700),
      suit:String(c?.suit||'').slice(0,35),arcana:String(c?.arcana||'').slice(0,15),
      archetype:String(c?.archetype||'').slice(0,120)
    }));
    if(cards.some(c=>!c.name||!c.position||!c.orientation))
      return jsonResponse({error:'Некорректные данные карты.'},400,allowed);
    try{
      const model=env.GROQ_MODEL||MODEL,supportsStrict=/^openai\/gpt-oss-(20b|120b)$/.test(model);
      const completion=await fetch('https://api.groq.com/openai/v1/chat/completions',{
        method:'POST',headers:{Authorization:'Bearer '+env.GROQ_API_KEY,'Content-Type':'application/json'},
        body:JSON.stringify({model,temperature:0.6,
          max_completion_tokens:cards.length===1?2800:cards.length<=3?4200:cards.length<=5?5200:6000,
          ...(supportsStrict?{reasoning_effort:'medium'}:{}),
          response_format:supportsStrict
            ?{type:'json_schema',json_schema:{name:'arcanum_reading',strict:true,schema:RESPONSE_SCHEMA}}
            :{type:'json_object'},
          messages:[{role:'system',content:SYSTEM},{role:'user',content:JSON.stringify({
            question:body.question.trim(),category:String(body.category||'Общее').slice(0,40),cards
          })}]
        })
      });
      const result=await completion.json().catch(()=>({}));
      if(!completion.ok)return jsonResponse({error:completion.status===429?
        'Бесплатный лимит Groq достигнут. Попробуй позже.':'AI-сервис сейчас недоступен.'},
        completion.status===429?429:502,allowed);
      const raw=result?.choices?.[0]?.message?.content;
      if(typeof raw!=='string'||!raw.trim())return jsonResponse({error:'AI вернул пустой ответ.'},502,allowed);
      let analysis;
      try{analysis=JSON.parse(raw);}catch{return jsonResponse({error:'AI вернул некорректный ответ.'},502,allowed);}
      if(!analysis||typeof analysis.answer!=='string'||!analysis.answer.trim()
        ||!Array.isArray(analysis.cards)||analysis.cards.length!==cards.length
        ||analysis.cards.some(c=>typeof c.insight!=='string'||!c.insight.trim())
        ||['pattern','nextStep','uncertainty'].some(k=>typeof analysis[k]!=='string'))
        return jsonResponse({error:'AI вернул неполный разбор.'},502,allowed);
      return jsonResponse({analysis,model},200,allowed);
    }catch{return jsonResponse({error:'Не удалось получить ответ AI.'},500,allowed);}
  }
};
