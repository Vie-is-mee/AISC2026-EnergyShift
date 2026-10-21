# Bước 4 — MiniMax M3.1 Flash Free → XingChen Xing4.0 Free (OpenRouter)

**Scope:** ONLY the evidence-bound report/explanation workflow (`backend/demo_ai.py`, `/api/demo/studio/ai`). The CSV intake assistant, manufacturing CP-SAT, B0/B1/B2 verification and exported evidence are unchanged.

**Current deployment intent (21/10/2026):** The two active Free model IDs below had **one public endpoint each**, both advertising support for `response_format` with prompt/completion prices of 0 at the time of inspection. This catalog observation does **not** confirm a successful live inference; the model-provider pool may still be unavailable or refuse parameters. The prior Qwen/Nemotron incident below is retained as history, not the active configuration. Consent text now names the MiniMax/Phala recipients.

## Fixed provider chain (no paid fallback)

- **Primary:** `minimax/minimax-m3.1-flash:free` (provider MiniMax).
- **Fallback:** `xingchen-agi/xing4.0-29b-a4b:free` (provider Phala).
- Both are exact, hardcoded `:free` IDs, not model aliases, `openrouter/auto`, or a user-supplied paid model. The OpenRouter adapter also sends `provider.max_price={prompt:0, completion:0, request:0}` with `require_parameters=true` and rejects nonallowlisted models locally when `free_only=True`. No automatic paid switch is built into this workflow.
- MiniMax is attempted once per explicit user request. XingChen is attempted **at most once** when MiniMax reports a provider-side/unknown 429, **HTTP 404** (no route/model endpoint), HTTP 500/502/503/504, or transport error. **Do not** fallback for account daily quota, credits, 401/403, invalid JSON or invalid/verifier-mismatched AI facts. Both calls count against the existing local request budget (60 provider attempts per app-process lifetime). No background retries.
- A fallback that cannot start because of the local budget returns the original error. Free pools are often rate-limited; availability is not guaranteed. Do not interpret tests as a successful live upstream completion.

## Historical incident: Qwen/Nemotron HTTP 404 / PROVIDER_ERROR (21 October 2026)

User-reported Step 4 `PROVIDER_ERROR` was diagnosed via the local backend status endpoint: the first OpenRouter request returned **HTTP 404**, the original code did not attempt Nemotron for that status, and the authenticated OpenRouter free account diagnostic still showed **1,000/1,000** daily free requests remaining. This was **not** account quota exhaustion.

The public OpenRouter model-endpoints catalog, checked without a key and without sending factory data, currently reported **zero listed provider endpoints for BOTH** `qwen/qwen3.8-27b:free` and `nvidia/nemotron-3-nano-30b-a3b:free`. The paid variants have providers but are NOT permitted by this implementation. The active `/api/v1/models` catalog also did not include either of those two IDs among its 17 currently listed `:free` model IDs. Model cards may still advertise a `:free` slug even when its provider inventory is empty. These counts are a time-sensitive snapshot, **not** an assertion that OpenRouter will permanently lack Free endpoints.

- HTTP 404 is classified as `MODEL_UNAVAILABLE` and permits **one** fallback to the active Free model (now XingChen). If both fail, no AI report is published or invented.
- `GET /api/demo/studio/ai/diagnostics` now returns `free_endpoints` based on **read-only public GETs** (no model completion and no API key). Each entry has a model ID, `endpoints`, and `status = LISTED | NO_ENDPOINTS | UNKNOWN`. `UNKNOWN` means the endpoint catalog request could not be checked, **not zero**. A provider listed in the catalog is not proof that it supports the current JSON-mode parameters or available quota.
- The browser recovery panel explains HTTP 404, shows which Free models were tried and the read-only endpoint inventory. `OPENROUTER_API_KEY` and raw provider response messages are never shown.
- If both active Free model slugs report zero endpoints in the future, **no code-only fallback can make either model generate a report**. The user must wait for providers to return or explicitly authorize a different currently available Free model; the app must not silently select a paid model.
- No live chat-completion probe or factory data submission was made during that historical investigation. Tests mock failures and the endpoint inventory.

## Data integrity and consent

The existing explicit consent, hash pinning and independent verifier remain in place. The AI must return an exact JSON `facts` object matching backend evidence and must not claim measured savings, approval or globally optimal performance. The narrative is marked **requires_human_review**. Failures yield no fabricated narrative. Live AI buttons no longer read or write generated narrative caches; each success must come from an actual provider completion, with its response ID and latency returned to the browser. The report includes `model`, `primary_model`, `fallback_model`, `attempted_models`, `fallback_used` and `free_only` to make routing auditable.

## Configuration and deployment

`OPENROUTER_API_KEY` must be set on the active **backend** (for example, Render) or the local protected `.env`. For **this step-4 workflow**, `OPENROUTER_MODEL` is ignored deliberately: neither `.env` nor a client request can silently override the fixed free model list. Restart the backend process after deployment. Do not expose the API key to JS, upload it, commit it or print it in logs.

Other AI workflows continue using their existing independent model/configuration policy. A free OpenRouter model is not a guarantee of limitless quota; account and upstream provider rate limits are separate. OpenRouter's pricing and usage policy should be rechecked before a production event.

## Verification

Run `.venv/Scripts/python.exe -m unittest backend.tests.test_demo_studio backend.tests.test_openrouter -q` and the full Python/Node/Brave suites. Tests mock the HTTP call and confirm: exact `:free` allowlist, zero price cap, MiniMax first, XingChen only after eligible failures, per-attempt budget, no account-quota retry, unchanged facts verification, consent and live-only repeated-request behavior. No live AI request should be made in unit or browser smoke tests.
