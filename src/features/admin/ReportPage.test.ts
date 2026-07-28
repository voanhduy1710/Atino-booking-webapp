import { describe, expect, it } from "vitest";
import { formatChartDate } from "./reportDate";

describe("formatChartDate", () => {
  it("formats delivery dates as DD/MM with Vietnamese weekday", () => {
    expect(formatChartDate("2026-07-28")).toEqual({
      label: "28/07",
      weekday: "T3",
    });
    expect(formatChartDate("2026-07-26")).toEqual({
      label: "26/07",
      weekday: "CN",
    });
  });
});
