import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ docs: new Map<string, any>(), counter: 0 }));
vi.mock("./firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  collection: (_: any, path: string) => ({ path }),
  doc: (first: any, second?: string, third?: string) => {
    const path = second
      ? third
        ? `${second}/${third}`
        : second
      : `${first.path}/id-${++state.counter}`;
    return { path, id: path.split("/").at(-1) };
  },
  serverTimestamp: () => ({ toMillis: () => Date.now() }),
  onSnapshot: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  runTransaction: async (_: any, fn: any) => {
    const writes = new Map<string, any>();
    const result = await fn({
      get: async (ref: any) => ({
        exists: () => state.docs.has(ref.path),
        data: () => state.docs.get(ref.path),
      }),
      set: (ref: any, data: any) => writes.set(ref.path, data),
      update: (ref: any, data: any) => {
        if (!state.docs.has(ref.path)) throw Error("Missing document");
        writes.set(ref.path, { ...state.docs.get(ref.path), ...data });
      },
      delete: (ref: any) => writes.set(ref.path, null),
    });
    writes.forEach((value, key) =>
      value === null ? state.docs.delete(key) : state.docs.set(key, value),
    );
    return result;
  },
}));
import { placeOrder } from "./data";
import {
  joinTable,
  approveTable,
  releaseTable,
  sessionIsCurrent,
} from "./tableAccess";
const database = {} as any,
  rid = "restaurant",
  base = "restaurants/restaurant";
