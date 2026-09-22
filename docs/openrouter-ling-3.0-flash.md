# OpenRouter Ling 3.0 Flash provider scout

Retrieved **2026-09-22 UTC**. This is historical public-source and offline
payload evidence, not live-provider acceptance: no authenticated provider request
or live inference was made. The user selected this model for the native helper;
the later thin rewrite pins it, but has still made no live provider call.

## Selected native configuration

```text
TEXT_MODEL_BASE_URL=https://openrouter.ai/api/v1
TEXT_MODEL=inclusionai/ling-3.0-flash
TEXT_MODEL_REASONING=none
TEXT_MODEL_API_KEY=<host-local OpenRouter key; placeholder, not a real value>
```

This is the selected configuration now pinned by the thin runner, not a claim that OpenRouter has accepted a live request or that a real key has been provided. The exact model ID and base URL are advertised by OpenRouter's [model-specific guide](https://openrouter.ai/inclusionai/ling-3.0-flash/llms.txt) and [quickstart](https://openrouter.ai/docs/quickstart.md). The pinned [`field_text()`](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/model.py#L151-L198), inspected at `.venv/lib/python3.12/site-packages/jev_ultrafast/model.py`, appends `/chat/completions` and sends Bearer auth, `max_tokens: 1024`, `response_format: {"type":"json_object"}`, system and user messages, and either `reasoning.effort: low` or, for `TEXT_MODEL_REASONING=none`, `reasoning.enabled: false`. This selection requires no new adapter, server, or provider selector and does not change Jev.

`Authorization: Bearer …` is required. `HTTP-Referer` and `X-OpenRouter-Title` are optional for API use; the referer is required only to create app attribution/rankings ([authentication](https://openrouter.ai/docs/api_reference/authentication.md), [quickstart](https://openrouter.ai/docs/quickstart.md), [attribution](https://openrouter.ai/docs/app-attribution.md)).

## Advertised limits, routes, and prices

OpenRouter's public [model catalogue](https://openrouter.ai/api/v1/models) reports a 262,144-token model context, 32,768-token top-provider output ceiling, text-only I/O, and model-level support for `max_tokens`, `response_format`, and `reasoning`. InclusionAI's own [model card](https://huggingface.co/inclusionAI/Ling-3.0-flash/blob/main/README.md) and [config](https://huggingface.co/inclusionAI/Ling-3.0-flash/blob/main/config.json) also identify a 256K/262,144 context. OpenRouter says input and output share the context window, so 32,768 is a ceiling rather than guaranteed output ([models documentation](https://openrouter.ai/docs/guides/overview/models.md)). The native request's 1,024-token cap is within both advertised routes:

| Route            | Context / max output |    Input |   Output | Cached-input read | Relevant advertised parameters                       |
| ---------------- | -------------------: | -------: | -------: | ----------------: | ---------------------------------------------------- |
| Novita           |     262,144 / 32,768 | $0.021/M | $0.063/M |         $0.0042/M | `max_tokens`, `reasoning`; **not** `response_format` |
| DeepInfra (bf16) |     131,072 / 32,768 |  $0.06/M |  $0.18/M |          $0.012/M | `max_tokens`, `reasoning`, `response_format`         |

These are the route records returned by the public [endpoint catalogue](https://openrouter.ai/api/v1/models/inclusionai/ling-3.0-flash-20260723/endpoints), converted from its USD-per-token values to USD per million tokens. The selected request ID is `inclusionai/ling-3.0-flash`; the inspected catalogue maps it to canonical slug `inclusionai/ling-3.0-flash-20260723`. This lookup is not a guarantee that routing, availability or the public alias will remain immutable. Both records say implicit caching is unsupported. The request has no cache directive, so the listed cache-read rates do not establish that this helper will obtain cache hits.

OpenRouter defaults to price-weighted routing, but `response_format` is a soft parameter preference: when some routes support it, only supporting routes are used. Thus current metadata and routing docs advertise DeepInfra—not cheaper Novita—as the route compatible with this exact JSON-mode request under default routing ([provider parameter handling](https://openrouter.ai/docs/guides/routing/provider-selection.md#requiring-providers-to-support-all-parameters)). Route availability, account policy, and prices can change.

## Compatibility assessment

- **JSON mode is advertised, not live-proven.** OpenRouter documents `response_format: {"type":"json_object"}` as JSON mode and the current DeepInfra endpoint advertises `response_format`; the pinned system prompt also explicitly requests one JSON object ([parameter docs](https://openrouter.ai/docs/api_reference/parameters.md#response-format)). No live reply established valid JSON, exact `{"text": …}` adherence, or provider-side handling.
- **Disable reasoning.** InclusionAI says thinking defaults on and can be disabled per request. OpenRouter reports Ling reasoning `default_enabled: true`, `mandatory: false`; its request schema accepts `reasoning.enabled`, and both routes advertise `reasoning` ([reasoning docs](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens.md)). `TEXT_MODEL_REASONING=none` therefore best fits short field values and is intended to prevent reasoning from consuming the shared 1,024-token output budget. Exact OpenRouter-to-provider translation remains unproven, so that prevention is not yet established. The alternative `effort: low` is less well supported: Ling's catalogue record does not advertise `supported_efforts`.
- No source or probe establishes actual latency, reliability, field-value accuracy, JSON compliance, billed cost per run, chosen route, or cache behavior. The endpoint catalogue's recent-latency fields were null at retrieval.

## Offline request probe

The unchanged installed `field_context()` and `field_text()` were called with
synthetic configuration and only `post_json` replaced. The captured request used
the exact OpenRouter chat-completion URL/model, `max_tokens: 1024`, JSON-object
response format and `reasoning.enabled: false`. The native prompt was unchanged;
a fake `{"text":"Busan"}` was accepted, and fake empty/extra-key values were
rejected by upstream. Socket/process tripwires were not hit, and the synthetic
key value was not serialized to `results.json`. With `TEXT_MODEL_REASONING` unset, the native payload instead contained
`reasoning.effort: low`.

This verifies local request construction and validation only, not OpenRouter or
provider acceptance. The real key, live payload compatibility, selected route
and model behavior remain pending. Evidence is retained under
`artifacts/thin-python-plan/openrouter/` (`payload.probe.py`, `results.json`,
`REPORT.md`).

## Public-capture qualification

The complete model-specific guide, endpoint response and routing documentation
were retained locally. A separate full-catalogue response capture was truncated
at 147,456 bytes and did not parse as a complete JSON document. The selected
Ling object occurred before that boundary and was extracted with a complete
JSON parse of that object, with its exact ID checked; missing catalogue data
was not reconstructed. `public-metadata-note.md` and `ling-model-extracted.json`
record this distinction. The advertised claims above do not rely on treating
the truncated whole catalogue as complete.
