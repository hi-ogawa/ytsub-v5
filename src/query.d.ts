import "@tanstack/react-query";

// https://tanstack.com/query/latest/docs/framework/react/typescript#registering-global-meta
declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: {
      toastOnError?: boolean;
    };
  }
}
