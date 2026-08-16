import { describe, expect, it } from "vitest";
import { configuredHandlerQueues } from "./worker-runtime.js";

describe("configuredHandlerQueues", () => {
  it("does not create a consumable queue without a durable handler", () => {
    expect([...configuredHandlerQueues({})]).toEqual([]);
  });
});