const dish = {
  itemId: "paneer",
  name: "Paneer Tikka",
  price: 220,
  type: "veg",
  qty: 2,
};
const access = { tableNumber: "5", sessionId: "approved-session-0001" };
const p = (name: string, id: string) => `${base}/${name}/${id}`;
function approveSeed() {
  state.docs.set(p("tables", "5"), {
    ...access,
    guestUid: "guest",
    orderId: null,
  });
  state.docs.set(p("tableOccupancy", "5"), {
    guestUid: "guest",
    sessionId: access.sessionId,
  });
}
function notifications() {
  return [...state.docs.entries()]
    .filter(([key]) => key.startsWith(`${base}/notifications/`))
    .map(([, value]) => value);
}
describe("Approved dining sessions", () => {
  beforeEach(() => {
    state.docs.clear();
    state.counter = 0;
    state.docs.set(p("tableConfigs", "5"), { tableNumber: "5" });
    approveSeed();
  });
  it("creates an order in an approved session and notifies staff", async () => {
    await placeOrder(database, rid, "guest", "5", [dish], access);
    const o = state.docs.get(p("orders", "id-1"));
    expect(o.total).toBe(440);
    expect(o.items[0].isAddon).toBe(false);
    expect(o.sessionId).toBe(access.sessionId);
    expect(state.docs.get(p("tables", "5")).orderId).toBe("id-1");
    expect(notifications()[0].type).toBe("new_order");
  });
  it("appends items while retaining historical prices", async () => {
    await placeOrder(database, rid, "guest", "5", [dish], access);
    await placeOrder(
      database,
      rid,
      "guest",
      "5",
      [{ ...dish, price: 250, qty: 1 }],
      access,
    );
    const o = state.docs.get(p("orders", "id-1"));
    expect(o.items).toHaveLength(2);
    expect(o.items[0].price).toBe(220);
    expect(o.items[1].isAddon).toBe(true);
    expect(o.total).toBe(690);
  });
  it("refuses orders from a different anonymous device", async () => {
    await expect(
      placeOrder(database, rid, "other", "5", [dish], access),
    ).rejects.toThrow("session has ended");
    expect(notifications()).toHaveLength(0);
  });
  it("refuses a stale session token even on the same device", async () => {
    await expect(
      placeOrder(database, rid, "guest", "5", [dish], {
        ...access,
        sessionId: "old",
      }),
    ).rejects.toThrow("session has ended");
  });
  it("requires approval even when the table is empty", async () => {
    state.docs.delete(p("tables", "5"));
    state.docs.delete(p("tableOccupancy", "5"));
    await expect(
      placeOrder(database, rid, "guest", "5", [dish], access),
    ).rejects.toThrow("session has ended");
  });
  it("submits a join request without reserving the empty table", async () => {
    state.docs.delete(p("tables", "5"));
    state.docs.delete(p("tableOccupancy", "5"));
    const pending = await joinTable(database, rid, "guest", "5");
    expect(state.docs.has(p("tables", "5"))).toBe(false);
    expect(state.docs.get(p("tableJoinRequests", "5_guest")).status).toBe(
      "pending",
    );
    expect(notifications()[0].type).toBe("table_join");
    await expect(
      placeOrder(database, rid, "guest", "5", [dish], pending),
    ).rejects.toThrow("session has ended");
  });
  it("activates the session only after admin approval", async () => {
    state.docs.delete(p("tables", "5"));
    state.docs.delete(p("tableOccupancy", "5"));
    const pending = await joinTable(database, rid, "guest", "5");
    const request = {
      ...state.docs.get(p("tableJoinRequests", "5_guest")),
      id: "5_guest",
    };
    await approveTable(database, rid, request);
    expect(
      sessionIsCurrent(
        state.docs.get(p("tableOccupancy", "5")),
        pending,
        "guest",
      ),
    ).toBe(true);
    await placeOrder(database, rid, "guest", "5", [dish], pending);
    expect(state.docs.get(p("tables", "5")).orderId).toBeTruthy();
  });
  it("resumes the current approved session without another approval", async () => {
    expect(await joinTable(database, rid, "guest", "5")).toEqual(access);
    expect(notifications()).toHaveLength(0);
  });
  it("blocks an occupied table and emits one conflict notification", async () => {
    await expect(joinTable(database, rid, "new-guest", "5")).rejects.toThrow(
      "Someone else is using this table",
    );
    expect(notifications()[0].type).toBe("table_conflict");
    expect(state.docs.get(p("tables", "5")).guestUid).toBe("guest");
    await expect(joinTable(database, rid, "new-guest", "5")).rejects.toThrow(
      "Someone else",
    );
    expect(notifications()).toHaveLength(1);
  });
  it("does not approve a second party while the table is occupied", async () => {
    const req = {
      id: "5_other",
      tableNumber: "5",
      guestUid: "other",
      sessionId: "pending-session",
      status: "pending",
    };
    state.docs.set(p("tableJoinRequests", req.id), req);
    await expect(approveTable(database, rid, req)).rejects.toThrow(
      "Someone else",
    );
    expect(state.docs.get(p("tables", "5")).guestUid).toBe("guest");
  });
  it("completion releases occupancy and blocks the old browser from adding or ordering", async () => {
    await placeOrder(database, rid, "guest", "5", [dish], access);
    await releaseTable(database, rid, "5", access.sessionId, [], "id-1");
    expect(state.docs.get(p("orders", "id-1")).status).toBe("completed");
    expect(state.docs.has(p("tableOccupancy", "5"))).toBe(false);
    await expect(
      placeOrder(database, rid, "guest", "5", [dish], access),
    ).rejects.toThrow("session has ended");
    const pending = await joinTable(database, rid, "guest", "5");
    expect(pending.sessionId).not.toBe(access.sessionId);
    expect(state.docs.get(p("tableJoinRequests", "5_guest")).status).toBe(
      "pending",
    );
    await expect(
      placeOrder(database, rid, "guest", "5", [dish], pending),
    ).rejects.toThrow("session has ended");
  });
  it("reset does not clear a newer party after a stale admin action", async () => {
    await expect(
      releaseTable(database, rid, "5", "older-session", []),
    ).rejects.toThrow("table changed");
    expect(state.docs.has(p("tables", "5"))).toBe(true);
  });
  it("reset releases an approved table even before its first order", async () => {
    await releaseTable(database, rid, "5", access.sessionId, []);
    expect(state.docs.has(p("tables", "5"))).toBe(false);
    expect(state.docs.has(p("tableOccupancy", "5"))).toBe(false);
  });
  it("limits distinct dishes to the security-rule validation budget", async () => {
    await expect(
      placeOrder(database, rid, "guest", "5", Array(7).fill(dish), access),
    ).rejects.toThrow("6 different dishes");
  });
});
