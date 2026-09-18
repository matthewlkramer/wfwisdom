import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// A never-connected pool is enough: pg only dials on the first query.
beforeAll(() => { process.env.DATABASE_URL = "postgres://u:p@127.0.0.1:1/none"; });
const { closeDb, getPool } = await import("@wfw/db");
afterEach(() => vi.restoreAllMocks());

describe("connection pool resilience", () => {
  it("listens for idle client errors, so a dropped connection cannot crash the process", () => {
    expect(getPool().listenerCount("error")).toBeGreaterThan(0);
  });

  it("survives the error Postgres sends when it terminates an idle connection", () => {
    // Without a listener, Node rethrows an unhandled 'error' event and the API process dies —
    // which is exactly how production went down.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error("terminating connection due to administrator command");
    expect(() => getPool().emit("error", err, {} as never)).not.toThrow();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("terminating connection due to administrator command"));
  });

  it("keeps handing back the same pool rather than opening one per call", () => {
    expect(getPool()).toBe(getPool());
  });

  it("closes cleanly", async () => {
    await expect(closeDb()).resolves.toBeUndefined();
  });
});
