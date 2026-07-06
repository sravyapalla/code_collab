import { GithubPushRequest, GithubPushResult } from "../types.js";

type GithubContentResponse = {
  sha?: string;
  type?: string;
  html_url?: string;
};

type GithubCommitResponse = {
  content?: {
    path?: string;
    html_url?: string;
  };
  commit?: {
    sha?: string;
  };
};

type GithubErrorResponse = {
  message?: string;
};

async function readGithubJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function createGithubHeaders(token: string): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "code-collab",
    "X-GitHub-Api-Version": "2022-11-28"
  };
}

function encodePath(path: string): string {
  return path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function formatGithubError(action: string, status: number, payload: GithubErrorResponse | null): Error {
  const detail = payload?.message ? ` ${payload.message}` : "";
  return new Error(`Could not ${action} on GitHub (${status}).${detail}`);
}

export class GithubService {
  constructor(private readonly apiBaseUrl = "https://api.github.com") {}

  async pushFile(request: GithubPushRequest): Promise<GithubPushResult> {
    const headers = createGithubHeaders(request.token);
    const fileUrl = `${this.apiBaseUrl}/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.repo)}/contents/${encodePath(request.path)}`;
    const existingSha = await this.getExistingFileSha(fileUrl, request.branch, headers);

    const response = await fetch(fileUrl, {
      method: "PUT",
      headers: {
        ...headers,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: request.message,
        content: Buffer.from(request.content, "utf8").toString("base64"),
        branch: request.branch,
        ...(existingSha ? { sha: existingSha } : {})
      })
    });

    const payload = await readGithubJson<GithubCommitResponse | GithubErrorResponse>(response);

    if (!response.ok) {
      throw formatGithubError("push file", response.status, payload as GithubErrorResponse | null);
    }

    const result = payload as GithubCommitResponse;
    const htmlUrl = result.content?.html_url;
    const commitSha = result.commit?.sha;
    const path = result.content?.path;

    if (!htmlUrl || !commitSha || !path) {
      throw new Error("GitHub push completed but the response was incomplete.");
    }

    return {
      path,
      branch: request.branch,
      htmlUrl,
      commitSha
    };
  }

  private async getExistingFileSha(fileUrl: string, branch: string, headers: HeadersInit): Promise<string | undefined> {
    const response = await fetch(`${fileUrl}?ref=${encodeURIComponent(branch)}`, {
      headers
    });

    if (response.status === 404) {
      return undefined;
    }

    const payload = await readGithubJson<GithubContentResponse | GithubErrorResponse>(response);

    if (!response.ok) {
      throw formatGithubError("check file", response.status, payload as GithubErrorResponse | null);
    }

    const content = payload as GithubContentResponse;

    if (content.type && content.type !== "file") {
      throw new Error("GitHub path must point to a file, not a directory.");
    }

    return content.sha;
  }
}
