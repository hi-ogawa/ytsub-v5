import { ORPCError } from "@orpc/server";
import { deleteCookie, getCookie, setCookie } from "@orpc/server/helpers";
import { eq } from "drizzle-orm";
import z from "zod";
import {
  createSessionToken,
  hashPassword,
  pub,
  verifyPassword,
  verifySessionToken,
} from "../auth.ts";
import { db } from "../db.ts";
import { users } from "../schema.ts";

const SESSION_MAX_AGE = 30 * 86400;

export const authRouter = pub.router({
  register: pub
    .input(
      z.object({
        username: z.string().min(3).max(50),
        password: z.string().min(8).max(256),
      }),
    )
    .handler(async ({ input, context }) => {
      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, input.username))
        .get();
      if (existing) {
        throw new ORPCError("CONFLICT", {
          message: "Username already taken",
        });
      }

      const passwordHash = await hashPassword(input.password);
      const [user] = await db
        .insert(users)
        .values({ username: input.username, passwordHash })
        .returning({ id: users.id });

      const token = await createSessionToken(user.id);
      setCookie(context.resHeaders, "session", token, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: SESSION_MAX_AGE,
      });
      return { ok: true, token };
    }),

  login: pub
    .input(
      z.object({
        username: z.string().max(50),
        password: z.string().max(256),
      }),
    )
    .handler(async ({ input, context }) => {
      const user = await db
        .select({ id: users.id, passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.username, input.username))
        .get();

      // Always hash to prevent timing-based user enumeration
      const valid = await verifyPassword(
        input.password,
        user?.passwordHash ?? "$dummy$",
      );
      if (!user || !valid) throw new ORPCError("UNAUTHORIZED");

      const token = await createSessionToken(user.id);
      setCookie(context.resHeaders, "session", token, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: SESSION_MAX_AGE,
      });
      return { ok: true, token };
    }),

  logout: pub.handler(async ({ context }) => {
    deleteCookie(context.resHeaders, "session");
    return { ok: true };
  }),

  check: pub.handler(async ({ context }) => {
    if (!context.reqHeaders) return { authenticated: false };
    const cookie = getCookie(context.reqHeaders, "session");
    const auth = context.reqHeaders.get("authorization");
    const token =
      cookie ?? (auth?.startsWith("Bearer ") ? auth.slice(7) : undefined);
    if (!token) return { authenticated: false };
    const userId = await verifySessionToken(token);
    return { authenticated: !!userId };
  }),
});
