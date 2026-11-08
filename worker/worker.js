/**
 * Optional Cloudflare Worker for ARCAnum. Never put your GROQ_API_KEY in GitHub.
 * Before deploying, configure secret GROQ_API_KEY and var ALLOWED_ORIGIN.
 * This origin check is NOT authentication; add Turnstile or access control
 * before inviting untrusted public traffic.
 */
const MODEL = 'openai/gpt-oss-20b';
const SYSTEM = `Ты — внимательный аналитик Таро Райдера—Уэйта. Пиши на русском, спокойно, ясно и без мистического фатализма.
Карты уже случайно и независимо выбраны браузером: не заменяй их, не добавляй новые и не меняй положения.
Разбери каждую карту строго в своей позиции; затем покажи связи, напряжение и общую картину; в конце дай конкретный вывод и 2 практических вопроса.
Трактуй через архетипы, психологию и метафоры. Не выдавай символику за факты, чтение мыслей другого человека, диагноз или гарантированный прогноз.
Не подгоняй позитивный ответ. Если сюжет неоднозначный, укажи это. Никакой лести и угроз. Не предлагай финансовых или медицинских решений исключительно на основе карт.
Формат: короткое введение, пять-десять абзацев разбора (в зависимости от числа карт), цельный итог и два вопроса. Без выдуманной биографии пользователя.`;
function jsonResponse(data,status=200,origin=''){
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin'};
  if(origin)headers['Access-Control-Allow-Origin']=origin;
  return new Response(JSON.stringify(data),{status,headers});
}
export default {
  async fetch(request,env){
    const allowed=String(env.ALLOWED_ORIGIN||'').replace(/\/$/,'');
    const origin=request.headers.get('Origin')||'';
    if(!allowed||!env.GROQ_API_KEY)return jsonResponse({error:'Сервер не настроен: укажи ALLOWED_ORIGIN и секрет GROQ_API_KEY.'},503);
    if(origin!==allowed)return jsonResponse({error:'Origin не разрешён.'},403);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':allowed,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600','Vary':'Origin'}});
    if(request.method!=='POST')return jsonResponse({error:'Поддерживается только POST.'},405,allowed);
    if(Number(request.headers.get('Content-Length')||0)>12000)return jsonResponse({error:'Слишком большой запрос.'},413,allowed);
    try{
      const body=await request.json();
      if(!body||typeof body.question!=='string'||body.question.length>800||body.question.length<5||!Array.isArray(body.cards)||body.cards.length<1||body.cards.length>7)return jsonResponse({error:'Некорректный формат расклада.'},400,allowed);
      const cards=body.cards.map(c=>({name:String(c.name||'').slice(0,60),position:String(c.position||'').slice(0,80),orientation:String(c.orientation||'').slice(0,30),meaning:String(c.meaning||'').slice(0,700)}));
      const completion=await fetch('https://api.groq.com/openai/v1/chat/completions',{
        method:'POST',headers:{'Authorization':`Bearer ${env.GROQ_API_KEY}`,'Content-Type':'application/json'},
        body:JSON.stringify({model:env.GROQ_MODEL||MODEL,temperature:0.65,max_completion_tokens:1800,messages:[{role:'system',content:SYSTEM},{role:'user',content:JSON.stringify({question:body.question,category:String(body.category||'Общее').slice(0,40),cards})}]})
      });
      const result=await completion.json().catch(()=>({}));
      if(!completion.ok){const reason=completion.status===429?'Бесплатный лимит AI исчерпан, попробуй позднее.':'AI-сервис сейчас недоступен.';return jsonResponse({error:reason},completion.status===429?429:502,allowed);}
      const answer=result?.choices?.[0]?.message?.content;
      if(typeof answer!=='string'||!answer.trim())return jsonResponse({error:'AI вернул пустой результат.'},502,allowed);
      return jsonResponse({analysis:answer.slice(0,12000),model:env.GROQ_MODEL||MODEL},200,allowed);
    }catch(err){return jsonResponse({error:'Не удалось обработать запрос.'},500,allowed);}
  }
};