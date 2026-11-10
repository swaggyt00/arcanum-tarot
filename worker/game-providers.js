/**
 * Provider router for Без Фильтров only. ARCAnum Tarot stays on its own
 * existing Groq route. All credentials stay in Cloudflare secrets.
 *
 * Groq -> Gemini on throttling, outages, transport failure or invalid JSON.
 * The game's original card eligibility and AI-modifier quality gates still
 * run after this function. NO prompts, user data, or secrets are logged.
 *
 * The cooldown is per Worker isolate (not a global quota accounting system).
 * Provider dashboards remain authoritative for project-wide quotas.
 */
const DEFAULT_GROQ = 'openai/gpt-oss-120b'
const DEFAULT_GEMINI = 'gemini-3.8-flash'
const STATE = {
  groq: { until: 0, remainingTokens: null, remainingRequests: null },
  gemini: { until: 0, remainingTokens: null, remainingRequests: null },
}
const seconds = (value) => {
  if (!value) return null
  const asSeconds = Number(value)
  if (Number.isFinite(asSeconds)) return asSeconds
  const match = String(value).match(/^(?:(\d+)m)?([\d.]+)s$/)
  if (match) return Number(match[1] || 0) * 60 + Number(match[2])
  return null
}
const clamp = (n,min,max) => Math.max(min,Math.min(max,n))
const epoch = () => Date.now()

function emit(event) {
  // Request content and card descriptions must never enter logs.
  console.log(JSON.stringify({event:'bez_filtrov_ai_provider',...event}))
}

function captureLimit(provider,response,{status,route,latencyMs,usage}={}) {
  const state=STATE[provider]
  const tokenText = response.headers.get('x-ratelimit-remaining-tokens')
  const requestText = response.headers.get('x-ratelimit-remaining-requests')
  const tokens = tokenText == null ? null : Number(tokenText)
  const requests = requestText == null ? null : Number(requestText)
  if (Number.isFinite(tokens)) state.remainingTokens=tokens
  if (Number.isFinite(requests)) state.remainingRequests=requests

  const retry = seconds(response.headers.get('retry-after'))
  if (status===429) {
    const reset = seconds(response.headers.get('x-ratelimit-reset-tokens'))
    const ttl=clamp(retry ?? reset ?? 25,2,300)
    state.until=Math.max(state.until,epoch()+ttl*1000)
  } else if (status>=500 || status===408) {
    state.until=Math.max(state.until,epoch()+8000)
  } else if (status===401 || status===403 || status===404) {
    // Missing/invalid Gemini secret or model: don't hammer on every turn.
    state.until=Math.max(state.until,epoch()+60000)
  } else if (status>=200 && status<300) {
    state.until=0
    if (provider==='groq' && Number.isFinite(tokens) && tokens<600) {
      const reset=seconds(response.headers.get('x-ratelimit-reset-tokens'))
      state.until=epoch()+clamp(reset ?? 15,3,120)*1000
    }
  }

  emit({
    provider,route,status,latencyMs,
    retryAfterSeconds:retry,
    remainingTokens:state.remainingTokens,
    remainingRequests:state.remainingRequests,
    totalTokens:Number.isFinite(usage)?usage:null,
    cooldownSeconds:Math.max(0,Math.ceil((state.until-epoch())/1000)),
  })
}

async function withTimeout(operation,timeoutMs) {
  const controller=new AbortController()
  const timer=setTimeout(()=>controller.abort(),timeoutMs)
  try{return await operation(controller.signal)}
  finally{clearTimeout(timer)}
}

