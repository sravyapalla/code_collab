import { Editor, type OnMount } from "@monaco-editor/react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { io, Socket } from "socket.io-client";

type RoomStatePayload = {
  code: string;
  language: string;
  users: string[];
};

type AiMode = "ask" | "explain" | "debug" | "review" | "tests" | "refactor";

type AiCitation = {
  chunkId: string;
  language: string;
  startLine: number;
  endLine: number;
  preview: string;
};

type AiMessage = {
  id: string;
  roomId: string;
  role: "user" | "assistant";
  mode: AiMode;
  content: string;
  citations: AiCitation[];
  userName?: string;
  createdAt: string;
};

type SseEvent = {
  event: string;
  data: unknown;
};

type GithubPushResult = {
  path: string;
  branch: string;
  htmlUrl: string;
  commitSha: string;
};

function getBackendUrl(): string {
  const configuredUrl = import.meta.env.VITE_BACKEND_URL;

  if (configuredUrl) {
    return configuredUrl;
  }

  if (window.location.hostname === "localhost" && window.location.port === "5173") {
    return "http://localhost:8000";
  }

  return import.meta.env.PROD ? window.location.origin : "http://localhost:8000";
}

const backendUrl = getBackendUrl();
const defaultCode = "// Join a room to start coding together.\n";
const defaultRoomId = "demo-room";
const defaultLanguage = "javascript";

const storageKeys = {
  githubBranch: "code-collab:github-branch",
  githubOwner: "code-collab:github-owner",
  githubPath: "code-collab:github-path",
  githubRepo: "code-collab:github-repo",
  language: "code-collab:language",
  roomId: "code-collab:room-id",
  userName: "code-collab:user-name"
};

const languageOptions = ["javascript", "typescript", "python", "cpp", "java"];
const fileExtensions: Record<string, string> = {
  cpp: "cpp",
  java: "java",
  javascript: "js",
  python: "py",
  typescript: "ts"
};

const aiModes: Array<{ value: AiMode; label: string }> = [
  { value: "ask", label: "Ask" },
  { value: "explain", label: "Explain" },
  { value: "debug", label: "Debug" },
  { value: "review", label: "Review" },
  { value: "tests", label: "Tests" },
  { value: "refactor", label: "Refactor" }
];

function createGuestName(): string {
  return `Guest-${Math.floor(Math.random() * 900 + 100)}`;
}

function createRoomId(): string {
  return `room-${Math.random().toString(36).slice(2, 8)}`;
}

function readStorage(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Local storage can be unavailable in restrictive browser contexts.
  }
}

function getInitialRoomId(): string {
  const sharedRoomId = new URLSearchParams(window.location.search).get("room")?.trim();
  return sharedRoomId || readStorage(storageKeys.roomId, defaultRoomId);
}

function createRoomLink(roomId: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set("room", roomId);
  return url.toString();
}

function updateRoomUrl(roomId: string | null): void {
  const url = new URL(window.location.href);

  if (roomId) {
    url.searchParams.set("room", roomId);
  } else {
    url.searchParams.delete("room");
  }

  window.history.replaceState({}, "", url);
}

function extractFirstCodeBlock(content: string): string {
  const match = content.match(/```[\w-]*\n([\s\S]*?)```/);
  return (match?.[1] ?? content).trim();
}

function formatAiMode(mode: AiMode): string {
  return aiModes.find((option) => option.value === mode)?.label ?? "Ask";
}

function getDefaultGithubPath(language: string): string {
  return `code-collab-suggestion.${fileExtensions[language] ?? "txt"}`;
}

function parseSseBuffer(buffer: string, onEvent: (event: SseEvent) => void): string {
  const normalizedBuffer = buffer.replace(/\r\n/g, "\n");
  const parts = normalizedBuffer.split("\n\n");
  const remainder = parts.pop() ?? "";

  for (const part of parts) {
    const lines = part.split("\n");
    let eventName = "message";
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith("event:")) {
        eventName = line.slice("event:".length).trim();
      }

      if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trim());
      }
    }

    const rawData = dataLines.join("\n");

    try {
      onEvent({
        event: eventName,
        data: JSON.parse(rawData)
      });
    } catch {
      onEvent({
        event: eventName,
        data: rawData
      });
    }
  }

  return remainder;
}

