import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router";
import { DevViewerPage } from "./routes/dev-viewer.tsx";
import { LoginPage, RegisterPage } from "./routes/login.tsx";
import {
  AuthLayout,
  authLoader,
  DevLayout,
  GuestLayout,
  RootLayout,
} from "./routes/root.tsx";
import { VideoListPage } from "./routes/video-list.tsx";
import { VideoViewerPage } from "./routes/video-viewer.tsx";

const queryClient = new QueryClient();

const router = createBrowserRouter([
  {
    path: "/dev",
    Component: DevLayout,
    children: [{ path: "youtube/:videoId", Component: DevViewerPage }],
  },
  {
    id: "root",
    Component: RootLayout,
    loader: authLoader,
    HydrateFallback: () => null,
    children: [
      {
        Component: GuestLayout,
        children: [
          { path: "/login", Component: LoginPage },
          { path: "/register", Component: RegisterPage },
        ],
      },
      {
        Component: AuthLayout,
        children: [
          { path: "/", Component: VideoListPage },
          { path: "/videos/:youtubeId", Component: VideoViewerPage },
        ],
      },
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
