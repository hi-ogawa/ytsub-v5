import { useQuery } from "@tanstack/react-query";

export function App() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => fetch("/rpc/health").then((r) => r.json()),
  });

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-bold">ytsub</h1>
      <p className="mt-2 text-sm text-gray-500">
        {health.isLoading ? "connecting..." : health.isError ? "server offline" : "connected"}
      </p>
    </div>
  );
}
