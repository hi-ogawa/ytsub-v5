import { expect, test } from "vitest";
import { runSteps } from "./run-steps.ts";

test("passes each step's result to the next", async () => {
  const result = await runSteps(new AbortController().signal, [
    () => 1,
    async (n) => n + 1,
    (n) => `${n}`,
  ]);
  expect(result).toBe("2");
});

test("stops after the step during which the signal aborts", async () => {
  const controller = new AbortController();
  const ran: string[] = [];
  const result = runSteps(controller.signal, [
    async () => {
      ran.push("first");
      controller.abort();
    },
    () => {
      ran.push("second");
    },
  ]);
  await expect(result).rejects.toThrow();
  expect(ran).toEqual(["first"]);
});
