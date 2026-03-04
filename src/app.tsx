import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { useState } from "react";
import { createBrowserRouter, RouterProvider } from "react-router";
import { Login } from "./components/login.tsx";
import { VideoListPage } from "./routes/video-list.tsx";
import { VideoViewerPage } from "./routes/video-viewer.tsx";
import { orpc } from "./rpc.ts";

const queryClient = new QueryClient();

const router = createBrowserRouter([
  { path: "/", Component: VideoListPage },
  { path: "/videos/:id", Component: VideoViewerPage },
]);

function AuthGate() {
  const [authed, setAuthed] = useState(false);
  const check = useQuery(orpc.auth.check.queryOptions({ input: {} }));

  if (check.isLoading) return null;

  if (check.data?.authenticated || authed) {
    return <RouterProvider router={router} />;
  }

  return <Login onSuccess={() => setAuthed(true)} />;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthGate />
    </QueryClientProvider>
  );
}
