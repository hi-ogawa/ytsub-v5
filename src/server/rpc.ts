import { os } from "@orpc/server";
import type { Env } from "./db.ts";

const base = os.$context<{ env: Env }>();

export const router = base.router({
  health: base.handler(() => ({ ok: true })),
  dbHealth: base.handler(async ({ context }) => {
    const result = await context.env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    ).all<{ name: string }>();
    return { tables: result.results.map((r) => r.name) };
  }),
});

export type Router = typeof router;
