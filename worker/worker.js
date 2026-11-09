/**
 * Optional Cloudflare Worker for ARCAnum. Never put your GROQ_API_KEY in GitHub.
 * Before deploying, configure secret GROQ_API_KEY and var ALLOWED_ORIGIN.
 * Access token is stored in Cloudflare secret ACCESS_TOKEN. Origin is CORS only.
 * For publicly shared use add per-IP quotas and abuse mitigation.
 */
const MODEL = 'openai/gpt-oss-20b';
const SYSTEM = "Ты — внимательный таролог-аналитик Таро Уэйта. Отвечай по-русски, на ТЫ, без фамильярности, без лести и фатализма.\nТебе переданы УЖЕ вытянутые случайно карты, позиции и ориентации. НИКОГДА не заменяй их, не придумывай дополнительные карты и не меняй их порядок.\nГлавное: сначала дай КОНКРЕТНЫЙ ответ на сам вопрос. Если вопрос 'произойдёт ли X в срок Y?', скажи, какой вектор символически показывают карты (скорее да, скорее нет, неопределённо), и коротко почему. Не выдавай это за подтверждённую вероятность или гарантию.\nЗатем покажи логику расклада через связи и противоречия между картами. Для КАЖДОЙ карты ровно один пункт cards в исходном порядке, с учётом её позиции и прямого/перевёрнутого положения.\nНе отделывайся универсальными определениями мастей; интерпретируй именно сочетание карты, позиции и заданного вопроса. Не повторяй одно и то же в разделах.\nНе изобретай факты о жизни спрашивающего: встречи с руководством, обманы, психологические диагнозы, намерения третьих лиц, обстоятельства отношений или уже совершённые действия. Когда данных нет, используй условные формулировки.\nСоблюдай умеренную краткость: answer — 2–3 предложения; pattern — 2–3 предложения; каждый insight — 1–2 конкретных предложения; nextStep — 1–2 практических предложения; uncertainty — одно предложение, указывающее, что карты не могут подтвердить.\nБез вступительных эссе, без повторяющихся предупреждений, без лишних вопросов и без Markdown. Верни только JSON строго заданной структуры: answer, pattern, cards, nextStep, uncertainty.";
const RESPONSE_SCHEMA = {"type":"object","properties":{"answer":{"type":"string"},"pattern":{"type":"string"},"cards":{"type":"array","items":{"type":"object","properties":{"insight":{"type":"string"}},"required":["insight"],"additionalProperties":false}},"nextStep":{"type":"string"},"uncertainty":{"type":"string"}},"required":["answer","pattern","cards","nextStep","uncertainty"],"additionalProperties":false};
function jsonResponse(data,status=200,origin=''){
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin'};
  if(origin)headers['Access-Control-Allow-Origin']=origin;
  return new Response(JSON.stringify(data),{status,headers});
}
export default {
  async fetch(request,env){
    // Public non-sensitive health endpoint for deployment verification.
    if(request.method==='GET'&&new URL(request.url).pathname==='/health'){
      const missing=[];
      if(!String(env.ALLOWED_ORIGIN||'').trim())missing.push('ALLOWED_ORIGIN');
      if(!env.GROQ_API_KEY)missing.push('GROQ_API_KEY');
      if(!env.ACCESS_TOKEN)missing.push('ACCESS_TOKEN');
      else if(String(env.ACCESS_TOKEN).length<24)missing.push('ACCESS_TOKEN (minimum 24 characters)');
      return jsonResponse({ok:true,service:'arcanum-tarot-ai',ready:missing.length===0,missing},200);
    }
    const allowed=String(env.ALLOWED_ORIGIN||'').replace(/\/$/,'');
    const origin=request.headers.get('Origin')||'';
    if(!allowed||!env.GROQ_API_KEY||!env.ACCESS_TOKEN||String(env.ACCESS_TOKEN).length<24)return jsonResponse({error:'Сервер не настроен: нужны ALLOWED_ORIGIN, GROQ_API_KEY и ACCESS_TOKEN (от 24 символов).'},503);
    if(origin!==allowed)return jsonResponse({error:'Origin не разрешён.'},403);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':allowed,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, X-Arcanum-Access','Access-Control-Max-Age':'600','Vary':'Origin'}});
    if(request.method!=='POST')return jsonResponse({error:'Поддерживается только POST.'},405,allowed);
    const supplied=request.headers.get('X-Arcanum-Access')||'';
    const secret=String(env.ACCESS_TOKEN);
    let mismatch=supplied.length===secret.length?0:1;
    if(!mismatch){for(let i=0;i<secret.length;i++)mismatch|=supplied.charCodeAt(i)^secret.charCodeAt(i);}
    if(mismatch)return jsonResponse({error:'Неверный пароль доступа к AI.'},401,allowed);
    if(Number(request.headers.get('Content-Length')||0)>12000)return jsonResponse({error:'Слишком большой запрос.'},413,allowed);
    try{
      const body=await request.json();
      if(!body||typeof body.question!=='string'||body.question.length>800||body.question.length<5||!Array.isArray(body.cards)||body.cards.length<1||body.cards.length>7)return jsonResponse({error:'Некорректный формат расклада.'},400,allowed);
      const cards=body.cards.map(c=>({name:String(c.name||'').slice(0,60),position:String(c.position||'').slice(0,80),orientation:String(c.orientation||'').slice(0,30),meaning:String(c.meaning||'').slice(0,700)}));
      const model=env.GROQ_MODEL||MODEL;
      const supportsStrict=/^openai\/gpt-oss-(20b|120b)$/.test(model);
      const completion=await fetch('https://api.groq.com/openai/v1/chat/completions',{
        method:'POST',headers:{'Authorization':'Bearer '+env.GROQ_API_KEY,'Content-Type':'application/json'},
        body:JSON.stringify({
          model,temperature:0.45,max_completion_tokens:2500,
          ...(supportsStrict?{reasoning_effort:'low'}:{}),
          response_format:supportsStrict
            ?{type:'json_schema',json_schema:{name:'arcanum_reading',strict:true,schema:RESPONSE_SCHEMA}}
            :{type:'json_object'},
          messages:[{role:'system',content:SYSTEM},{role:'user',content:JSON.stringify({question:body.question,category:String(body.category||'Общее').slice(0,40),cards})}]
        })
      });
      const result=await completion.json().catch(()=>({}));
      if(!completion.ok){const reason=completion.status===429?'Бесплатный лимит AI исчерпан, попробуй позднее.':'AI-сервис сейчас недоступен.';return jsonResponse({error:reason},completion.status===429?429:502,allowed);}
      const raw=result?.choices?.[0]?.message?.content;
      if(typeof raw!=='string'||!raw.trim())return jsonResponse({error:'AI вернул пустой ответ.'},502,allowed);
      let analysis;
      try{analysis=JSON.parse(raw);}catch{return jsonResponse({error:'AI вернул неполный формат разбора. Повтори запрос.'},502,allowed);}
      if(!analysis||typeof analysis.answer!=='string'||!analysis.answer.trim()
        ||!Array.isArray(analysis.cards)||analysis.cards.length!==cards.length
        ||analysis.cards.some(c=>typeof c.insight!=='string'||!c.insight.trim())
        ||['pattern','nextStep','uncertainty'].some(k=>typeof analysis[k]!=='string'))
        return jsonResponse({error:'AI вернул неполный разбор. Повтори запрос.'},502,allowed);
      return jsonResponse({analysis,model},200,allowed);
    }catch(err){return jsonResponse({error:'Не удалось обработать запрос.'},500,allowed);}
  }
};