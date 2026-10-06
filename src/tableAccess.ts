import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  type Firestore,
  type Transaction,
} from "firebase/firestore";
import { useEffect, useState } from "react";
export type TableAccess = {
  tableNumber: string;
  sessionId: string;
};
export const configPath = (rid: string, table: string) =>
  `restaurants/${rid}/tableConfigs/${table}`;
export const occupancyPath = (rid: string, table: string) =>
  `restaurants/${rid}/tableOccupancy/${table}`;
export const joinPath = (rid: string, table: string, uid: string) =>
  `restaurants/${rid}/tableJoinRequests/${table}_${uid}`;
export function useJoinRequest(
  database: Firestore,
  rid: string | undefined,
  table: string,
  uid: string,
) {
  const [request, setRequest] = useState<any>(null);
  useEffect(() => {
    setRequest(null);
    if (!rid || !uid || !validTableNumber(table)) return;
    return onSnapshot(
      doc(database, joinPath(rid, table, uid)),
      (s) => setRequest(s.data() || null),
      () => setRequest(null),
    );
  }, [database, rid, table, uid]);
  return request;
}
export function validTableNumber(table: string) {
  return /^[a-zA-Z0-9-]{1,12}$/.test(table);
}
export function useTableOccupancy(
  database: Firestore,
  rid: string | undefined,
  table: string,
  uid: string,
) {
  const [occupancy, setOccupancy] = useState<any>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    setOccupancy(null);
    setError("");
    if (!rid || !uid || !validTableNumber(table)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    return onSnapshot(
      doc(database, occupancyPath(rid, table)),
      (s) => {
        setOccupancy(s.data() || null);
        setLoading(false);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      },
    );
  }, [database, rid, table, uid]);
  return { occupancy, loading, error };
}
export function sessionIsCurrent(
  occupancy: any,
  access: TableAccess | null,
  uid: string,
) {
  return (
    !!occupancy &&
    !!access &&
    occupancy.guestUid === uid &&
    occupancy.sessionId === access.sessionId
  );
}
export async function joinTable(
  database: Firestore,
  rid: string,
  uid: string,
  table: string,
): Promise<TableAccess> {
  if (!validTableNumber(table)) throw Error("Enter a valid table number");
  const sessionId = crypto.randomUUID();
  const occupiedRef = doc(database, occupancyPath(rid, table)),
    tableRef = doc(database, `restaurants/${rid}/tables/${table}`),
    configRef = doc(database, configPath(rid, table));
  const conflictRef = doc(
      database,
      `restaurants/${rid}/tableConflicts/${table}_${uid}`,
    ),
    notification = doc(
      collection(database, `restaurants/${rid}/notifications`),
    );
  const result = await runTransaction(database, async (tx) => {
    const config = await tx.get(configRef);
    if (!config.exists())
      throw Error(
        "This table has not been set up. Please check the number with the staff.",
      );
    const occupied = await tx.get(occupiedRef);
    if (occupied.exists()) {
      if (occupied.data().guestUid === uid) {
        const existing = await tx.get(tableRef);
        if (existing.exists())
          return {
            tableNumber: table,
            sessionId: occupied.data().sessionId,
          };
      }
      const conflict = await tx.get(conflictRef);
      const last = conflict.data()?.updatedAt?.toMillis?.() || 0;
      if (Date.now() - last >= 60000) {
        tx.set(conflictRef, {
          tableNumber: table,
          guestUid: uid,
          occupantSessionId: occupied.data().sessionId,
          updatedAt: serverTimestamp(),
        });
        tx.set(notification, {
          type: "table_conflict",
          tableNumber: table,
          guestUid: uid,
          conflictId: conflictRef.id,
          occupantSessionId: occupied.data().sessionId,
          message:
            "Someone else is using this table. Please check and reset it.",
          read: false,
          createdAt: serverTimestamp(),
        });
      }
      return null;
    }
    const joinRef = doc(database, joinPath(rid, table, uid));
    const previous = await tx.get(joinRef);
    if (previous.data()?.status === "pending")
      return {
        tableNumber: table,
        sessionId: previous.data()!.sessionId,
      };
    if (
      previous.exists() &&
      Date.now() - (previous.data().updatedAt?.toMillis?.() || 0) < 60000
    )
      throw Error(
        "Please wait a minute before submitting another table request.",
      );
    const session = { tableNumber: table, sessionId };
    tx.set(joinRef, {
      ...session,
      guestUid: uid,
      status: "pending",
      updatedAt: serverTimestamp(),
    });
    tx.set(notification, {
      type: "table_join",
      tableNumber: table,
      guestUid: uid,
      joinId: joinRef.id,
      sessionId,
      message: "A guest is waiting for table approval.",
      read: false,
      createdAt: serverTimestamp(),
    });
    return session;
  });
  if (!result)
    throw Error(
      "Someone else is using this table. Staff have been notified; please ask them to reset it.",
    );
  return result;
}
export async function approveTable(
  database: Firestore,
  rid: string,
  request: any,
) {
  await runTransaction(database, async (tx) => {
    const joinRef = doc(
        database,
        `restaurants/${rid}/tableJoinRequests/${request.id}`,
      ),
      tableRef = doc(
        database,
        `restaurants/${rid}/tables/${request.tableNumber}`,
      ),
      occupiedRef = doc(database, occupancyPath(rid, request.tableNumber));
    const join = await tx.get(joinRef),
      occupied = await tx.get(occupiedRef),
      table = await tx.get(tableRef);
    if (
      join.data()?.status !== "pending" ||
      join.data()?.sessionId !== request.sessionId
    )
      throw Error("This request changed. Please refresh.");
    if (occupied.exists() || table.exists())
      throw Error(
        "Someone else is using this table. Reset its current session before approving.",
      );
    const d = join.data()!;
    tx.set(occupiedRef, { guestUid: d.guestUid, sessionId: d.sessionId });
    tx.set(tableRef, {
      tableNumber: d.tableNumber,
      sessionId: d.sessionId,
      guestUid: d.guestUid,
      orderId: null,
      createdAt: serverTimestamp(),
    });
    tx.update(joinRef, { status: "approved" });
  });
}
export async function rejectTable(
  database: Firestore,
  rid: string,
  request: any,
) {
  await runTransaction(database, async (tx) => {
    const ref = doc(
      database,
      `restaurants/${rid}/tableJoinRequests/${request.id}`,
    );
    const fresh = await tx.get(ref);
    if (
      fresh.data()?.status !== "pending" ||
      fresh.data()?.sessionId !== request.sessionId
    )
      throw Error("This request changed. Please refresh.");
    tx.update(ref, { status: "rejected" });
  });
}
export async function assertTableAccess(
  tx: Transaction,
  database: Firestore,
  rid: string,
  uid: string,
  table: string,
  access: TableAccess,
) {
  if (!access || access.tableNumber !== table)
    throw Error("Request staff approval for your table before ordering");
  const current = (
    await tx.get(doc(database, `restaurants/${rid}/tables/${table}`))
  ).data();
  if (
    !current ||
    current.guestUid !== uid ||
    current.sessionId !== access.sessionId
  )
    throw Error(
      "This dining session has ended or was reset. Please join the table again.",
    );
}
export async function releaseTable(
  database: Firestore,
  rid: string,
  table: string,
  expectedSessionId: string | undefined,
  requests: any[],
  expectedOrderId?: string,
) {
  await runTransaction(database, async (tx) => {
    const tableRef = doc(database, `restaurants/${rid}/tables/${table}`),
      occupancyRef = doc(database, occupancyPath(rid, table));
    const current = await tx.get(tableRef),
      occupancy = await tx.get(occupancyRef);
    // Legacy tables can be closed during migration; never clear a newer party's reservation.
    if (expectedSessionId && current.data()?.sessionId !== expectedSessionId)
      throw Error(
        "The table changed in another window. Please refresh before resetting.",
      );
    const orderId = expectedOrderId || current.data()?.orderId;
    const orderRef = orderId
      ? doc(database, `restaurants/${rid}/orders/${orderId}`)
      : null;
    const order = orderRef ? await tx.get(orderRef) : null;
    const viewRef = orderId ? doc(database, "orderViews", orderId) : null;
    const view = viewRef ? await tx.get(viewRef) : null;
    if (expectedOrderId && order?.data()?.status !== "pending")
      throw Error("This order is already completed.");
    if (
      expectedOrderId &&
      current.exists() &&
      current.data()?.orderId !== expectedOrderId
    )
      throw Error("Another order is using this table. Please refresh.");
    const pending = requests.filter(
      (r) =>
        r.tableNumber === table &&
        r.status === "open" &&
        (!r.sessionId || r.sessionId === current.data()?.sessionId),
    );
    const snapshots = await Promise.all(
      pending.map(async (r) => {
        const ref = doc(database, `restaurants/${rid}/requests/${r.id}`),
          lock = doc(
            database,
            `restaurants/${rid}/serviceLocks/${table}_${r.featureId}`,
          );
        return {
          r,
          ref,
          lock,
          request: await tx.get(ref),
          service: await tx.get(lock),
        };
      }),
    );
    if (orderRef && order?.data()?.status === "pending")
      tx.update(orderRef, {
        status: "completed",
        updatedAt: serverTimestamp(),
      });
    if (viewRef && view?.exists() && order?.data()?.status === "pending")
      tx.update(viewRef, { status: "completed" });
    if (current.exists()) tx.delete(tableRef);
    if (occupancy.exists()) tx.delete(occupancyRef);
    snapshots.forEach(({ r, ref, lock, request, service }) => {
      if (
        request.data()?.status === "open" &&
        request.data()?.createdAt?.toMillis?.() === r.createdAt?.toMillis?.()
      ) {
        tx.update(ref, { status: "done" });
        if (service.data()?.requestId === r.id) tx.delete(lock);
      }
    });
  });
}
