import { afterEach, describe, expect, it, vi } from "vitest";
import { GithubService } from "../src/services/githubService.js";

describe("GithubService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a new file when the path does not exist", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: {
              path: "src/example.js",
              html_url: "https://github.com/demo/repo/blob/main/src/example.js"
            },
            commit: {
              sha: "abc123"
            }
          }),
          { status: 201 }
        )
      );

    vi.stubGlobal("fetch", fetchMock);

    const result = await new GithubService("https://api.github.test").pushFile({
      token: "token",
      owner: "demo",
      repo: "repo",
      branch: "main",
      path: "src/example.js",
      message: "Add example",
      content: "console.log('hello');"
    });

    expect(result.htmlUrl).toBe("https://github.com/demo/repo/blob/main/src/example.js");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toMatchObject({
      branch: "main",
      message: "Add example"
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).not.toHaveProperty("sha");
  });

  it("tests repository and branch access", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            default_branch: "main",
            full_name: "demo/repo",
            name: "repo",
            owner: {
              login: "demo"
            },
            permissions: {
              push: true
            },
            private: false
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: "main" }), { status: 200 }));

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      new GithubService("https://api.github.test").testConnection({
        token: "token",
        owner: "demo",
        repo: "repo",
        branch: "main"
      })
    ).resolves.toMatchObject({
      branch: "main",
      canPush: true,
      fullName: "demo/repo"
    });
  });

  it("updates an existing file with its sha", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ type: "file", sha: "file-sha" }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: {
              path: "app.js",
              html_url: "https://github.com/demo/repo/blob/main/app.js"
            },
            commit: {
              sha: "commit-sha"
            }
          }),
          { status: 200 }
        )
      );

    vi.stubGlobal("fetch", fetchMock);

    await new GithubService("https://api.github.test").pushFile({
      token: "token",
      owner: "demo",
      repo: "repo",
      branch: "main",
      path: "app.js",
      message: "Update app",
      content: "console.log('updated');"
    });

    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toMatchObject({
      sha: "file-sha"
    });
  });

  it("explains fine-grained token repository permission failures", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Resource not accessible by personal access token" }), { status: 403 })
    );

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      new GithubService("https://api.github.test").pushFile({
        token: "token",
        owner: "demo",
        repo: "repo",
        branch: "main",
        path: "app.js",
        message: "Update app",
        content: "console.log('updated');"
      })
    ).rejects.toThrow("Repository contents: Read and write");
  });
});
