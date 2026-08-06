type ErrorLike = {
  status?: unknown;
  code?: unknown;
  error?: {
    code?: unknown;
    message?: unknown;
  };
};

function asErrorLike(error: unknown): ErrorLike {
  return typeof error === "object" && error !== null ? (error as ErrorLike) : {};
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  const errorLike = asErrorLike(error);
  return typeof errorLike.error?.message === "string" ? errorLike.error.message : "";
}

function getErrorStatus(error: unknown): number | undefined {
  const status = asErrorLike(error).status;
  return typeof status === "number" ? status : undefined;
}

function getErrorCode(error: unknown): string {
  const errorLike = asErrorLike(error);
  const code = errorLike.code ?? errorLike.error?.code;
  return typeof code === "string" ? code : "";
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

  return message || "AI request failed.";
}
