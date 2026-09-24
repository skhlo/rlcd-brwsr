# Direct DeepSeek Flash provider evidence

Status: **selected in this repository revision**. The original compatibility
scout used unauthenticated first-party DeepSeek documentation, the installed
native helper, and deterministic offline request checks on **2026-09-23 UTC**.
That scout read no credential, made no DeepSeek API request or inference, and
measured no speed. Later live observations are recorded separately in the
[current verification evidence](thin-python-evidence.md#actual-outer-turn-public-page-pilot).

## Selected tuple

```text
TEXT_MODEL_BASE_URL=https://api.deepseek.com/v1
TEXT_MODEL=deepseek-flash
TEXT_MODEL_REASONING=disabled
```

This tuple applies only to the optional field-text helper; Jev and Pi's outer
model remain unchanged. It is a speed-oriented configuration choice - Flash in
non-thinking mode - not evidence that requests will be faster.

## Compatibility result

DeepSeek currently documents **`deepseek-flash`** as the model name and
identifies its current model version as **DeepSeek-V4.1-Flash** in the
[first-call guide](https://api-docs.deepseek.com/) and
[models and pricing](https://api-docs.deepseek.com/quick_start/pricing). The
alias is not an immutable version pin: the same documentation says retired
legacy aliases are now served by DeepSeek-V4.1-Flash. The current mapping is
verified; a permanent mapping is not.

The generic OpenAI-format base is `https://api.deepseek.com`. First-party
integration guides also document `https://api.deepseek.com/v1` as a base in the
[nanobot example](https://api-docs.deepseek.com/quick_start/agent_integrations/nanobot/)
and `https://api.deepseek.com/v1/chat/completions` as a full endpoint in the
[WorkBuddy example](https://api-docs.deepseek.com/quick_start/agent_integrations/workbuddy/).
Client-specific guidance varies because clients assemble paths differently. For
this helper, the recommended `/v1` base constructs the documented full endpoint
exactly.

DeepSeek's OpenAI-format thinking control is:

```json
{ "thinking": { "type": "disabled" } }
```

The [thinking-mode guide](https://api-docs.deepseek.com/guides/thinking_mode/)
and [Chat Completions API reference](https://api-docs.deepseek.com/api/create-chat-completion)
say `disabled` selects non-thinking mode; thinking otherwise defaults to
enabled at high effort. DeepSeek also documents
`response_format: {"type":"json_object"}` in its
[JSON Output guide](https://api-docs.deepseek.com/guides/json_mode/). It requires
a prompt that says JSON and describes the desired shape, both of which the
native `TEXT_VALUE` prompt does. DeepSeek warns that JSON Output can
occasionally return empty content; the helper's existing parser rejects empty
or malformed output rather than typing it.

The API-key dashboard linked by DeepSeek's first-call page is **https://platform.deepseek.com/api_keys**. Its unauthenticated page returned CloudFront 403 during this check, so the verified fact is the official documentation's link target, not dashboard contents.

## Native helper behavior

The installed `.venv/lib/python3.12/site-packages/jev_ultrafast/model.py` selects the DeepSeek-native `thinking` payload only when the normalized base contains `api.deepseek.com/`. It then replaces that payload with OpenRouter-style `reasoning.enabled: false` only when `TEXT_MODEL_REASONING` equals the literal string `none`.

An offline probe used a synthetic key and replaced only `post_json`. With the selected tuple, the helper constructed:

- URL `https://api.deepseek.com/v1/chat/completions`;
- model `deepseek-flash`;
- `thinking: {"type":"disabled"}`;
- `response_format: {"type":"json_object"}`; and
- `max_tokens: 1024`.

`TEXT_MODEL_REASONING=disabled` is therefore an operator-readable non-`none`
value that preserves existing upstream behavior. Upstream does not parse
`disabled` as a new enum. Any value other than literal `none` takes the same
base-specific branch.

The maintained registered-tool fake-HTTP seam and deterministic text-entry
fixture assert the exact endpoint, model, native `thinking` disablement, absence
of the OpenRouter `reasoning` field, JSON-object format, and 1,024-token cap. The
ignored operator-local receipts at `artifacts/deepseek-direct/verification/`
(not distributed with the public repository) show that the former OpenRouter
tuple and direct DeepSeek with the wrong `none` value fail this assertion, while
the selected tuple passes.

There are two configuration incompatibilities to avoid:

- Using the documented root base exactly as `https://api.deepseek.com` does not match the helper's slash-sensitive test after `rstrip("/")`; it constructs the valid root endpoint but sends `reasoning: {"effort":"low"}` instead of the verified DeepSeek-native disable payload.
- Using `TEXT_MODEL_REASONING=none` overrides the DeepSeek-native branch with `reasoning: {"enabled":false}`, which is the helper's OpenRouter shape, not the verified direct-DeepSeek OpenAI-format shape.

## Native credential handoff

Follow the [README setup](../README.md#setup-and-preflight) for Browser Harness's
native workspace environment. `TYPESAFE_API_KEY` must be TypeSafe-issued for Jev
decisions. `TEXT_MODEL_API_KEY` must be DeepSeek-issued for optional field text;
an OpenRouter key is the wrong provider credential for this route. The original
offline scout did not read or write the host environment.

The 2026-09-23 offline scout alone does not establish credential validity, live
provider acceptance, latency, throughput, model quality, live JSON adherence,
reliability, billing, or browser-task success. The later recorded live pilots
establish only their observed outcomes; they do not guarantee future acceptance,
performance, cost, or general browser reliability.
