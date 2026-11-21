"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useSpeech } from "@/lib/useSpeech";
import type { ChatTurn, JarvisError, JarvisResponse } from "@/lib/types";

type Status = "ONLINE" | "LISTENING" | "THINKING" | "SPEAKING" | "ERROR";
type LogEntry = { id: number; label: string };

const MEMORY_KEY = "jarvis.memories.v1";
const MAX_MEMORIES = 50;

/** localStorage can throw (private mode, blocked storage), so wrap every access. */
function loadMemories(): string[] {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((m): m is string => typeof m === "string") : [];
  } catch {
    return [];
  }
}
function saveMemories(list: string[]) {
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable: memory lasts for this tab only */
  }
}

export default function JarvisPage() {
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [memories, setMemories] = useState<string[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [thinking, setThinking] = useState(false);
  const [lastToolsCount, setLastToolsCount] = useState(0);
  const [caption, setCaption] = useState("Press the core or type to talk.");
  const [apiError, setApiError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const logId = useRef(0);
  const busy = useRef(false);

  useEffect(() => setMemories(loadMemories()), []);

  const pushLog = useCallback((label: string) => {
    setLogs((prev) => [{ id: ++logId.current, label }, ...prev].slice(0, 5));
  }, []);

  // Keep latest state in a ref so the speech callback never sees stale data.
  const stateRef = useRef({ history, memories });
  stateRef.current = { history, memories };

  const ask = useCallback(
    async (text: string) => {
      if (busy.current || !text.trim()) return;
      busy.current = true;
      setThinking(true);
      setApiError(null);
      setCaption(`“${text}”`);
      pushLog(`> ${text.slice(0, 28)}`);

      try {
        const res = await fetch("/api/jarvis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, ...stateRef.current }),
        });
        const data = (await res.json()) as JarvisResponse | JarvisError;
        if (!res.ok || "error" in data) {
          throw new Error("error" in data ? data.error : `HTTP ${res.status}`);
        }

        setHistory((h) => [...h, { role: "user", text }, { role: "assistant", text: data.reply }]);
        setLastToolsCount(data.toolsUsed.length);
        data.toolsUsed.forEach((t) => pushLog(`tool: ${t}`));

        if (data.newMemories.length) {
          setMemories((prev) => {
            const next = [...new Set([...prev, ...data.newMemories])].slice(-MAX_MEMORIES);
            saveMemories(next);
            return next;
          });
          pushLog(`memory +${data.newMemories.length}`);
        }

        setCaption(data.reply);
        speakRef.current(data.reply);
      } catch (err) {
        const msg = (err as Error).message || "Something went wrong.";
        setApiError(msg);
        setCaption(msg);
        pushLog("error");
      } finally {
        busy.current = false;
        setThinking(false);
      }
    },
    [pushLog],
  );

  const speech = useSpeech(ask, "en-US");
  const speakRef = useRef(speech.speak);
  speakRef.current = speech.speak;

  const status: Status = apiError || speech.error
    ? "ERROR"
    : speech.listening ? "LISTENING" : thinking ? "THINKING" : speech.speaking ? "SPEAKING" : "ONLINE";
  const active = status !== "ONLINE" && status !== "ERROR";

  const onCoreClick = () => (speech.listening ? speech.stopListening() : speech.listen());

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = input;
    setInput("");
    void ask(text);
  };

  const forget = () => {
    setMemories([]);
    saveMemories([]);
    pushLog("memory wiped");
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-4 px-4 py-4">
      {/* Header */}
      <header className="flex items-center justify-between">
        <h1 className="glow text-2xl font-bold tracking-widest text-hud">☰ Assistant</h1>
        <StatusBadge status={status} />
      </header>

      <section className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-[180px_1fr_180px]">
        {/* Left: system panels */}
        <div className="grid grid-cols-3 gap-2 self-start md:grid-cols-1 md:gap-4">
          <Panel icon="🎙" title="Voice" active={speech.listening || speech.speaking} />
          <Panel icon="⫶" title="Memory" active={thinking} badge={memories.length} />
          <Panel icon="🌐" title="Tools" active={thinking || lastToolsCount > 0} badge={lastToolsCount} />
        </div>

        {/* Center: arc reactor core */}
        <div className="flex flex-col items-center justify-center">
          <button
            type="button"
            onClick={onCoreClick}
            disabled={!speech.supported}
            aria-label={speech.listening ? "Stop listening" : "Start listening"}
            className="relative aspect-square w-full max-w-[360px] rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-hud disabled:cursor-not-allowed"
          >
            <Core active={active} />
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <span className="glow text-2xl font-bold tracking-[0.15em] text-white sm:text-4xl">J.A.R.V.I.S</span>
              <Waveform active={active} />
            </span>
          </button>
          {!speech.supported && (
            <p className="mt-2 text-center text-xs text-amber-300">
              Voice input not supported in this browser. Use Chrome/Edge, or type below.
            </p>
          )}
        </div>

        {/* Right: activity log */}
        <div className="glow-box hidden flex-col gap-4 border border-hud-dim/80 p-3 md:flex">
          {Array.from({ length: 5 }).map((_, i) => {
            const entry = logs[i];
            return (
              <div key={entry?.id ?? `empty-${i}`} className="flex items-center gap-2 text-[10px]">
                <span className="size-1 rounded-full bg-hud" />
                <div className="flex-1">
                  <div className="h-1.5 rounded-full bg-gradient-to-r from-hud to-hud/20" style={{ width: entry ? "100%" : "60%" }} />
                  <p className="mt-1 truncate text-hud/80">{entry?.label ?? "standby"}</p>
                </div>
                <span className={`size-2 rounded-full ${entry ? "bg-ok" : "bg-hud-dim"}`} />
              </div>
            );
          })}
        </div>
      </section>

      {/* Caption (like the subtitle in the video) */}
      <p aria-live="polite" className="glow min-h-12 text-center text-lg text-white">
        {speech.interim || caption}
      </p>

      {/* Keyboard fallback */}
      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a command, e.g. What's the weather in Manila?"
          maxLength={2000}
          className="glow-box min-w-0 flex-1 rounded border border-hud-dim bg-transparent px-3 py-2 text-sm outline-none placeholder:text-hud/40 focus:border-hud"
        />
        <button
          type="submit"
          disabled={thinking || !input.trim()}
          className="rounded border border-hud px-4 text-sm text-hud transition hover:bg-hud/10 disabled:opacity-40"
        >
          Send
        </button>
      </form>

      <footer className="flex items-center justify-between text-[11px] text-hud/60">
        <span>{memories.length} memories stored on this device</span>
        <button type="button" onClick={forget} className="underline hover:text-hud">
          Forget all
        </button>
      </footer>
    </main>
  );
}

