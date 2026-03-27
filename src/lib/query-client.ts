import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { assertTypeEqual } from "./type-assert.ts";

export function createAppQueryClient(
  options?: ConstructorParameters<typeof QueryClient>[0],
) {
  return new QueryClient({
    ...options,
    defaultOptions: {
      queries: { retry: false },
      ...options?.defaultOptions,
    },
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (query.meta?.toastOnError === false) return;
        toast.error(error.message || "Something went wrong");
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        // verify query.d.ts Register augmentation is applied
        assertTypeEqual<
          typeof mutation.meta,
          { toastOnError?: boolean } | undefined
        >(true);

        if (mutation.meta?.toastOnError === false) return;
        toast.error(error.message || "Something went wrong");
      },
    }),
  });
}
