import { MutationCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { assertTypeEqual } from "../utils/type-assert.ts";

// https://tanstack.com/query/latest/docs/framework/react/typescript#registering-global-meta
declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: {
      toastOnError?: boolean;
    };
  }
}

export function createAppQueryClient(
  options?: ConstructorParameters<typeof QueryClient>[0],
) {
  return new QueryClient({
    ...options,
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        // verify the Register augmentation above is applied
        assertTypeEqual<
          typeof mutation.meta,
          { toastOnError?: boolean } | undefined
        >(true);

        if (mutation.meta?.toastOnError === false) {
          return;
        }
        toast.error(error.message || "Something went wrong");
      },
    }),
  });
}
