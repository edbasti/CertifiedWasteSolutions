import { describe, expect, it } from "vitest";
import { logFieldMap, invoiceSources } from "./log-fields";

describe("log field map", () => {
  it("keeps payment headers with the manager and line items with the driver", () => {
    const datePaid = logFieldMap.non_port.find((field) => field.key === "datePaid");
    const friday = logFieldMap.port.find((field) => field.key === "paymentDateFriday");

    expect(datePaid).toMatchObject({
      scope: "header",
      filledBy: "manager",
      onInvoice: false,
    });
    expect(friday).toMatchObject({
      scope: "header",
      filledBy: "manager",
      onInvoice: false,
    });
    expect(logFieldMap.non_port.some((field) => field.key === "paymentDateFriday")).toBe(false);
    expect(logFieldMap.port.some((field) => field.key === "datePaid")).toBe(false);

    for (const fields of Object.values(logFieldMap)) {
      expect(fields.filter((field) => field.scope === "line").every((field) => field.filledBy === "driver")).toBe(
        true,
      );
      expect(fields.some((field) => field.key === "weight")).toBe(false);
      expect(fields.find((field) => field.key === "price")).toMatchObject({
        onInvoice: true,
        valueType: "money",
      });
    }
  });

  it("lists the invoice inputs separately from manager-only dates", () => {
    expect(invoiceSources).toEqual(["driverName", "logType", "serviceDate", "lines", "priceTotal"]);
  });
});
