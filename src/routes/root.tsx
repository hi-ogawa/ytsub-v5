import { useMutation } from "@tanstack/react-query";
import { EllipsisVertical, Monitor, Moon, Sun } from "lucide-react";
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
    <div className="flex h-screen flex-col">
      <header className="flex h-10 flex-none items-center justify-between border-b px-3">
        <Link to="/" className="text-sm font-semibold">
          Zamak
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
const THEME_KEY = "zamak:theme";
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

const THEME_ICON_MAP = { light: Sun, dark: Moon, system: Monitor } as const;

function ThemeIcon({ theme }: { theme: Theme }) {
  const Icon = THEME_ICON_MAP[theme];
  return <Icon className="h-4 w-4" />;
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
        <EllipsisVertical className="h-4 w-4" />
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
