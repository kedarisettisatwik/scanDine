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
  serverTimestamp: () => 1234,
  onSnapshot: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  runTransaction: async (_: any, fn: any) => {
    const writes = new Map<string, any>();
    await fn({
      get: async (ref: any) => ({
        exists: () => state.docs.has(ref.path),
        data: () => state.docs.get(ref.path),
      }),
      set: (ref: any, data: any) => writes.set(ref.path, data),
    });
    writes.forEach((value, key) => state.docs.set(key, value));
  },
}));
import { placeOrder } from "./data";
const dish = {
  itemId: "paneer",
  name: "Paneer Tikka",
  price: 220,
  type: "veg",
  qty: 2,
};
describe("Table order lifecycle", () => {
  beforeEach(() => {
    state.docs.clear();
    state.counter = 0;
  });
  it("creates an order, claims its table, and emits a notification atomically", async () => {
    await placeOrder({} as any, "restaurant", "guest", "5", [dish]);
    const order = state.docs.get("restaurants/restaurant/orders/id-1");
    expect(order.total).toBe(440);
    expect(order.items[0].isAddon).toBe(false);
    expect(state.docs.get("restaurants/restaurant/tables/5")).toEqual({
      orderId: "id-1",
      guestUid: "guest",
    });
    expect(
      state.docs.get("restaurants/restaurant/notifications/id-2").type,
    ).toBe("new_order");
  });
  it("appends items without replacing previously ordered prices or quantities", async () => {
    await placeOrder({} as any, "restaurant", "guest", "5", [dish]);
    await placeOrder({} as any, "restaurant", "guest", "5", [
      { ...dish, price: 250, qty: 1 },
    ]);
    const order = state.docs.get("restaurants/restaurant/orders/id-1");
    expect(order.items).toHaveLength(2);
    expect(order.items[0].price).toBe(220);
    expect(order.items[1].isAddon).toBe(true);
    expect(order.total).toBe(690);
    expect(order.createdAt).toBe(1234);
  });
  it("refuses a second device without modifying the active order", async () => {
    await placeOrder({} as any, "restaurant", "guest", "5", [dish]);
    const count = state.docs.size;
    await expect(
      placeOrder({} as any, "restaurant", "other-device", "5", [dish]),
    ).rejects.toThrow("another device");
    expect(state.docs.size).toBe(count);
    expect(state.docs.get("restaurants/restaurant/orders/id-1").total).toBe(
      440,
    );
  });
  it("starts a fresh order after staff releases the table", async () => {
    await placeOrder({} as any, "restaurant", "guest", "5", [dish]);
    state.docs.delete("restaurants/restaurant/tables/5");
    state.docs.get("restaurants/restaurant/orders/id-1").status = "completed";
    await placeOrder({} as any, "restaurant", "next-guest", "5", [dish]);
    expect(state.docs.get("restaurants/restaurant/tables/5").orderId).toBe(
      "id-3",
    );
    expect(
      state.docs.get("restaurants/restaurant/orders/id-3").items[0].isAddon,
    ).toBe(false);
  });
  it("limits distinct dishes per submission to the security-rule validation budget", async () => {
    await expect(
      placeOrder({} as any, "restaurant", "guest", "5", Array(9).fill(dish)),
    ).rejects.toThrow("8 different dishes");
    expect(state.docs.size).toBe(0);
  });
});
