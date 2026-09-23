# Direct DeepSeek Flash provider evidence

Status: **selected and implemented locally**. Verified **2026-09-23 UTC** from
unauthenticated first-party DeepSeek documentation, the installed native helper,
and deterministic offline request checks. No credential was read, no DeepSeek
API request or inference was made, and no speed was measured.

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

DeepSeek currently documents **`deepseek-flash`** as the model name and identifies its current model version as **DeepSeek-V4.1-Flash** ([first call](https://api-docs.deepseek.com/), [models and pricing](https://api-docs.deepseek.com/quick_start/pricing), [retained extracts](../artifacts/deepseek-direct/sources/first-api-call.md)). The alias is not an immutable version pin: the same documentation says retired legacy aliases are now served by DeepSeek-V4.1-Flash. The current mapping is verified; a permanent mapping is not.

The generic OpenAI-format base is `https://api.deepseek.com`. First-party integration guides also document `https://api.deepseek.com/v1` as a base and `https://api.deepseek.com/v1/chat/completions` as a full endpoint ([retained `/v1` extracts](../artifacts/deepseek-direct/sources/v1-compatibility.md)). Client-specific guidance varies because clients assemble paths differently. For this helper, the recommended `/v1` base constructs the documented full endpoint exactly.

DeepSeek's OpenAI-format thinking control is:

```json
{ "thinking": { "type": "disabled" } }
```

The API reference says `disabled` selects non-thinking mode; thinking otherwise defaults to enabled at high effort ([thinking-mode extract](../artifacts/deepseek-direct/sources/thinking-mode.md)). DeepSeek also documents `response_format: {"type":"json_object"}` for JSON Output. It requires a prompt that says JSON and describes the desired shape, both of which the native `TEXT_VALUE` prompt does. DeepSeek warns that JSON Output can occasionally return empty content ([JSON extract](../artifacts/deepseek-direct/sources/json-output.md)); the helper's existing parser rejects empty or malformed output rather than typing it.

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
retained red/control/green logs under
`artifacts/deepseek-direct/verification/` show that the former OpenRouter tuple
and direct DeepSeek with the wrong `none` value fail this assertion, while the
selected tuple passes.

There are two configuration incompatibilities to avoid:

- Using the documented root base exactly as `https://api.deepseek.com` does not match the helper's slash-sensitive test after `rstrip("/")`; it constructs the valid root endpoint but sends `reasoning: {"effort":"low"}` instead of the verified DeepSeek-native disable payload.
- Using `TEXT_MODEL_REASONING=none` overrides the DeepSeek-native branch with `reasoning: {"enabled":false}`, which is the helper's OpenRouter shape, not the verified direct-DeepSeek OpenAI-format shape.

## Native credential handoff

`TYPESAFE_API_KEY` is the TypeSafe-issued key for Jev decisions.
`TEXT_MODEL_API_KEY` is the DeepSeek-issued key for optional field text. The
parent-owned, human-run four-stage wizard will supply these variable names, the
selected tuple, and credential values in Browser Harness's native workspace
`.env`; this implementation does not author or run that wizard and did not read
or write the host `.env`.

Do not use the retained old `pi-rlcd` launcher with this direct route. It injects
an OpenRouter key into `TEXT_MODEL_API_KEY`, creating a wrong-provider credential
path. The parent task will make that launcher fail closed without deleting it;
this repository change does not edit the launcher.

This is offline request-construction evidence only. It does not establish
credential validity, live provider acceptance, latency, throughput, model
quality, JSON adherence in a live response, reliability, billing, or
browser-task success.
