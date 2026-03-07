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

function useTheme() {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("ytsub:theme", dark ? "dark" : "light");
  }, [dark]);

  return { dark, toggle: () => setDark((v) => !v) };
}

function HeaderMenu() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { dark, toggle: toggleTheme } = useTheme();

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
        onClick={toggleTheme}
        aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      >
        {dark ? (
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
        ) : (
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
