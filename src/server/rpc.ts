import { os } from "@orpc/server";

export const router = os.router({
  health: os.handler(() => ({ ok: true })),
});

export type Router = typeof router;
