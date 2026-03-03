import { sql } from "drizzle-orm";
import { os } from "@orpc/server";
import { db } from "./db.ts";

export const router = os.router({
  health: os.handler(() => ({ ok: true })),
  dbHealth: os.handler(async () => {
    const result = await db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
    );
    return { tables: result.map((r) => r.name) };
  }),
});

export type Router = typeof router;
