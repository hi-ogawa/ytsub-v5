import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router";
import { VideoListPage } from "./routes/video-list.tsx";
import { VideoViewerPage } from "./routes/video-viewer.tsx";

const queryClient = new QueryClient();

const router = createBrowserRouter([
  { path: "/", Component: VideoListPage },
  { path: "/videos/:id", Component: VideoViewerPage },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
