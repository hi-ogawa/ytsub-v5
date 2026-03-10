import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

const THEME_ICON = { light: Sun, dark: Moon, system: Monitor } as const;

const THEME_KEY = "zamak:theme";
const THEMES: Theme[] = ["light", "dark", "system"];

function resolveTheme(theme: Theme): boolean {
  if (theme === "system")
    return matchMedia("(prefers-color-scheme: dark)").matches;
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

  useEffect(() => {
    if (theme !== "system") return;
    const mql = matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => applyDarkClass(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [theme]);

  const cycle = () =>
    setTheme((t) => THEMES[(THEMES.indexOf(t) + 1) % THEMES.length]);

  return { theme, cycle, Icon: THEME_ICON[theme] };
}
