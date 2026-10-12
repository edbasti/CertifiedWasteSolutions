import { describe, expect, it } from "vitest";
import { homePath } from "./operations";

describe("homePath", () => {
  it("sends drivers to the day view and everyone else to the portal", () => {
    expect(homePath("driver")).toBe("/day");
    expect(homePath("manager")).toBe("/portal");
    expect(homePath("admin")).toBe("/portal");
  });
});
