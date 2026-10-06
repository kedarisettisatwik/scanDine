import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  runTransaction,
  serverTimestamp,
  type Firestore,
  type QueryConstraint,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "./firebase";
export type Row = { id: string; [key: string]: any };
export const path = (rid: string, name: string) => `restaurants/${rid}/${name}`;
export function useRows(
  rid: string | undefined,
  name: string,
  database: Firestore = db,
  filters: QueryConstraint[] = [],
) {
  const [rows, setRows] = useState<Row[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const key = JSON.stringify(filters);
  useEffect(() => {
    setRows([]);
    setError("");
    setLoading(true);
    if (!rid) {
      setLoading(false);
      return;
    }
    return onSnapshot(
      query(collection(database, path(rid, name)), ...filters),
      (s) => {
        setRows(s.docs.map((d) => ({ ...d.data(), id: d.id })));
        setLoading(false);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      },
    );
  }, [rid, name, database, key]);
  return { rows, loading, error };
}
export function useRestaurant(rid?: string, database: Firestore = db) {
  const [restaurant, setRestaurant] = useState<Row | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    setRestaurant(null);
    setLoading(true);
    if (!rid) {
      setLoading(false);
      return;
    }
    return onSnapshot(
      doc(database, "restaurants", rid),
      (s) => {
        setRestaurant(s.exists() ? { ...s.data(), id: s.id } : null);
        setLoading(false);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      },
    );
  }, [rid, database]);
  return { restaurant, loading, error };
}
export const money = (v: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(v || 0);
export const date = (v: any) =>
  v?.toDate?.().toLocaleString("en-IN") || "Just now";
export const millis = (v: any) => v?.toMillis?.() || 0;
export const features = [
  ["bill", "Get Bill", "🧾"],
  ["water", "Need Free Water", "💧"],
  ["tissues", "Need Tissues", "🧻"],
  ["utensils", "Need Utensils", "🍴"],
  ["clean", "Clean Table", "✨"],
  ["waiter", "Talk to Waiter", "🙋"],
].map(([id, label, icon]) => ({ id, label, icon, enabled: true }));
export async function placeOrder(
  database: Firestore,
  rid: string,
  uid: string,
  table: string,
  items: any[],
) {
  const lock = doc(database, path(rid, "tables"), table),
    fresh = doc(collection(database, path(rid, "orders"))),
    notification = doc(collection(database, path(rid, "notifications")));
  if (items.length > 8)
    throw Error(
      "Please order up to 8 different dishes at a time. You can add more afterward.",
    );
  await runTransaction(database, async (tx) => {
    const ls = await tx.get(lock);
    if (ls.exists() && ls.data().guestUid !== uid)
      throw Error(
        "This table already has an active order on another device. Please ask the staff.",
      );
    const active = ls.data()?.orderId;
    const ref = active ? doc(database, path(rid, "orders"), active) : fresh;
    const snap = active ? await tx.get(ref) : null;
    const old = snap?.data();
    const addon = old?.status === "pending";
    const lines = items.map((i) => ({
      ...i,
      addedAt: Date.now(),
      isAddon: addon,
    }));
    const all = addon ? [...old.items, ...lines] : lines;
    const subtotal = lines.reduce(
      (n: number, i: any) => n + i.price * i.qty,
      0,
    );
    const total = addon ? old.total + subtotal : subtotal;
    tx.set(ref, {
      tableNumber: table,
      guestUid: uid,
      status: "pending",
      items: all,
      addedItems: lines,
      total,
      createdAt: addon ? old.createdAt : serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    tx.set(lock, { orderId: ref.id, guestUid: uid });
    tx.set(notification, {
      type: addon ? "items_added" : "new_order",
      orderId: ref.id,
      guestUid: uid,
      tableNumber: table,
      message: addon
        ? `Added ${items.reduce((n, i) => n + i.qty, 0)} items`
        : "New order received",
      read: false,
      createdAt: serverTimestamp(),
    });
  });
}
export { where };
