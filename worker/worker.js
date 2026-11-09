/** Public ARCAnum AI. GROQ_API_KEY stays secret in Cloudflare. */
const MODEL = 'openai/gpt-oss-20b';
const SYSTEM = "Ты — внимательный таролог-аналитик Таро Уэйта. Отвечай по-русски, на ТЫ, без фамильярности, без лести и фатализма.\nТебе переданы УЖЕ вытянутые случайно карты, позиции и ориентации. НИКОГДА не заменяй их, не придумывай дополнительные карты и не меняй их порядок.\nГлавное: сначала дай КОНКРЕТНЫЙ ответ на сам вопрос. Если вопрос 'произойдёт ли X в срок Y?', скажи, какой вектор символически показывают карты (скорее да, скорее нет, неопределённо), и коротко почему. Не выдавай это за подтверждённую вероятность или гарантию.\nЗатем покажи логику расклада через связи и противоречия между картами. Для КАЖДОЙ карты ровно один пункт cards в исходном порядке, с учётом её позиции и прямого/перевёрнутого положения.\nНе отделывайся универсальными определениями мастей; интерпретируй именно сочетание карты, позиции и заданного вопроса. Не повторяй одно и то же в разделах.\nНе изобретай факты о жизни спрашивающего: встречи с руководством, обманы, психологические диагнозы, намерения третьих лиц, обстоятельства отношений или уже совершённые действия. Когда данных нет, используй условные формулировки.\nСоблюдай умеренную краткость: answer — 2–3 предложения; pattern — 2–3 предложения; каждый insight — 1–2 конкретных предложения; nextStep — 1–2 практических предложения; uncertainty — одно предложение, указывающее, что карты не могут подтвердить.\nБез вступительных эссе, без повторяющихся предупреждений, без лишних вопросов и без Markdown. Верни только JSON строго заданной структуры: answer, pattern, cards, nextStep, uncertainty.";
const RESPONSE_SCHEMA = {"type":"object","properties":{"answer":{"type":"string"},"pattern":{"type":"string"},"cards":{"type":"array","items":{"type":"object","properties":{"insight":{"type":"string"}},"required":["insight"],"additionalProperties":false}},"nextStep":{"type":"string"},"uncertainty":{"type":"string"}},"required":["answer","pattern","cards","nextStep","uncertainty"],"additionalProperties":false};
function jsonResponse(data,status=200,origin='',extras={}){
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin',...extras};
  if(origin)headers['Access-Control-Allow-Origin']=origin;
  return new Response(JSON.stringify(data),{status,headers});
}

const DAY_LIMIT=200,MINUTE_LIMIT=6;
export class AIUsageBudget{
  constructor(ctx){this.ctx=ctx;}
  async fetch(request){
    if(request.method!=='POST')return jsonResponse({error:'Method not allowed'},405);
    const now=new Date(),day=now.toISOString().slice(0,10),minute=Math.floor(now.getTime()/60000);
    const result=await this.ctx.storage.transaction(async tx=>{
      const d=await tx.get('day'),m=await tx.get('minute');
      const daily=d?.day===day?d.count:0,minuteCount=m?.minute===minute?m.count:0;
      if(daily>=DAY_LIMIT)return {allowed:false,reason:'daily'};
      if(minuteCount>=MINUTE_LIMIT)return {allowed:false,reason:'minute'};
      await tx.put('day',{day,count:daily+1});
      await tx.put('minute',{minute,count:minuteCount+1});
      return {allowed:true};
    });
    return jsonResponse(result,result.allowed?200:429);
  }
}
export default{
  async fetch(request,env){
    const allowed=String(env.ALLOWED_ORIGIN||'').replace(/\/$/,'');
    const origin=request.headers.get('Origin')||'';
    if(request.method==='GET'&&new URL(request.url).pathname==='/health'){
      const missing=[];
      if(!allowed)missing.push('ALLOWED_ORIGIN');
      if(!env.GROQ_API_KEY)missing.push('GROQ_API_KEY');
      if(!env.AI_USAGE_BUDGET)missing.push('AI_USAGE_BUDGET');
      if(!env.VISITOR_RATE_LIMITER)missing.push('VISITOR_RATE_LIMITER');
      return jsonResponse({ok:true,service:'arcanum-tarot-ai',public:true,ready:missing.length===0,missing},200);
    }
    if(!allowed||!env.GROQ_API_KEY||!env.AI_USAGE_BUDGET||!env.VISITOR_RATE_LIMITER)
      return jsonResponse({error:'AI-сервис временно недоступен.'},503,origin===allowed?allowed:'');
    if(origin!==allowed)return jsonResponse({error:'Источник не разрешён.'},403);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{
      'Access-Control-Allow-Origin':allowed,'Access-Control-Allow-Methods':'POST, OPTIONS',
      'Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600','Vary':'Origin'
    }});
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
      orientation:String(c?.orientation||'').slice(0,30),meaning:String(c?.meaning||'').slice(0,700)
    }));
    if(cards.some(c=>!c.name||!c.position||!c.orientation))
      return jsonResponse({error:'Некорректные данные карты.'},400,allowed);
    try{
      const visitor=await env.VISITOR_RATE_LIMITER.limit({key:request.headers.get('CF-Connecting-IP')||'unknown'});
      if(!visitor.success)return jsonResponse({error:'Слишком много раскладов. Попробуй через минуту.'},429,allowed,{'Retry-After':'60'});
      const stub=env.AI_USAGE_BUDGET.get(env.AI_USAGE_BUDGET.idFromName('arcanum-global-v1'));
      const limitResponse=await stub.fetch('https://budget.internal/consume',{method:'POST'});
      const limit=await limitResponse.json();
      if(!limitResponse.ok)return jsonResponse({error:limit.reason==='daily'?
        'Бесплатный дневной лимит AI-разборов исчерпан. Попробуй завтра.':
        'Сейчас слишком много запросов. Попробуй через минуту.'},429,allowed,
        {'Retry-After':limit.reason==='daily'?'3600':'60'});
    }catch{return jsonResponse({error:'Защита запросов временно недоступна.'},503,allowed);}
    try{
      const model=env.GROQ_MODEL||MODEL,supportsStrict=/^openai\/gpt-oss-(20b|120b)$/.test(model);
      const completion=await fetch('https://api.groq.com/openai/v1/chat/completions',{
        method:'POST',headers:{Authorization:'Bearer '+env.GROQ_API_KEY,'Content-Type':'application/json'},
        body:JSON.stringify({model,temperature:0.45,max_completion_tokens:2500,
          ...(supportsStrict?{reasoning_effort:'low'}:{}),
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
