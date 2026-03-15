import { MutationCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function createAppQueryClient(
  options?: ConstructorParameters<typeof QueryClient>[0],
) {
  return new QueryClient({
    ...options,
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (mutation.meta?.toastOnError === false) return;
        toast.error(error.message || "Something went wrong");
      },
    }),
  });
}
