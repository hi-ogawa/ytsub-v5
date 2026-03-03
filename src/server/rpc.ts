import { os } from "@orpc/server";
import { db } from "./db.ts";

export const router = os.router({
  health: os.handler(() => ({ ok: true })),
  dbHealth: os.handler(async () => {
    const result = await db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all<{ name: string }>();
    return { tables: result.results.map((r) => r.name) };
  }),
});

export type Router = typeof router;
