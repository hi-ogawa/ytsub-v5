import { useQuery } from "@tanstack/react-query";
import { orpc } from "./rpc.ts";

export function App() {
  const health = useQuery(orpc.health.queryOptions());

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-bold">ytsub</h1>
      <p className="mt-2 text-sm text-gray-500">
        {health.isLoading ? "connecting..." : health.isError ? "server offline" : "connected"}
      </p>
    </div>
  );
}
