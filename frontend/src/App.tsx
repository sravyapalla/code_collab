import { Editor } from "@monaco-editor/react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { io, Socket } from "socket.io-client";

type RoomStatePayload = {
  code: string;
  language: string;
  users: string[];
};

const backendUrl = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8000";

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

export default function App() {
  const [roomInput, setRoomInput] = useState("demo-room");
  const [roomId, setRoomId] = useState("");
  const [userName, setUserName] = useState(createGuestName);
  const [code, setCode] = useState("// Join a room to start coding together.\n");
  const [language, setLanguage] = useState("javascript");
  const [users, setUsers] = useState<string[]>([]);
  const [status, setStatus] = useState("Disconnected");

  const socket: Socket = useMemo(() => {
    return io(backendUrl, {
      autoConnect: false
    });
  }, []);

  useEffect(() => {
    socket.on("connect", () => setStatus("Connected"));
    socket.on("disconnect", () => setStatus("Disconnected"));

    socket.on("room-state", ({ code: nextCode, language: nextLanguage, users: nextUsers }: RoomStatePayload) => {
      setCode(nextCode);
      setLanguage(nextLanguage);
      setUsers(nextUsers);
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

    if (!socket.connected) {
      socket.connect();
    }

    socket.emit("join-room", {
      roomId: nextRoomId,
      userName: nextUserName
    });
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

            <button type="submit">Join Room</button>
          </form>

          <div className="panel">
            <h2>Room</h2>
            <p>{roomId || "Not joined yet"}</p>
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
          <Editor
            height="100%"
            theme="vs-dark"
            language={language}
            value={code}
            onChange={updateCode}
            options={{
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