export default function App() {
  const [roomInput, setRoomInput] = useState(getInitialRoomId);
  const [roomId, setRoomId] = useState("");
  const [userName, setUserName] = useState(() => readStorage(storageKeys.userName, createGuestName()));
  const [code, setCode] = useState(defaultCode);
  const [language, setLanguage] = useState(() => readStorage(storageKeys.language, defaultLanguage));
  const [users, setUsers] = useState<string[]>([]);
  const [status, setStatus] = useState("Disconnected");
  const [copiedRoomId, setCopiedRoomId] = useState(false);
  const [copiedRoomLink, setCopiedRoomLink] = useState(false);
  const [aiMode, setAiMode] = useState<AiMode>("ask");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiStatus, setAiStatus] = useState("Join a room to use AI");
  const [isAiStreaming, setIsAiStreaming] = useState(false);
  const [selectedCode, setSelectedCode] = useState("");
  const [previewCode, setPreviewCode] = useState("");
  const [githubOwner, setGithubOwner] = useState(() => readStorage(storageKeys.githubOwner, ""));
  const [githubRepo, setGithubRepo] = useState(() => readStorage(storageKeys.githubRepo, ""));
  const [githubBranch, setGithubBranch] = useState(() => readStorage(storageKeys.githubBranch, "main"));
  const [githubPath, setGithubPath] = useState(() => readStorage(storageKeys.githubPath, getDefaultGithubPath(defaultLanguage)));
  const [githubToken, setGithubToken] = useState("");
  const [githubMessage, setGithubMessage] = useState("Update code from Code Collab");
  const [githubStatus, setGithubStatus] = useState("");
  const [githubResult, setGithubResult] = useState<GithubPushResult | null>(null);
  const [isGithubPushing, setIsGithubPushing] = useState(false);

  const socket: Socket = useMemo(() => {
    return io(backendUrl, {
      autoConnect: false
    });
  }, []);

  useEffect(() => {
    socket.on("connect", () => setStatus("Connected"));
    socket.on("disconnect", () => setStatus("Disconnected"));
    socket.on("connect_error", () => setStatus("Connection failed"));

    socket.on("room-state", ({ code: nextCode, language: nextLanguage, users: nextUsers }: RoomStatePayload) => {
      setCode(nextCode);
      setLanguage(nextLanguage);
      setUsers(nextUsers);
      setStatus("Room joined");
    });

    socket.on("code-change", (nextCode: string) => {
      setCode(nextCode);
    });

    socket.on("language-change", (nextLanguage: string) => {
      setLanguage(nextLanguage);
    });

    socket.on("users-changed", (nextUsers: string[]) => {
      setUsers(nextUsers);
    });

    socket.on("error-message", (message: string) => {
      setStatus(message);
    });

    return () => {
      socket.disconnect();
      socket.removeAllListeners();
    };
  }, [socket]);

  useEffect(() => {
    writeStorage(storageKeys.userName, userName);
  }, [userName]);

  useEffect(() => {
    writeStorage(storageKeys.language, language);
  }, [language]);

  useEffect(() => {
    writeStorage(storageKeys.githubOwner, githubOwner);
  }, [githubOwner]);

  useEffect(() => {
    writeStorage(storageKeys.githubRepo, githubRepo);
  }, [githubRepo]);

  useEffect(() => {
    writeStorage(storageKeys.githubBranch, githubBranch);
  }, [githubBranch]);

  useEffect(() => {
    writeStorage(storageKeys.githubPath, githubPath);
  }, [githubPath]);

  useEffect(() => {
    if (roomInput.trim()) {
      writeStorage(storageKeys.roomId, roomInput.trim());
    }
  }, [roomInput]);

  useEffect(() => {
    if (!roomId) {
      setAiMessages([]);
      setAiStatus("Join a room to use AI");
      return;
    }

    const abortController = new AbortController();

    fetch(`${backendUrl}/api/rooms/${encodeURIComponent(roomId)}/ai/messages`, {
      signal: abortController.signal
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Could not load AI history.");
        }

        return response.json() as Promise<{ messages: AiMessage[] }>;
      })
      .then(({ messages }) => {
        setAiMessages(messages);
        setAiStatus(messages.length > 0 ? "AI history loaded" : "Ask about this room");
      })
      .catch((error: unknown) => {
        if (!abortController.signal.aborted) {
          setAiStatus(error instanceof Error ? error.message : "Could not load AI history.");
        }
      });

    return () => abortController.abort();
  }, [roomId]);

  function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextRoomId = roomInput.trim();
    const nextUserName = userName.trim() || createGuestName();

    if (!nextRoomId) {
      setStatus("Enter a room ID first.");
      return;
    }

    setRoomId(nextRoomId);
    setUserName(nextUserName);
    setStatus(socket.connected ? "Joining room" : "Connecting");
    setCopiedRoomId(false);
    setCopiedRoomLink(false);
    setPreviewCode("");
    writeStorage(storageKeys.roomId, nextRoomId);
    updateRoomUrl(nextRoomId);

    if (!socket.connected) {
      socket.connect();
    }

    socket.emit("join-room", {
      roomId: nextRoomId,
      userName: nextUserName
    });
  }

  function leaveRoom() {
    socket.emit("leave-room");
    socket.disconnect();
    setRoomId("");
    setUsers([]);
    setStatus("Disconnected");
    setCode(defaultCode);
    setAiMessages([]);
    setAiPrompt("");
    setPreviewCode("");
    setCopiedRoomId(false);
    setCopiedRoomLink(false);
    updateRoomUrl(null);
  }

  function useRandomRoom() {
    const nextRoomId = createRoomId();
    setRoomInput(nextRoomId);
    setCopiedRoomId(false);
    setCopiedRoomLink(false);
  }

  async function copyRoomId() {
    if (!roomId) {
      return;
    }

    try {
      await navigator.clipboard.writeText(roomId);
      setCopiedRoomId(true);
      window.setTimeout(() => setCopiedRoomId(false), 1500);
    } catch {
      setStatus("Could not copy room ID.");
    }
  }

  async function copyRoomLink() {
    if (!roomId) {
      return;
    }

    try {
      await navigator.clipboard.writeText(createRoomLink(roomId));
      setCopiedRoomLink(true);
      window.setTimeout(() => setCopiedRoomLink(false), 1500);
    } catch {
      setStatus("Could not copy room link.");
    }
  }

  function updateCode(nextCode: string | undefined) {
    const safeCode = nextCode ?? "";
    setCode(safeCode);

    if (roomId) {
      socket.emit("code-change", {
        roomId,
        code: safeCode
      });
    }
  }

  function updateLanguage(nextLanguage: string) {
    setLanguage(nextLanguage);
    writeStorage(storageKeys.language, nextLanguage);

    if (roomId) {
      socket.emit("language-change", {
        roomId,
        language: nextLanguage
      });
    }
  }

  const handleEditorMount: OnMount = (editor) => {
    const refreshSelection = () => {
      const selection = editor.getSelection();
      const model = editor.getModel();

      if (!selection || !model) {
        setSelectedCode("");
        return;
      }

      setSelectedCode(model.getValueInRange(selection).slice(0, 8000));
    };

    refreshSelection();
    editor.onDidChangeCursorSelection(refreshSelection);
  };

  async function sendAiMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanPrompt = aiPrompt.trim();

    if (!roomId || !cleanPrompt || isAiStreaming) {
      return;
    }

    setIsAiStreaming(true);
    setAiStatus("AI is thinking");
    setAiPrompt("");

    const activeAssistantId = { current: "" };

    function handleSseEvent(sseEvent: SseEvent) {
      if (sseEvent.event === "user-message" && typeof sseEvent.data === "object" && sseEvent.data) {
        setAiMessages((messages) => [...messages, sseEvent.data as AiMessage]);
      }

      if (sseEvent.event === "assistant-start" && typeof sseEvent.data === "object" && sseEvent.data) {
        const message = sseEvent.data as AiMessage;
        activeAssistantId.current = message.id;
        setAiMessages((messages) => [...messages, message]);
      }

      if (
        sseEvent.event === "token" &&
        typeof sseEvent.data === "object" &&
        sseEvent.data &&
        "delta" in sseEvent.data
      ) {
        const delta = String((sseEvent.data as { delta: string }).delta);
        setAiMessages((messages) =>
          messages.map((message) =>
            message.id === activeAssistantId.current
              ? {
                  ...message,
                  content: `${message.content}${delta}`
                }
              : message
          )
        );
      }

      if (sseEvent.event === "done" && typeof sseEvent.data === "object" && sseEvent.data) {
        const message = sseEvent.data as AiMessage;
        setAiMessages((messages) => messages.map((item) => (item.id === message.id ? message : item)));
        setAiStatus("AI response ready");
      }

      if (sseEvent.event === "error" && typeof sseEvent.data === "object" && sseEvent.data && "message" in sseEvent.data) {
        setAiStatus(String((sseEvent.data as { message: string }).message));
      }
    }

    try {
      const response = await fetch(`${backendUrl}/api/rooms/${encodeURIComponent(roomId)}/ai/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: cleanPrompt,
          mode: aiMode,
          selection: selectedCode,
          userName
        })
      });

      if (!response.ok || !response.body) {
        const errorPayload = await response.json().catch(() => ({ message: "AI request failed." }));
        throw new Error(String(errorPayload.message ?? "AI request failed."));
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let isDone = false;

      while (!isDone) {
        const readResult = await reader.read();
        isDone = readResult.done;
        buffer += decoder.decode(readResult.value ?? new Uint8Array(), { stream: !isDone });
        buffer = parseSseBuffer(buffer, handleSseEvent);
      }

      if (buffer.trim()) {
        parseSseBuffer(`${buffer}\n\n`, handleSseEvent);
      }
    } catch (error) {
      setAiStatus(error instanceof Error ? error.message : "AI request failed.");
      setAiPrompt(cleanPrompt);
    } finally {
      setIsAiStreaming(false);
    }
  }

  function previewAssistantCode(message: AiMessage) {
    setPreviewCode(extractFirstCodeBlock(message.content));
    setGithubStatus("");
    setGithubResult(null);

    if (!githubPath.trim()) {
      setGithubPath(getDefaultGithubPath(language));
    }
  }

  function insertPreviewCode() {
    if (!previewCode) {
      return;
    }

    updateCode(previewCode);
    setPreviewCode("");
    setAiStatus("Inserted AI suggestion into the editor");
  }

  function appendPreviewCode() {
    if (!previewCode) {
      return;
    }

    const separator = code && !code.endsWith("\n") ? "\n\n" : "";
    updateCode(`${code}${separator}${previewCode}`);
    setPreviewCode("");
    setAiStatus("Appended AI suggestion to the editor");
  }

  async function pushPreviewToGithub(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!previewCode || isGithubPushing) {
      return;
    }

    setIsGithubPushing(true);
    setGithubStatus("Pushing to GitHub");
    setGithubResult(null);

    try {
      const response = await fetch(`${backendUrl}/api/github/push`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          token: githubToken,
          owner: githubOwner,
          repo: githubRepo,
          branch: githubBranch,
          path: githubPath,
          message: githubMessage,
          content: previewCode
        })
      });

      const payload = await response.json().catch(() => ({ message: "Could not push to GitHub." }));

      if (!response.ok) {
        throw new Error(String(payload.message ?? "Could not push to GitHub."));
      }

      const result = payload as GithubPushResult;
      setGithubResult(result);
      setGithubStatus(`Pushed ${result.path} to ${result.branch}`);
    } catch (error) {
      setGithubStatus(error instanceof Error ? error.message : "Could not push to GitHub.");
    } finally {
      setIsGithubPushing(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Code Collab</p>
          <h1>AI-assisted code rooms</h1>
        </div>
        <span className={socket.connected ? "status online" : "status"}>{status}</span>
      </section>

      <section className="workspace">
        <aside className="sidebar">
          <form onSubmit={joinRoom} className="join-form">
            <label>
              Your name
              <input value={userName} onChange={(event) => setUserName(event.target.value)} placeholder="Your name" />
            </label>

            <label>
              Room ID
              <input value={roomInput} onChange={(event) => setRoomInput(event.target.value)} placeholder="demo-room" />
            </label>

            <div className="button-row">
              <button type="submit">{roomId ? "Switch Room" : "Join Room"}</button>
              <button type="button" className="secondary-button" onClick={useRandomRoom}>
                New ID
              </button>
            </div>
          </form>

          <div className="panel">
            <h2>Room</h2>
            <div className="room-row">
              <p>{roomId || "Not joined yet"}</p>
              {roomId ? (
                <div className="room-actions">
                  <button type="button" className="small-button" onClick={copyRoomId}>
                    {copiedRoomId ? "Copied" : "Copy ID"}
                  </button>
                  <button type="button" className="small-button" onClick={copyRoomLink}>
                    {copiedRoomLink ? "Copied" : "Copy Link"}
                  </button>
                </div>
              ) : null}
            </div>
            {roomId ? (
              <button type="button" className="secondary-button full-button" onClick={leaveRoom}>
                Leave Room
              </button>
            ) : null}
          </div>

          <div className="panel">
            <h2>Language</h2>
            <select value={language} onChange={(event) => updateLanguage(event.target.value)}>
              {languageOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="panel">
            <h2>Users</h2>
            {users.length > 0 ? (
              <ul className="user-list">
                {users.map((user, index) => (
                  <li key={`${user}-${index}`}>{user}</li>
                ))}
              </ul>
            ) : (
              <p>No users connected</p>
            )}
          </div>
        </aside>

        <section className="editor-wrap">
          {!roomId ? (
            <div className="empty-state">
              <h2>Join a room to start editing</h2>
              <p>Use the demo room or generate a new room ID to collaborate.</p>
            </div>
          ) : null}
          <Editor
            height="100%"
            theme="vs-dark"
            language={language}
            value={code}
            onMount={handleEditorMount}
            onChange={updateCode}
            options={{
              readOnly: !roomId,
              minimap: { enabled: false },
              fontSize: 15,
              wordWrap: "on",
              scrollBeyondLastLine: false,
              automaticLayout: true
            }}
          />
        </section>

        <aside className="ai-panel">
          <div className="ai-header">
            <div>
              <p className="eyebrow">AI Workspace</p>
              <h2>Room assistant</h2>
            </div>
            <span className="ai-state">{isAiStreaming ? "Streaming" : aiStatus}</span>
          </div>

          <div className="mode-tabs" role="tablist" aria-label="AI mode">
            {aiModes.map((mode) => (
              <button
                key={mode.value}
                type="button"
                className={aiMode === mode.value ? "mode-tab active" : "mode-tab"}
                onClick={() => setAiMode(mode.value)}
              >
                {mode.label}
              </button>
            ))}
          </div>

          <form className="ai-composer" onSubmit={sendAiMessage}>
            <label>
              Prompt
              <textarea
                value={aiPrompt}
                onChange={(event) => setAiPrompt(event.target.value)}
                placeholder={roomId ? "Ask about the current room code" : "Join a room first"}
                disabled={!roomId || isAiStreaming}
              />
            </label>
            <div className="selection-note">
              {selectedCode ? `${selectedCode.length.toLocaleString()} selected characters will be included` : "No editor selection"}
            </div>
            <button type="submit" disabled={!roomId || !aiPrompt.trim() || isAiStreaming}>
              {isAiStreaming ? "Streaming" : `Run ${formatAiMode(aiMode)}`}
            </button>
          </form>

          <div className="ai-messages">
            {aiMessages.length === 0 ? (
              <div className="ai-empty">
                <h3>No AI messages yet</h3>
                <p>Ask for an explanation, review, debugging pass, tests, or a refactor once the room is joined.</p>
              </div>
            ) : (
              aiMessages.map((message) => (
                <article key={message.id} className={`ai-message ${message.role}`}>
                  <div className="ai-message-meta">
                    <span>{message.role === "user" ? message.userName || "You" : "Code Collab AI"}</span>
                    <span>{formatAiMode(message.mode)}</span>
                  </div>
                  <pre>{message.content || "..."}</pre>
                  {message.citations.length > 0 ? (
                    <div className="citations">
                      {message.citations.map((citation) => (
                        <span key={citation.chunkId}>
                          {citation.language} {citation.startLine}-{citation.endLine}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {message.role === "assistant" && message.content ? (
                    <div className="ai-actions">
                      <button type="button" className="small-button" onClick={() => previewAssistantCode(message)}>
                        Preview
                      </button>
                    </div>
                  ) : null}
                </article>
              ))
            )}
          </div>

          {previewCode ? (
            <div className="preview-panel">
              <div className="preview-header">
                <h2>Suggestion Preview</h2>
                <button type="button" className="small-button" onClick={() => setPreviewCode("")}>
                  Close
                </button>
              </div>
              <form className="github-form" onSubmit={pushPreviewToGithub}>
                <h2>GitHub Push</h2>
                <div className="github-grid">
                  <label>
                    Owner
                    <input value={githubOwner} onChange={(event) => setGithubOwner(event.target.value)} placeholder="owner" />
                  </label>
                  <label>
                    Repository
                    <input value={githubRepo} onChange={(event) => setGithubRepo(event.target.value)} placeholder="repo" />
                  </label>
                  <label>
                    Branch
                    <input value={githubBranch} onChange={(event) => setGithubBranch(event.target.value)} placeholder="main" />
                  </label>
                  <label>
                    File path
                    <input value={githubPath} onChange={(event) => setGithubPath(event.target.value)} placeholder={getDefaultGithubPath(language)} />
                  </label>
                </div>
                <label>
                  Token
                  <input
                    type="password"
                    value={githubToken}
                    onChange={(event) => setGithubToken(event.target.value)}
                    placeholder="github_pat_..."
                    autoComplete="off"
                  />
                </label>
                <label>
                  Commit message
                  <input value={githubMessage} onChange={(event) => setGithubMessage(event.target.value)} />
                </label>
                <button
                  type="submit"
                  disabled={
                    isGithubPushing ||
                    !githubOwner.trim() ||
                    !githubRepo.trim() ||
                    !githubBranch.trim() ||
                    !githubPath.trim() ||
                    !githubToken.trim()
                  }
                >
                  {isGithubPushing ? "Pushing" : "Push to GitHub"}
                </button>
                {githubStatus ? <p className="github-status">{githubStatus}</p> : null}
                {githubResult ? (
                  <a className="github-link" href={githubResult.htmlUrl} target="_blank" rel="noreferrer">
                    Open on GitHub
                  </a>
                ) : null}
              </form>
              <pre>{previewCode}</pre>
              <div className="preview-actions">
                <button type="button" onClick={insertPreviewCode}>
                  Insert into editor
                </button>
                <button type="button" className="secondary-button" onClick={appendPreviewCode}>
                  Append to editor
                </button>
              </div>
            </div>
          ) : null}
        </aside>
      </section>
    </main>
  );
}
