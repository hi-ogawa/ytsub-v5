import { useEffect, useState } from "react";

// Temporary, to see on a phone whether a captured link reaches the open app.
// A "load" is a new document. A "launch" is a URL the launchQueue consumer
// received. The log lives in localStorage so it survives reloads and new
// windows, and each load notes how many loads its window's sessionStorage
// has seen, which tells a reload of the same window from a new one.

interface LaunchEvent {
  type: "load" | "launch";
  at: string;
  url: string;
  windowLoads?: number;
  standalone?: boolean;
}

const LOG_KEY = "launch-diagnostics";
const WINDOW_LOADS_KEY = "launch-diagnostics-window-loads";
const CHANGE_EVENT = "launch-diagnostics-change";

function readLog(): LaunchEvent[] {
  return JSON.parse(localStorage.getItem(LOG_KEY) ?? "[]");
}

function appendLog(event: Omit<LaunchEvent, "at">) {
  const log = [...readLog(), { ...event, at: new Date().toISOString() }];
  localStorage.setItem(LOG_KEY, JSON.stringify(log.slice(-20)));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function recordPageLoad() {
  const windowLoads = Number(sessionStorage.getItem(WINDOW_LOADS_KEY) ?? 0) + 1;
  sessionStorage.setItem(WINDOW_LOADS_KEY, String(windowLoads));
  appendLog({
    type: "load",
    url: location.pathname + location.search,
    windowLoads,
    standalone: matchMedia("(display-mode: standalone)").matches,
  });
}

export function recordLaunch(targetURL?: string) {
  const url = targetURL ? new URL(targetURL) : undefined;
  appendLog({
    type: "launch",
    url: url ? url.pathname + url.search : "(no targetURL)",
  });
}

export function LaunchDiagnostics() {
  const [log, setLog] = useState(readLog);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const update = () => setLog(readLog());
    window.addEventListener(CHANGE_EVENT, update);
    return () => window.removeEventListener(CHANGE_EVENT, update);
  }, []);

  if (!open) {
    return (
      <button
        className="fixed bottom-1 left-1 z-50 rounded bg-black/70 px-2 py-1 text-xs text-white"
        onClick={() => setOpen(true)}
      >
        diag
      </button>
    );
  }

  return (
    <div className="fixed bottom-1 left-1 z-50 max-w-[95vw] rounded bg-black/80 p-2 font-mono text-[11px] leading-tight text-white">
      <div className="mb-1 flex gap-2">
        <span>launchQueue: {"launchQueue" in window ? "yes" : "no"}</span>
        <button
          className="ml-auto underline"
          onClick={() => {
            localStorage.removeItem(LOG_KEY);
            setLog([]);
          }}
        >
          clear
        </button>
        <button className="underline" onClick={() => setOpen(false)}>
          hide
        </button>
      </div>
      {log
        .slice(-8)
        .reverse()
        .map((event, i) => (
          <div key={i} className="truncate">
            {new Date(event.at).toTimeString().slice(0, 8)} {event.type}
            {event.type === "load" &&
              ` #${event.windowLoads}${event.standalone ? " app" : " tab"}`}{" "}
            {event.url}
          </div>
        ))}
    </div>
  );
}
