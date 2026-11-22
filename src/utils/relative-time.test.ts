import { expect, test } from "vitest";
import { formatRelativeTime } from "./relative-time.ts";

test(formatRelativeTime, () => {
  const now = new Date("2026-03-10T12:00:00.000Z").getTime();
  const format = (time: string) => formatRelativeTime(time, now);
  expect(format("2026-03-10T11:59:30.000Z")).toBe("just now");
  expect(format("2026-03-10T11:55:00.000Z")).toBe("5 minutes ago");
  expect(format("2026-03-10T10:00:00.000Z")).toBe("2 hours ago");
  expect(format("2026-03-09T11:00:00.000Z")).toBe("yesterday");
  expect(format("2026-03-07T12:00:00.000Z")).toBe("3 days ago");
  expect(format("2026-02-24T12:00:00.000Z")).toBe("2 weeks ago");
  expect(format("2025-12-01T12:00:00.000Z")).toBe("3 months ago");
  expect(format("2024-03-10T12:00:00.000Z")).toBe("2 years ago");
});
