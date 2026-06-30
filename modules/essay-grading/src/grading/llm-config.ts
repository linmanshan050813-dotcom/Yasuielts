export type LlmProvider = "deepseek" | "openai";

export interface LlmEndpointConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  provider: LlmProvider;
}

function inferProvider(baseUrl: string, fallback: LlmProvider): LlmProvider {
  const lower = baseUrl.toLowerCase();
  if (lower.includes("deepseek")) return "deepseek";
  if (lower.includes("openai")) return "openai";
  return fallback;
}

export interface LlmConfig {
  provider: LlmProvider;
  text: LlmEndpointConfig;
  vision: LlmEndpointConfig;
}

function resolveProvider(): LlmProvider {
  const raw = (process.env.LLM_PROVIDER ?? "deepseek").toLowerCase();
  return raw === "openai" ? "openai" : "deepseek";
}

function resolveTextApiKey(provider: LlmProvider): string {
  const key =
    process.env.DEEPSEEK_API_KEY ??
    process.env.LLM_API_KEY ??
    process.env.OPENAI_API_KEY ??
    "";
  if (!key) {
    const hint =
      provider === "deepseek"
        ? "Set DEEPSEEK_API_KEY (or LLM_API_KEY)."
        : "Set OPENAI_API_KEY (or LLM_API_KEY).";
    throw new Error(`Missing API key. ${hint}`);
  }
  return key;
}

function defaultBaseUrl(provider: LlmProvider): string {
  return provider === "deepseek" ? "https://api.deepseek.com" : "https://api.openai.com/v1";
}

function defaultTextModel(provider: LlmProvider): string {
  return provider === "deepseek" ? "deepseek-v4-flash" : "gpt-5.4-mini";
}

function defaultVisionModel(provider: LlmProvider): string {
  return provider === "deepseek" ? "gpt-5.4-mini" : "gpt-5.4-mini";
}

function resolveVisionEndpoint(textProvider: LlmProvider): LlmEndpointConfig {
  const explicitBaseUrl =
    process.env.LLM_VISION_BASE_URL ??
    process.env.DEEPSEEK_VISION_BASE_URL ??
    process.env.OPENAI_VISION_BASE_URL;
  const explicitApiKey =
    process.env.LLM_VISION_API_KEY ??
    process.env.DEEPSEEK_VISION_API_KEY ??
    process.env.OPENAI_VISION_API_KEY;
  const explicitModel =
    process.env.LLM_VISION_MODEL ??
    process.env.DEEPSEEK_VISION_MODEL ??
    process.env.OPENAI_VISION_MODEL;

  if (explicitBaseUrl || explicitApiKey || explicitModel) {
    const openaiKey = process.env.OPENAI_API_KEY ?? "";
    const apiKey = explicitApiKey ?? openaiKey;
    if (!apiKey) {
      throw new Error("Missing vision API key. Set LLM_VISION_API_KEY or OPENAI_API_KEY.");
    }
    const baseUrl = explicitBaseUrl ?? defaultBaseUrl("openai");
    const model = explicitModel ?? process.env.OPENAI_MODEL ?? defaultVisionModel(textProvider);
    return {
      apiKey,
      baseUrl,
      model,
      provider: inferProvider(baseUrl, "openai"),
    };
  }

  if (textProvider === "deepseek") {
    const openaiKey = process.env.OPENAI_API_KEY ?? "";
    if (!openaiKey) {
      throw new Error(
        "DeepSeek handles grading but chart images need OpenAI vision. Set OPENAI_API_KEY.",
      );
    }
    return {
      apiKey: openaiKey,
      baseUrl: defaultBaseUrl("openai"),
      model: process.env.OPENAI_MODEL ?? defaultVisionModel("openai"),
      provider: "openai",
    };
  }

  const textApiKey = resolveTextApiKey(textProvider);
  const textBaseUrl =
    process.env.LLM_BASE_URL ??
    process.env.OPENAI_BASE_URL ??
    defaultBaseUrl(textProvider);

  return {
    apiKey: textApiKey,
    baseUrl: textBaseUrl,
    model: defaultVisionModel(textProvider),
    provider: textProvider,
  };
}

export function loadLlmConfig(): LlmConfig {
  const provider = resolveProvider();
  const textApiKey = resolveTextApiKey(provider);
  const textBaseUrl =
    process.env.LLM_BASE_URL ??
    process.env.DEEPSEEK_BASE_URL ??
    process.env.OPENAI_BASE_URL ??
    defaultBaseUrl(provider);
  const textModel =
    process.env.LLM_MODEL ??
    process.env.DEEPSEEK_MODEL ??
    (provider === "openai" ? process.env.OPENAI_MODEL : undefined) ??
    defaultTextModel(provider);

  return {
    provider,
    text: {
      apiKey: textApiKey,
      baseUrl: textBaseUrl,
      model: textModel,
      provider,
    },
    vision: resolveVisionEndpoint(provider),
  };
}

export function describeLlmConfig(config: LlmConfig): string {
  return `${config.text.provider} text=${config.text.model} | ${config.vision.provider} vision=${config.vision.model}`;
}
