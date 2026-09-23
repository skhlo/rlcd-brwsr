# OpenRouter DeepSeek V4.1 Flash provider evidence

Retrieved **2026-09-23 UTC**. This note records the selected implementation,
unauthenticated public-source research, and deterministic offline verification.
No authenticated request, model inference, billing test, live browser task, or
measured-speed test was made.

## Selected implemented native configuration

```text
TEXT_MODEL_BASE_URL=https://openrouter.ai/api/v1
TEXT_MODEL=deepseek/deepseek-v4.1-flash:nitro
TEXT_MODEL_REASONING=none
```

The exact speed-oriented, configuration-only model string is **`deepseek/deepseek-v4.1-flash:nitro`**. OpenRouter documents `:nitro` as a routing suffix that can be appended to any model ID; it is not a separate catalogue model, so its capabilities are those of the base `deepseek/deepseek-v4.1-flash` entry ([Nitro variant](https://openrouter.ai/docs/guides/routing/model-variants/nitro.md), [provider selection](https://openrouter.ai/docs/guides/routing/provider-selection.md#nitro-shortcut), [model-specific guide](https://openrouter.ai/deepseek/deepseek-v4.1-flash/llms.txt)). The base URL, existing OpenRouter credential, JSON-object response format, and 1,024-token output cap can remain unchanged. Jev and Pi's outer model are outside this tuple and are not changed by it.

In the installed native helper, `TEXT_MODEL_REASONING=none` produces:

```json
{ "reasoning": { "enabled": false } }
```

This setting asks OpenRouter and the selected route to disable reasoning for the
short field-value helper. If enforced, reasoning does not consume the same
`max_tokens` budget as visible output ([OpenRouter reasoning](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens.md#reasoning-tokens-and-max_tokens)). The request shape is verified offline;
provider-side enforcement is not live-proven.

## Compatibility evidence

OpenRouter's public base-model entry advertises `max_tokens`, `reasoning`, and `response_format`; its reasoning metadata says `default_enabled: true` and `mandatory: false`. OpenRouter defines `mandatory: false` as allowing the disable control, while its normalized reasoning interface uses `reasoning.enabled` ([models API](https://openrouter.ai/api/v1/models), [reasoning-option semantics](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens.md#discovering-per-model-reasoning-options)). DeepSeek's official API documentation independently says thinking is enabled by default at high effort and supports native `{"thinking":{"type":"disabled"}}`; its Anthropic-format equivalent is reasoning effort `none` ([DeepSeek thinking mode](https://api-docs.deepseek.com/guides/thinking_mode/)). These sources support the existing OpenRouter payload as a request to disable
thinking; this work did not make a live request to prove OpenRouter's per-route
translation or enforcement.

The complete public endpoint response contained 26 routes. Every route advertised `reasoning` and `max_tokens`; 23 advertised `response_format`. OpenRouter treats `response_format` as a soft routing requirement when at least one route supports it, so this request is routed among supporting routes even though the helper does not set `provider.require_parameters` ([provider parameter handling](https://openrouter.ai/docs/guides/routing/provider-selection.md#requiring-providers-to-support-all-parameters)). Every advertised route's output ceiling exceeded the helper's 1,024-token cap.

OpenRouter defines `response_format: {"type":"json_object"}` as JSON mode and instructs callers to request JSON in the prompt ([parameter reference](https://openrouter.ai/docs/api_reference/parameters.md#response-format)). DeepSeek documents the same request shape, while warning that JSON mode can occasionally return empty content ([DeepSeek JSON Output](https://api-docs.deepseek.com/guides/json_mode/)). The helper's system prompt requests one JSON object and its existing parser still owns exact `{"text": ...}` validation; advertised JSON mode does not itself prove that exact application shape.

## Implemented offline verification

The registered-tool test crosses the production TypeScript launcher, Python
runtime, pinned `Agent.run()` and native field-text helper while replacing only
external Browser/CDP and provider interactions. At the fake-provider boundary it
asserts the exact request URL and body:

- `https://openrouter.ai/api/v1/chat/completions`;
- model `deepseek/deepseek-v4.1-flash:nitro`;
- `reasoning: {"enabled": false}`;
- `response_format: {"type": "json_object"}`; and
- `max_tokens: 1024`.

The maintained real-browser deterministic text-entry provider fixture asserts
the same request contract. Before changing the configuration owner, the new
model assertion failed against the former Ling value with `native helper request
did not forward the DeepSeek Nitro model`; it passed after restoration to the
selected configuration. The full 38-test deterministic suite, TypeScript,
formatting, no-write Python compilation, shell syntax and diff checks then
passed. This establishes local request construction and configuration conflict
handling only, not provider acceptance, model quality, routing, price, or speed.

## What `:nitro` optimizes

OpenRouter says `:nitro`:

1. sorts eligible endpoints by **throughput**, measured as generated tokens per second; and
2. admits priority-service-tier endpoints, which compete on measured throughput and are selected only when fastest by that metric.

This is a superset of `provider.sort: "throughput"`, which sorts without making priority endpoints eligible ([Nitro variant](https://openrouter.ai/docs/guides/routing/model-variants/nitro.md)). It is not latency-first routing. OpenRouter's separate `provider.sort: "latency"` prioritizes lowest latency, and OpenRouter defines its text-model latency metric as time to first token (TTFT) ([provider sorting](https://openrouter.ai/docs/guides/routing/provider-selection.md#provider-sorting), [OpenRouter FAQ](https://openrouter.ai/docs/faq)).

For the helper's non-streaming field value, whole-request latency contains both phases:

```text
Total latency = TTFT + (output tokens / generation throughput)
```

Therefore Nitro optimizes the generation-throughput term, not TTFT and not the complete field-value duration as a guaranteed whole ([latency and performance](https://openrouter.ai/docs/guides/best-practices/latency-and-performance.md#the-latency--dx-optimization-cookbook)). Latency-first sorting would require adding a `provider.sort` request field; the installed helper exposes no configuration for that, so it is not a configuration-only alternative.

## Routing, price, and evidence limits

OpenRouter normally load-balances stable providers with a price preference. Nitro replaces that ordering with throughput ordering and may select a more expensive route. If a priority endpoint wins, OpenRouter charges that endpoint's priority rate; actual billing follows the tier that serves the request ([default routing](https://openrouter.ai/docs/guides/routing/provider-selection.md#price-based-load-balancing-default-strategy), [Nitro pricing semantics](https://openrouter.ai/docs/guides/routing/model-variants/nitro.md#how-it-works)). Routes, availability, measurements, and prices can change.

Every `latency_last_30m` and `throughput_last_30m` value in the unauthenticated endpoint capture was `null`. No provider is identified here as fastest. The public data supports the Nitro routing policy, not a provider choice, a measured-speed guarantee, reliability, exact field-text quality, JSON adherence in a live response, or billed cost per call.

## Retained source captures

- `artifacts/deepseek-flash-helper/sources/openrouter-model-selected.json` - the complete selected entry extracted only after the 746,199-byte, 455-entry [models catalogue](https://openrouter.ai/api/v1/models) parsed successfully; the capture records retrieval time, source URL, byte count, selection count, and raw-response SHA-256.
- `artifacts/deepseek-flash-helper/sources/openrouter-endpoints.json` - the complete model-specific [endpoint response](https://openrouter.ai/api/v1/models/deepseek/deepseek-v4.1-flash/endpoints), with retrieval time, source URL, byte count, and raw-response SHA-256.

These captures remain local, ignored evidence under `artifacts/`; they do not ship
in the candidate. The historical Ling provider note preserves its findings and
recorded live evidence. The DeepSeek switch is implemented and offline-verified,
but has no live helper or provider-acceptance evidence.