/* ---------- HUD building blocks ---------- */

function StatusBadge({ status }: { status: Status }) {
  const color = status === "ERROR" ? "text-red-400 border-red-400" : "text-ok border-ok";
  return (
    <span className={`flex items-center gap-2 rounded-full border px-4 py-1 text-sm font-bold tracking-widest ${color}`}>
      <span className={`size-2 rounded-full bg-current ${status !== "ONLINE" ? "animate-pulse" : ""}`} />
      {status}
    </span>
  );
}

const BAR_HEIGHTS = [70, 45, 20, 40, 95, 90];

function Panel({ icon, title, active, badge }: { icon: string; title: string; active: boolean; badge?: number }) {
  return (
    <div className="glow-box border border-hud-dim/80 p-2 md:p-3">
      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-xs font-bold md:text-base">
          <span aria-hidden className="mr-1">{icon}</span>
          {title}
        </span>
        {badge !== undefined && <span className="text-[10px] text-hud">{badge}</span>}
      </div>
      <div className="mt-2 flex h-10 items-end gap-1 md:h-14">
        {BAR_HEIGHTS.map((h, i) => (
          <span
            key={i}
            className={`flex-1 rounded-sm bg-gradient-to-t from-hud/40 to-hud ${active ? "eq-bar" : ""}`}
            style={{ height: `${h}%`, animationDelay: `${i * 0.12}s` }}
          />
        ))}
      </div>
    </div>
  );
}

function Core({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 200 200" className="absolute inset-0 size-full" aria-hidden>
      <defs>
        <radialGradient id="coreFill">
          <stop offset="0%" stopColor="#4fd1ff" stopOpacity={active ? 0.35 : 0.15} />
          <stop offset="100%" stopColor="#4fd1ff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="70" fill="url(#coreFill)" />
      <g className={`spin-slow ${active ? "spin-fast" : ""}`}>
        <circle cx="100" cy="100" r="94" fill="none" stroke="#4fd1ff" strokeWidth="3" strokeDasharray="40 18" opacity="0.8" />
      </g>
      <g className="spin-rev">
        <circle cx="100" cy="100" r="82" fill="none" stroke="#4fd1ff" strokeWidth="1.5" strokeDasharray="6 6" opacity="0.6" />
      </g>
      <g className={`spin-slow ${active ? "spin-fast" : ""}`}>
        <circle cx="100" cy="100" r="70" fill="none" stroke="#4fd1ff" strokeWidth="2" strokeDasharray="90 30 10 30" opacity="0.9" />
      </g>
      <circle cx="100" cy="100" r="58" fill="none" stroke="#4fd1ff" strokeWidth="0.6" opacity="0.4" />
    </svg>
  );
}

function Waveform({ active }: { active: boolean }) {
  return (
    <span className="flex h-6 items-center gap-[3px]">
      {Array.from({ length: 21 }).map((_, i) => (
        <span
          key={i}
          className={`w-[3px] rounded-full bg-hud ${active ? "eq-bar" : ""}`}
          style={{ height: `${30 + ((i * 37) % 70)}%`, animationDelay: `${(i % 7) * 0.1}s`, opacity: active ? 1 : 0.5 }}
        />
      ))}
    </span>
  );
}
