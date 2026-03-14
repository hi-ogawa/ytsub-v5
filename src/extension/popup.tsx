import { Bookmark, LogOut } from "lucide-react";
import { type SubmitEvent, StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { useTheme } from "../lib/theme.ts";
import "./popup.css";

declare const chrome: {
  runtime: {
    sendMessage: (
      msg: Record<string, unknown>,
      cb: (response: Record<string, unknown>) => void,
    ) => void;
  };
  tabs: { create: (opts: { url: string }) => void };
};

function sendMessage(
  msg: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}

function Popup() {
  const [auth, setAuth] = useState<{
    authenticated: boolean;
    username?: string;
  }>();
  const { Icon, cycle } = useTheme();

  useEffect(() => {
    sendMessage({ type: "get-auth" }).then((res) =>
      setAuth({
        authenticated: !!res.authenticated,
        username: res.username as string | undefined,
      }),
    );
  }, []);

  const handleLogout = () => {
    sendMessage({ type: "logout" }).then(() =>
      setAuth({ authenticated: false }),
    );
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
    const res = await sendMessage({ type: "login", username, password });
    setPending(false);
    if (res.ok) {
      onSuccess(username);
    } else {
      setError((res.error as string) || "Login failed");
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
