import { Editor } from "@monaco-editor/react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { io, Socket } from "socket.io-client";

type RoomStatePayload = {
  code: string;
  language: string;
  users: string[];
};

const backendUrl = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8000";
const defaultCode = "// Join a room to start coding together.\n";
const defaultRoomId = "demo-room";
const defaultLanguage = "javascript";

const storageKeys = {
  language: "code-collab:language",
  roomId: "code-collab:room-id",
  userName: "code-collab:user-name"
};

const languageOptions = [
  "javascript",
  "typescript",
  "python",
  "cpp",
  "java"
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
    if (roomInput.trim()) {
      writeStorage(storageKeys.roomId, roomInput.trim());
    }
  }, [roomInput]);

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

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Code Collab</p>
          <h1>Real-time code rooms</h1>
        </div>
        <span className={socket.connected ? "status online" : "status"}>
          {status}
        </span>
      </section>

      <section className="workspace">
        <aside className="sidebar">
          <form onSubmit={joinRoom} className="join-form">
            <label>
              Your name
              <input
                value={userName}
                onChange={(event) => setUserName(event.target.value)}
                placeholder="Your name"
              />
            </label>

            <label>
              Room ID
              <input
                value={roomInput}
                onChange={(event) => setRoomInput(event.target.value)}
                placeholder="demo-room"
              />
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
      </section>
    </main>
  );
}
