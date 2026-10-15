import { describe, expect, it } from "vitest";
import { appName, brand } from "./index";

describe("brand", () => {
  it("names the company and locks brand guide colors", () => {
    expect(appName).toBe("Certified Waste Solutions");
    expect(brand.spaceBlue).toBe("#012556");
    expect(brand.forestGreen).toBe("#519F44");
    expect(brand.joustBlue2).toBe("#188EF4");
  });
});
