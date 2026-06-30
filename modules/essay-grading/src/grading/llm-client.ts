import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { describeLlmConfig, loadLlmConfig, type LlmConfig, type LlmEndpointConfig, type LlmProvider } from "./llm-config.js";

type JsonSchema = Record<string, unknown>;

export type LlmTextMessage = {
  role: "system" | "user";
  content: string;
};

export type LlmVisionMessage = {
  role: "user";
  content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } }
  >;
};

let cachedConfig: LlmConfig | null = null;

export function getLlmConfig(): LlmConfig {
  if (!cachedConfig) {
    cachedConfig = loadLlmConfig();
  }
  return cachedConfig;
}

function createClient(endpoint: LlmEndpointConfig): OpenAI {
  return new OpenAI({
    apiKey: endpoint.apiKey,
    baseURL: endpoint.baseUrl,
  });
}

function buildJsonInstruction(schemaName: string, schema: JsonSchema): string {
  return `Respond with valid JSON only. Return one object whose top-level keys match this schema (${schemaName}). Do not nest the payload under "${schemaName}" or any wrapper key. Schema:
${JSON.stringify(schema, null, 2)}`;
}

/** DeepSeek often wraps JSON as { "schema_name": { ...fields } } despite instructions. */
export function unwrapLlmJsonPayload(raw: unknown, schemaName: string): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return raw;
  }

  const record = raw as Record<string, unknown>;
  const wrapped = record[schemaName];
  if (wrapped && typeof wrapped === "object" && !Array.isArray(wrapped)) {
    return wrapped;
  }

  const keys = Object.keys(record);
  if (keys.length === 1) {
    const only = record[keys[0]!];
    if (only && typeof only === "object" && !Array.isArray(only)) {
      return only;
    }
  }

  return raw;
}

function parseLlmJson(raw: string, schemaName: string): unknown {
  return unwrapLlmJsonPayload(JSON.parse(raw) as unknown, schemaName);
}

function withJsonInstruction(
  messages: LlmTextMessage[],
  schemaName: string,
  schema: JsonSchema,
): ChatCompletionMessageParam[] {
  const instruction = buildJsonInstruction(schemaName, schema);
  const firstSystem = messages.find((message) => message.role === "system");
  if (firstSystem) {
    return messages.map((message) =>
      message === firstSystem
        ? { role: "system", content: `${message.content}\n\n${instruction}` }
        : message,
    );
  }
  return [{ role: "system", content: instruction }, ...messages];
}

function resolveMaxTokensParam(
  provider: LlmProvider,
  maxTokens: number,
): Record<string, number> {
  if (provider === "deepseek") {
    return { max_tokens: maxTokens };
  }
  return { max_completion_tokens: maxTokens };
}

export async function callLlmForJson(
  messages: LlmTextMessage[],
  schemaName: string,
  schema: JsonSchema,
  maxTokens = 8000,
): Promise<unknown> {
  const config = getLlmConfig();
  const client = createClient(config.text);

  if (config.provider === "openai") {
    const completion = await client.chat.completions.create({
      model: config.text.model,
      messages,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: schemaName,
          strict: true,
          schema,
        },
      },
      ...resolveMaxTokensParam(config.text.provider, maxTokens),
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      throw new Error("LLM returned an empty JSON response.");
    }
    return parseLlmJson(raw, schemaName);
  }

  const completion = await client.chat.completions.create({
    model: config.text.model,
    messages: withJsonInstruction(messages, schemaName, schema),
    response_format: { type: "json_object" },
    ...resolveMaxTokensParam(config.text.provider, maxTokens),
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("DeepSeek returned an empty JSON response.");
  }
  return parseLlmJson(raw, schemaName);
}

export async function callLlmForVisionText(
  messages: LlmVisionMessage[],
  maxTokens = 2000,
): Promise<string> {
  const config = getLlmConfig();
  const client = createClient(config.vision);
  const completion = await client.chat.completions.create({
    model: config.vision.model,
    messages,
    ...resolveMaxTokensParam(config.vision.provider, maxTokens),
  });
  const text = completion.choices[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("Vision model returned an empty response.");
  }
  return text;
}

export function logLlmStartup(): void {
  console.log(`LLM provider: ${describeLlmConfig(getLlmConfig())}`);
}
