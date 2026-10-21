# AI CSV assistant implementation plan

## Agreed workflow

Inspect CSV, identify data-quality issues, write a report, and propose cell edits. The operator reviews each before/after change, applies selected changes to a copy, and downloads a new CSV. The original file remains untouched.

## Delivery

1. Add a bounded CSV audit with structural/type/duplicate/date checks and source hashes. Keep original columns, unknown columns and row order.
2. Connect the existing backend OpenRouter client to a free-only model selector. No paid fallback, browser API keys, arbitrary code or model-controlled file access.
3. Present deterministic findings and AI explanations separately. Accept lossless AI normalization proposals; edits to production facts require operator input and confirmation.
4. Validate patches against the original hash and original cell value before applying. Re-audit the edited CSV and require the existing input gate and solver for production decisions.
5. Add verified plan explanations: recalculate the submitted dataset, give the model a bounded evidence summary, and reject answers that change the authoritative fact fields.
6. Exercise parser/patch/failure cases, backend routes, frontend stale-response handling, file import/export and a synthetic live OpenRouter request when configuration is available.

## Providers considered

- OpenRouter Free: current integration foundation; `openrouter/free` or `google/gemma-4-26b-a4b-it:free`. [Free routing](https://openrouter.ai/openrouter/free), [Gemma model](https://openrouter.ai/google/gemma-4-26b-a4b-it:free), [pricing/quotas](https://openrouter.ai/pricing/).
- Groq Free: alternative provider to evaluate for structured extraction; [limits](https://console.groq.com/docs/rate-limits).
- Gemini API Free: alternative provider to evaluate for report writing; free availability depends on model and free-tier content may be used to improve Google products; [pricing and terms](https://ai.google.dev/gemini-api/docs/pricing).

Provider/model availability and quotas can change. This implementation integrates OpenRouter; the other providers are recommendations, not implemented adapters.
