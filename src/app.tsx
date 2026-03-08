import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router";
import { DevIndexPage } from "./routes/dev-index.tsx";
import { DevViewerPage } from "./routes/dev-viewer.tsx";
import { LoginPage } from "./routes/login.tsx";
import {
  AuthLayout,
  authLoader,
  GuestLayout,
  RootLayout,
} from "./routes/root.tsx";
import { VideoListPage } from "./routes/video-list.tsx";
import { VideoViewerPage } from "./routes/video-viewer.tsx";

const queryClient = new QueryClient();

const router = createBrowserRouter([
  {
    id: "root",
    Component: RootLayout,
    loader: authLoader,
    children: [
      {
        Component: GuestLayout,
        children: [{ path: "/login", Component: LoginPage }],
      },
      {
        Component: AuthLayout,
        children: [
          { path: "/", Component: VideoListPage },
          { path: "/videos/:id", Component: VideoViewerPage },
          { path: "/dev", Component: DevIndexPage },
          { path: "/dev/youtube/:videoId", Component: DevViewerPage },
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
