import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { createBrowserRouter, RouterProvider } from "react-router";
import { Login } from "./components/login.tsx";
import { VideoListPage } from "./routes/video-list.tsx";
import { VideoViewerPage } from "./routes/video-viewer.tsx";

const queryClient = new QueryClient();

const router = createBrowserRouter([
  { path: "/", Component: VideoListPage },
  { path: "/videos/:id", Component: VideoViewerPage },
]);

function useAuthCheck() {
  const [state, setState] = useState<"loading" | "authenticated" | "login">(
    "loading",
  );

  useEffect(() => {
    fetch("/api/auth/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ json: {} }),
    })
      .then((r) => r.json())
      .then((data: any) =>
        setState(data.json?.authenticated ? "authenticated" : "login"),
      )
      .catch(() => setState("login"));
  }, []);

  return { state, setState };
}

export function App() {
  const auth = useAuthCheck();

  if (auth.state === "loading") return null;

  if (auth.state === "login") {
    return <Login onSuccess={() => auth.setState("authenticated")} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
