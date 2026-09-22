/** Test-only Pi completion responder for visible text-entry acceptance.
 *
 * Load beside the production extension. It replaces only the external Luna
 * completion and leaves model lookup/auth ownership in Pi.
 */

import { writeFile } from "node:fs/promises";

import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

function textFromPrompt(context: unknown): { field: string; goal: string } {
  if (typeof context !== "object" || context === null) {
    throw new Error("synthetic helper received no context");
  }
  const value = context as {
    messages?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  const prompt = value.messages
    ?.flatMap((message) => message.content ?? [])
    .find((part) => part.type === "text")?.text;
  if (typeof prompt !== "string") {
    throw new Error("synthetic helper received no text prompt");
  }
  const parsed: unknown = JSON.parse(prompt);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("synthetic helper prompt was not an object");
  }
  const record = parsed as {
    field?: { label?: unknown };
    goal?: unknown;
    page?: { text?: unknown };
  };
  if (
    typeof record.field?.label !== "string" ||
    typeof record.goal !== "string" ||
    typeof record.page?.text !== "string" ||
    !record.field.label.startsWith("Destination city") ||
    !record.goal.includes("second-largest city") ||
    !record.page.text.includes("Waiting for a valid destination")
  ) {
    throw new Error("upstream field context was not preserved");
  }
  return { field: record.field.label, goal: record.goal };
}

export default function deterministicHelper(pi: ExtensionAPI): void {
  let restore: (() => void) | undefined;

  pi.on("session_start", (_event, ctx: ExtensionContext) => {
    const registry = ctx.modelRegistry;
    const originalComplete = registry.complete;
    registry.complete = (async (model, context, options) => {
      if (
        model.provider !== "openai-codex" ||
        model.id !== "gpt-5.6-luna" ||
        !context.systemPrompt?.startsWith(
          "Return a JSON object with exactly one key, text",
        )
      ) {
        return originalComplete.call(registry, model, context, options);
      }
      const requestOptions = options as
        { reasoningEffort?: unknown; signal?: AbortSignal } | undefined;
      if (requestOptions?.reasoningEffort !== "high") {
        throw new Error("production helper did not request high reasoning");
      }
      requestOptions.signal?.throwIfAborted();
      const summary = textFromPrompt(context);
      const marker = process.env.RLCD_ACCEPTANCE_HELPER_MARKER;
      if (marker) {
        await writeFile(
          marker,
          JSON.stringify(
            {
              externalReply: "synthetic deterministic Pi completion",
              provider: model.provider,
              model: model.id,
              reasoningEffort: requestOptions.reasoningEffort,
              field: summary.field,
              goal: summary.goal,
              returnedValue: "Busan",
            },
            null,
            2,
          ),
        );
      }
      return {
        role: "assistant",
        content: [{ type: "text", text: JSON.stringify({ text: "Busan" }) }],
        api: "openai-codex-responses",
        provider: model.provider,
        model: model.id,
        responseModel: "synthetic-pi-luna-responder",
        usage: {
          input: 23,
          output: 4,
          cacheRead: 0,
          cacheWrite: 0,
          reasoning: 2,
          totalTokens: 27,
          cost: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            total: 0,
          },
        },
        stopReason: "stop",
        timestamp: Date.now(),
      };
    }) as typeof registry.complete;
    restore = () => {
      registry.complete = originalComplete;
    };
  });

  pi.on("session_shutdown", () => {
    restore?.();
    restore = undefined;
  });
}
