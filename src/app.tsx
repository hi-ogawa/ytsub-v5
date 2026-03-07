import {
  QueryClient,
  QueryClientProvider,
  useMutation,
} from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  createBrowserRouter,
  Link,
  Navigate,
  Outlet,
  RouterProvider,
  useLoaderData,
} from "react-router";
import { LoginPage } from "./routes/login.tsx";
import { VideoListPage } from "./routes/video-list.tsx";
import { VideoViewerPage } from "./routes/video-viewer.tsx";
import { orpc } from "./rpc.ts";

const queryClient = new QueryClient();

async function authLoader() {
  const res = await fetch("/api/auth/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ json: {} }),
  });
  const data = (await res.json()) as { json: { authenticated: boolean } };
  return { authenticated: data.json.authenticated };
}

function GuestLayout() {
  const { authenticated } = useLoaderData<typeof authLoader>();
  if (authenticated) return <Navigate to="/" replace />;
  return (
    <div className="bg-background text-foreground">
      <Outlet />
    </div>
  );
}

function AuthLayout() {
  const { authenticated } = useLoaderData<typeof authLoader>();
  if (!authenticated) return <Navigate to="/login" replace />;
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex h-10 flex-none items-center justify-between border-b px-3">
        <Link to="/" className="text-sm font-semibold">
          ytsub
        </Link>
        <HeaderMenu />
      </header>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

type Theme = "light" | "dark" | "system";
const THEME_KEY = "ytsub:theme";
const THEMES: Theme[] = ["light", "dark", "system"];

function resolveTheme(theme: Theme): boolean {
  if (theme === "system")
    return matchMedia("(prefers-color-scheme: dark)").matches;
  return theme === "dark";
}

function applyDarkClass(dark: boolean) {
  // Disable transitions during theme switch to prevent color flicker
  const css = document.createElement("style");
  css.textContent = "*, *::before, *::after { transition: none !important; }";
  document.head.appendChild(css);

  document.documentElement.classList.toggle("dark", dark);

  // Force a reflow so the no-transition style takes effect, then remove it
  document.body.offsetHeight; // eslint-disable-line @typescript-eslint/no-unused-expressions
  css.remove();
}

function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") return stored;
    return "system";
  });

  useEffect(() => {
    applyDarkClass(resolveTheme(theme));
    if (theme === "system") {
      localStorage.removeItem(THEME_KEY);
    } else {
      localStorage.setItem(THEME_KEY, theme);
    }
  }, [theme]);

  // Listen for system preference changes when in "system" mode
  useEffect(() => {
    if (theme !== "system") return;
    const mql = matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => applyDarkClass(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [theme]);

  const cycle = () =>
    setTheme((t) => THEMES[(THEMES.indexOf(t) + 1) % THEMES.length]);

  return { theme, isDark: resolveTheme(theme), cycle };
}

function HeaderMenu() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { theme, cycle: cycleTheme } = useTheme();

  const logoutMutation = useMutation(
    orpc.auth.logout.mutationOptions({
      onSuccess: () => {
        window.location.href = "/login";
      },
    }),
  );

  return (
    <div className="relative flex items-center gap-1">
      <button
        className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted"
        onClick={cycleTheme}
        aria-label={`Theme: ${theme}`}
      >
        {theme === "light" && (
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 3v1m0 16v1m8.66-13.66l-.71.71M4.05 19.95l-.71.71M21 12h-1M4 12H3m16.66 7.66l-.71-.71M4.05 4.05l-.71-.71M16 12a4 4 0 11-8 0 4 4 0 018 0z"
            />
          </svg>
        )}
        {theme === "dark" && (
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M20.354 15.354A9 9 0 018.646 3.646 9.005 9.005 0 0012 21a9.005 9.005 0 008.354-5.646z"
            />
          </svg>
        )}
        {theme === "system" && (
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        )}
      </button>
      <button
        className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted"
        onClick={() => setOpen((v) => !v)}
        onBlur={(e) => {
          if (!menuRef.current?.contains(e.relatedTarget)) setOpen(false);
        }}
      >
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z"
          />
        </svg>
      </button>
      {open && (
        <div
          ref={menuRef}
          className="absolute right-0 top-full z-10 mt-1 w-36 rounded border border-border bg-popover py-1 shadow-sm"
        >
          <button
            className="w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-muted"
            onClick={() => logoutMutation.mutate({})}
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

const router = createBrowserRouter([
  {
    Component: GuestLayout,
    loader: authLoader,
    children: [{ path: "/login", Component: LoginPage }],
  },
  {
    Component: AuthLayout,
    loader: authLoader,
    children: [
      { path: "/", Component: VideoListPage },
      { path: "/videos/:id", Component: VideoViewerPage },
    ],
  },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
