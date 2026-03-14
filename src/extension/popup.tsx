import { Bookmark, LogOut } from "lucide-react";
import { type SubmitEvent, StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { useTheme } from "../lib/theme.ts";
import "./popup.css";

declare const __SERVER_URL__: string;

declare const chrome: {
  storage: {
    local: {
      get: (
        keys: string[],
        cb: (result: Record<string, unknown>) => void,
      ) => void;
      set: (items: Record<string, unknown>) => void;
      remove: (keys: string[]) => void;
    };
  };
  tabs: { create: (opts: { url: string }) => void };
};

function getStorage(keys: string[]): Promise<Record<string, unknown>> {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function Popup() {
  const [auth, setAuth] = useState<{
    authenticated: boolean;
    username?: string;
  }>();
  const { Icon, cycle } = useTheme();

  useEffect(() => {
    getStorage(["session-token", "username"]).then((result) =>
      setAuth({
        authenticated: !!result["session-token"],
        username: result["username"] as string | undefined,
      }),
    );
  }, []);

  const handleLogout = () => {
    chrome.storage.local.remove(["session-token", "username"]);
    setAuth({ authenticated: false });
  };

  if (!auth) return null;

  return (
    <div className="w-64 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold">Zamak</span>
        <button
          type="button"
          onClick={cycle}
          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted"
        >
          <Icon className="h-4 w-4" />
        </button>
      </div>

      {auth.authenticated ? (
        <LoggedInView username={auth.username} onLogout={handleLogout} />
      ) : (
        <LoginForm
          onSuccess={(username) => setAuth({ authenticated: true, username })}
        />
      )}
    </div>
  );
}

function LoggedInView({
  username,
  onLogout,
}: {
  username?: string;
  onLogout: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Signed in as{" "}
        <span className="font-medium text-foreground">{username}</span>
      </p>
      <button
        type="button"
        onClick={() => chrome.tabs.create({ url: "bookmarks.html" })}
        className="flex w-full items-center gap-2 rounded border px-3 py-2 text-sm hover:bg-muted"
      >
        <Bookmark className="h-4 w-4" />
        Bookmarks
      </button>
      <button
        type="button"
        onClick={onLogout}
        className="flex w-full items-center gap-2 rounded border px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
      >
        <LogOut className="h-4 w-4" />
        Sign out
      </button>
    </div>
  );
}

function LoginForm({ onSuccess }: { onSuccess: (username: string) => void }) {
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(undefined);
    setPending(true);

    const form = new FormData(e.currentTarget);
    const username = form.get("username") as string;
    const password = form.get("password") as string;

    try {
      const res = await fetch(`${__SERVER_URL__}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: { username, password } }),
      });

      if (!res.ok) {
        setError("Invalid username or password");
        setPending(false);
        return;
      }

      const data = (await res.json()) as { json: { token: string } };
      chrome.storage.local.set({
        "session-token": data.json.token,
        username,
      });
      setPending(false);
      onSuccess(username);
    } catch {
      setError("Network error");
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        name="username"
        type="text"
        placeholder="Username"
        autoFocus
        required
        className="w-full rounded border px-3 py-2 text-sm"
      />
      <input
        name="password"
        type="password"
        placeholder="Password"
        required
        className="w-full rounded border px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
      >
        {pending ? "..." : "Sign in"}
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
);