async function callGroq(env,input,route) {
  const model=env.GROQ_GAME_MODEL||DEFAULT_GROQ
  const strict=/^openai\/gpt-oss-(20b|120b)$/.test(model)
  const started=epoch()
  try {
    const response=await withTimeout(signal=>fetch('https://api.groq.com/openai/v1/chat/completions',{
      method:'POST',
      signal,
      headers:{Authorization:'Bearer '+env.GROQ_API_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({
        model,temperature:input.temperature,max_completion_tokens:input.tokens,
        ...(strict?{reasoning_effort:'low'}:{}),
        response_format:strict
          ?{type:'json_schema',json_schema:{name:input.name,strict:true,schema:input.schema}}
          :{type:'json_object'},
        messages:[
          {role:'system',content:input.system},
          {role:'user',content:JSON.stringify(input.payload)},
        ],
      }),
    }),3200)
    const data=await response.json().catch(()=>null)
    captureLimit('groq',response,{status:response.status,route,
      latencyMs:epoch()-started,usage:data?.usage?.total_tokens})
    if(!response.ok)return {error:response.status}
    const value=JSON.parse(data?.choices?.[0]?.message?.content)
    if(!value||typeof value!=='object')return {error:502}
    return {value,provider:'groq'}
  }catch {
    emit({provider:'groq',route,status:'timeout_or_invalid_json',latencyMs:epoch()-started})
    // A malformed JSON output is not a valid game instruction.
    return {error:502}
  }
}

async function callGemini(env,input,route) {
  const model=env.GEMINI_GAME_MODEL||DEFAULT_GEMINI
  if(!/^gemini-[a-z0-9.-]{3,48}$/.test(model)){
    emit({provider:'gemini',route,status:'invalid_model_configuration'})
    return {error:503}
  }
  const started=epoch()
  try {
    const response=await withTimeout(signal=>fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent',{
        method:'POST',
        signal,
        headers:{'x-goog-api-key':env.GEMINI_API_KEY,'Content-Type':'application/json'},
        body:JSON.stringify({
          systemInstruction:{parts:[{text:input.system}]},
          contents:[{role:'user',parts:[{text:JSON.stringify(input.payload)}]}],
          generationConfig:{
            // Gemini 3.8 Flash removed temperature/topK/topP controls.
            thinkingConfig:{thinkingLevel:'low'},
            maxOutputTokens:Math.min(4096,Math.max(1400,input.tokens*2)),
            responseMimeType:'application/json',
            responseSchema:input.schema,
          },
        }),
      }),5300)
    const data=await response.json().catch(()=>null)
    captureLimit('gemini',response,{status:response.status,route,
      latencyMs:epoch()-started,usage:data?.usageMetadata?.totalTokenCount})
    if(!response.ok)return {error:response.status}
    const parts=data?.candidates?.[0]?.content?.parts
    const text=Array.isArray(parts)?parts.map(p=>typeof p?.text==='string'?p.text:'').join(''):''
    const value=JSON.parse(text)
    if(!value||typeof value!=='object')return {error:502}
    return {value,provider:'gemini'}
  }catch {
    emit({provider:'gemini',route,status:'timeout_or_invalid_json',latencyMs:epoch()-started})
    return {error:502}
  }
}

/**
 * One call per provider at most. Never recursively retries 429.
 * When one provider throttles, use the other and keep a cooldown so
 * subsequent turns do not immediately hit the same exhausted model.
 */
export async function completeGameJSON(env,input) {
  const configured=[
    ...(env.GROQ_API_KEY?['groq']:[]),
    ...(env.GEMINI_API_KEY?['gemini']:[]),
  ]
  if(!configured.length)return {error:503}
  const now=epoch()
  // Canary preference is deploy-time only, never selected by public requests.
  // Default production order stays Groq -> Gemini.
  const order=env.GEMINI_GAME_PRIMARY === 'true' ? [...configured].reverse() : configured
  const available=order.filter(provider=>STATE[provider].until<=now)
  if(!available.length){
    const minWait=Math.max(1,Math.ceil(Math.min(...configured.map(p=>STATE[p].until-now))/1000))
    emit({provider:'none',route:input.route,status:'all_in_cooldown',retryAfterSeconds:minWait})
    return {error:429,retryAfterSeconds:minWait}
  }
  let throttled=false
  let error=503
  for(let i=0;i<available.length;i++){
    const provider=available[i]
    const result=provider==='groq'
      ?await callGroq(env,input,input.route)
      :await callGemini(env,input,input.route)
    if(result.value){
      emit({provider,route:input.route,status:'completed',fallback:i>0})
      return {...result,fallback:i>0}
    }
    error=result.error??502
    if(error===429)throttled=true
    // For hard request failures fallback to the other configured provider
    // when possible; the next provider independently checks the JSON.
  }
  return {error:throttled?429:error}
}

/** Public health intentionally reports configuration, not account quotas. */
export function gameProviderReadiness(env) {
  return {
    groq: Boolean(env.GROQ_API_KEY),
    gemini: Boolean(env.GEMINI_API_KEY),
    ready:Boolean(env.GROQ_API_KEY||env.GEMINI_API_KEY),
  }
}

/** Isolated test helper: never reachable through the public Worker routes. */
export function resetGameProviderStateForTests(){
  for(const provider of ['groq','gemini']){
    STATE[provider].until=0
    STATE[provider].remainingTokens=null
    STATE[provider].remainingRequests=null
  }
}
