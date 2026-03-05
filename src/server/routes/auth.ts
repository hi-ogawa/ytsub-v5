import { ORPCError } from "@orpc/server";
import {
  deleteCookie,
  getCookie,
  setCookie,
  unsign,
} from "@orpc/server/helpers";
import { env } from "cloudflare:workers";
import z from "zod";
import { createSessionToken, pub, verifyPassword } from "../auth.ts";

export const authRouter = pub.router({
  login: pub
    .input(z.object({ password: z.string() }))
    .handler(async ({ input, context }) => {
      const valid = await verifyPassword(input.password);
      if (!valid) throw new ORPCError("UNAUTHORIZED");

      const token = await createSessionToken();
      setCookie(context.resHeaders, "session", token, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 30 * 86400,
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
    const exp = await unsign(token, env.AUTH_SECRET);
    const valid = !!exp && Number(exp) >= Date.now() / 1000;
    return { authenticated: valid };
  }),
});
