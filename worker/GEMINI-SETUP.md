# Без Фильтров — Groq → Gemini automatic failover

The same Cloudflare Worker serves ARCAnum Tarot (unchanged, Groq-only) and
the game endpoints POST /game/director, POST /game/modifier.

## Enable Gemini (Cloudflare secret — never the browser)

1. In [Google AI Studio](https://aistudio.google.com/apikey), create a Gemini
   API key for a project with the appropriate Gemini API access/quota.
   Check the project's current quotas and billing before enabling public use.
2. Open Cloudflare Dashboard → Workers & Pages → `arcanum-tarot-ai` →
   Settings → Variables and Secrets.
3. Add a **Secret** named `GEMINI_API_KEY` with the key value. **Do not**
   paste it in GitHub, this chat, the web application's code, a URL or logs.
4. Optional: add `GEMINI_GAME_MODEL` as a text variable (default:
   `gemini-3.5-flash-lite`; change only to an available model that supports JSON
   structured outputs). The game remains functional without Gemini.
5. Visit
   `https://arcanum-tarot-ai.kunicin27522.workers.dev/health`.
   Check `gameProviders.gemini === true`. It reports only whether a secret is
   configured, never the secret itself.

The deployed fallback currently uses `gemini-3.5-flash-lite`, verified
with live Cloudflare Gemini API calls. It supports structured outputs and may
be accessible under free-tier quotas (subject to Google AI Studio project limits).
Groq remains the preferred model; Gemini is only used when Groq is unavailable.

## Routing

- Groq is preferred. Its 429 (including token quota), 5xx, timeout or malformed
  JSON automatically causes a **single** fallback attempt to Gemini.
- After a provider returns 429, the Worker uses its Retry-After header when
  available and temporarily avoids the exhausted provider. Both providers
  have independent project quotas.
- Cooldown tracking is **per Worker isolate**, not global quota accounting.
  During very high concurrency, several isolates may still contact a throttled
  provider. Provider dashboards remain authoritative.
- Structured JSON outputs from **either** provider pass exactly the same
  allowlist and challenge-content validation. The AI cannot invent card IDs
  outside the Director's shortlist, relax consent boundaries or add unchecked
  conditions.
- If both providers fail or are throttled, the browser uses its local Director,
  with no broken cards or mandatory AI conditions.
- The original Tarot endpoint `POST /` still uses Groq and has not been
  migrated or reconfigured.

## Monitoring and budgets

The Worker emits structured Cloudflare request logs. Filter for
`event=bez_filtrov_ai_provider`. Each record contains only technical metadata:
provider, route (director / modifier-create / modifier-review), HTTP status,
latency, total model tokens, Groq's remaining TPM and RPD (where supplied),
Retry-After and per-isolate cooldown. **Card text, user responses, player names
and API keys are never logged by this module.**

Groq rate-limit headers:
- `x-ratelimit-remaining-tokens`: **tokens per minute** remaining
- `x-ratelimit-remaining-requests`: **requests per day** remaining
- `retry-after`: seconds to wait after a 429

Check exact Groq limits in the Groq Console and Gemini limits in Google AI
Studio. Google applies quotas per **project**, not per key. Gemini also has
separate minute and daily limits. Configure billing/spend caps according to
your preference; Gemini use may incur charges.

Response headers `X-AI-Provider`, `X-AI-Fallback` on game responses expose
the actual provider selected for debugging, not credentials or user data.

## Rollout & diagnostics

- Run `npm test` in `worker/` to test Groq success, 429 → Gemini, cooldown,
  both exhausted, schema validation and CORS with mocked providers.
- A successful Cloudflare deployment alone **does not prove Gemini routing is
  active**. It becomes active when the Cloudflare `GEMINI_API_KEY` secret exists.
- Do not log or print the key to troubleshoot. Check only the `/health`
  provider flags and sanitized Cloudflare logs.
