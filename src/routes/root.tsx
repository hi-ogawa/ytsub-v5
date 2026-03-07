import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Link,
  Navigate,
  Outlet,
  useLoaderData,
  useRouteLoaderData,
} from "react-router";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu.tsx";
import { orpc } from "../rpc.ts";

export async function authLoader() {
  const res = await fetch("/api/auth/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ json: {} }),
  });
  const data = (await res.json()) as { json: { authenticated: boolean } };
  return { authenticated: data.json.authenticated };
}

export function RootLayout() {
  const { authenticated } = useLoaderData<typeof authLoader>();
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex h-10 flex-none items-center justify-between border-b px-3">
        <Link to="/" className="text-sm font-semibold">
          ytsub
        </Link>
        <HeaderMenu authenticated={authenticated} />
      </header>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

export function GuestLayout() {
  const { authenticated } = useRouteLoaderData("root") as Awaited<
    ReturnType<typeof authLoader>
  >;
  if (authenticated) return <Navigate to="/" replace />;
  return <Outlet />;
}

export function AuthLayout() {
  const { authenticated } = useRouteLoaderData("root") as Awaited<
    ReturnType<typeof authLoader>
  >;
  if (!authenticated) return <Navigate to="/login" replace />;
  return <Outlet />;
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
  document.body.offsetHeight;
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

const THEME_ICONS: Record<Theme, string> = {
  light:
    "M12 3v1m0 16v1m8.66-13.66l-.71.71M4.05 19.95l-.71.71M21 12h-1M4 12H3m16.66 7.66l-.71-.71M4.05 4.05l-.71-.71M16 12a4 4 0 11-8 0 4 4 0 018 0z",
  dark: "M20.354 15.354A9 9 0 018.646 3.646 9.005 9.005 0 0012 21a9.005 9.005 0 008.354-5.646z",
  system:
    "M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
};

function ThemeIcon({ theme }: { theme: Theme }) {
  return (
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
        d={THEME_ICONS[theme]}
      />
    </svg>
  );
}

function HeaderMenu({ authenticated }: { authenticated: boolean }) {
  const { theme, cycle: cycleTheme } = useTheme();

  const logoutMutation = useMutation(
    orpc.auth.logout.mutationOptions({
      onSuccess: () => {
        window.location.href = "/login";
      },
    }),
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-testid="header-menu"
        className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted"
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
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-36">
        <DropdownMenuItem
          data-testid="theme-toggle"
          data-theme={theme}
          onSelect={(e) => {
            e.preventDefault();
            cycleTheme();
          }}
          className="gap-2"
        >
          <ThemeIcon theme={theme} />
          <span className="capitalize">{theme}</span>
        </DropdownMenuItem>
        {authenticated && (
          <DropdownMenuItem onSelect={() => logoutMutation.mutate({})}>
            Log out
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
