type ErrorLike = {
  status?: unknown;
  code?: unknown;
  statusText?: unknown;
  error?: {
    code?: unknown;
    message?: unknown;
    status?: unknown;
  };
};

function asErrorLike(error: unknown): ErrorLike {
  return typeof error === "object" && error !== null ? (error as ErrorLike) : {};
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return extractNestedProviderMessage(error.message) || error.message;
  }

  if (typeof error === "string") {
    return extractNestedProviderMessage(error) || error;
  }

  const errorLike = asErrorLike(error);
  const message = typeof errorLike.error?.message === "string" ? errorLike.error.message : "";
  return extractNestedProviderMessage(message) || message;
}

function getErrorStatus(error: unknown): number | undefined {
  const errorLike = asErrorLike(error);
  const status = errorLike.status;
  return typeof status === "number" ? status : undefined;
}

function getErrorCode(error: unknown): string {
  const errorLike = asErrorLike(error);
  const code = errorLike.code ?? errorLike.error?.code ?? errorLike.error?.status;
  return typeof code === "string" ? code : "";
}

function extractNestedProviderMessage(message: string): string {
  const jsonStart = message.indexOf("{");

  if (jsonStart === -1) {
    return "";
  }

  try {
    const parsed = JSON.parse(message.slice(jsonStart)) as ErrorLike;
    return typeof parsed.error?.message === "string" ? parsed.error.message : "";
  } catch {
    return "";
  }
}

export function formatAiError(error: unknown): string {
  const message = getErrorMessage(error);
  const normalizedMessage = message.toLowerCase();
  const normalizedCode = getErrorCode(error).toLowerCase();
  const status = getErrorStatus(error);

  if (
    status === 429 ||
    normalizedCode === "insufficient_quota" ||
    normalizedMessage.includes("insufficient_quota") ||
    normalizedMessage.includes("exceeded your current quota") ||
    (normalizedMessage.includes("quota") && normalizedMessage.includes("billing"))
  ) {
    return "AI provider quota is exhausted for the configured API key. Update the backend provider key to one with active billing/quota, then restart or redeploy the backend.";
  }

  if (
    status === 401 ||
    normalizedCode === "invalid_api_key" ||
    normalizedMessage.includes("incorrect api key") ||
    normalizedMessage.includes("invalid api key")
  ) {
    return "AI provider rejected the configured API key. Update the backend provider key, then restart or redeploy the backend.";
  }

  if (
    status === 400 ||
    normalizedCode === "invalid_argument" ||
    normalizedMessage.includes("invalid argument")
  ) {
    return "AI provider rejected the request configuration. Check the configured model names and provider-specific parameters, then restart or redeploy the backend.";
  }

  return message || "AI request failed.";
}
