import { ORPCError } from "@orpc/server";
import {
  deleteCookie,
  getCookie,
  setCookie,
  unsign,
} from "@orpc/server/helpers";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import z from "zod";
import {
  createSessionToken,
  hashPassword,
  pub,
  verifyPassword,
} from "../auth.ts";
import { db } from "../db.ts";
import { users } from "../schema.ts";

const SESSION_MAX_AGE = 30 * 86400;

export const authRouter = pub.router({
  register: pub
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(8).max(256),
      }),
    )
    .handler(async ({ input, context }) => {
      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, input.email))
        .get();
      if (existing) {
        throw new ORPCError("CONFLICT", {
          message: "Email already registered",
        });
      }

      const passwordHash = await hashPassword(input.password);
      const [user] = await db
        .insert(users)
        .values({ email: input.email, passwordHash })
        .returning({ id: users.id });

      const token = await createSessionToken(user.id);
      setCookie(context.resHeaders, "session", token, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: SESSION_MAX_AGE,
      });
      return { ok: true };
    }),

  login: pub
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().max(256),
      }),
    )
    .handler(async ({ input, context }) => {
      const user = await db
        .select({ id: users.id, passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.email, input.email))
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
      return { ok: true };
    }),

  logout: pub.handler(async ({ context }) => {
    deleteCookie(context.resHeaders, "session");
    return { ok: true };
  }),

  check: pub.handler(async ({ context }) => {
    const token = getCookie(context.reqHeaders, "session");
    if (!token) return { authenticated: false };
    const payload = await unsign(token, env.AUTH_SECRET);
    if (!payload) return { authenticated: false };
    const [, expStr] = payload.split(":");
    const valid = Number(expStr) >= Date.now() / 1000;
    return { authenticated: valid };
  }),
});
