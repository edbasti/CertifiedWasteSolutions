import { describe, expect, it } from "vitest";
import { appName, brand } from "./index";

describe("brand", () => {
  it("names the company and locks space blue", () => {
    expect(appName).toBe("Certified Waste Solutions");
    expect(brand.spaceBlue).toBe("#012556");
  });
});
