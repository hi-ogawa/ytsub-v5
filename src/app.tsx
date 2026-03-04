import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  RouterProvider,
  useLoaderData,
} from "react-router";
import { LoginPage } from "./routes/login.tsx";
import { VideoListPage } from "./routes/video-list.tsx";
import { VideoViewerPage } from "./routes/video-viewer.tsx";

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

function AuthLayout() {
  const { authenticated } = useLoaderData<typeof authLoader>();
  if (!authenticated) return <Navigate to="/login" replace />;
  return <Outlet />;
}

const router = createBrowserRouter([
  { path: "/login", Component: LoginPage },
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
