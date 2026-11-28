import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect } from "react";
import { z } from "zod";
import { withUseValue } from "../components/use-store-value.ts";
import { createLocalStorageStore } from "../utils/local-storage-store.ts";

const THEMES = ["light", "dark", "system"] as const;
type Theme = (typeof THEMES)[number];

const THEME_ICON = { light: Sun, dark: Moon, system: Monitor } as const;

const preferencesSchema = z
  .object({ theme: z.enum(THEMES).catch("system") })
  .catch({ theme: "system" });

const themePreferences = withUseValue(
  createLocalStorageStore({
    key: "zamak:theme",
    parse: (stored) => preferencesSchema.parse(stored),
  }),
);

function resolveTheme(theme: Theme): boolean {
  if (theme === "system") {
    return matchMedia("(prefers-color-scheme: dark)").matches;
  }
  return theme === "dark";
}

function applyDarkClass(dark: boolean) {
  const css = document.createElement("style");
  css.textContent = "*, *::before, *::after { transition: none !important; }";
  document.head.appendChild(css);
  document.documentElement.classList.toggle("dark", dark);
  document.body.offsetHeight;
  css.remove();
}

export function useTheme() {
  const [theme, setTheme] = themePreferences.useValue("theme");

  useEffect(() => {
    applyDarkClass(resolveTheme(theme));
  }, [theme]);

  useEffect(() => {
    if (theme !== "system") {
      return;
    }
    const darkQuery = matchMedia("(prefers-color-scheme: dark)");
    const handler = (event: MediaQueryListEvent) =>
      applyDarkClass(event.matches);
    darkQuery.addEventListener("change", handler);
    return () => darkQuery.removeEventListener("change", handler);
  }, [theme]);

  const cycle = () =>
    setTheme((t) => THEMES[(THEMES.indexOf(t) + 1) % THEMES.length]);

  return { theme, cycle, Icon: THEME_ICON[theme] };
}
