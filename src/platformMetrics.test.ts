import { it, expect } from "vitest";
import { averagePerDay } from "./platformMetrics";
it("handles no orders", () =>
  expect(averagePerDay(0, null, Date.now())).toBe(0));
it("includes days without orders", () =>
  expect(
    averagePerDay(
      12,
      Date.parse("2026-10-01T06:00:00Z"),
      Date.parse("2026-10-03T06:00:00Z"),
    ),
  ).toBe(4));
it("uses India midnight", () =>
  expect(
    averagePerDay(
      6,
      Date.parse("2026-10-01T18:29:00Z"),
      Date.parse("2026-10-01T18:31:00Z"),
    ),
  ).toBe(3));
