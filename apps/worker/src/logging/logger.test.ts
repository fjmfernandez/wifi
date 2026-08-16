import { describe, expect, it } from "vitest";
import { safeErrorFields } from "./logger.js";

describe("safeErrorFields", () => {
  it("does not propagate arbitrary names or codes into persistent logs", () => {
    const error = Object.assign(new Error("sensitive message"), {
      name: "pii@example.test",
      code: "tenant secret value",
    });

    expect(safeErrorFields(error)).toEqual({
      errorName: "Error",
      errorCode: "UNEXPECTED_ERROR",
    });
  });

  it("keeps conventional machine-safe error codes", () => {
    const error = Object.assign(new Error("not logged"), { code: "ECONNREFUSED" });
    expect(safeErrorFields(error)).toEqual({
      errorName: "Error",
      errorCode: "ECONNREFUSED",
    });
  });
});
