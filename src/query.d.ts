import "@tanstack/react-query";

declare module "@tanstack/react-query" {
  interface MutationMeta {
    suppressToast?: boolean;
  }
}
