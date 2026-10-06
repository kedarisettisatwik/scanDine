import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getCountFromServer,
  query,
  orderBy,
  limit,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { useOwner, attempt } from "./App";
import { averagePerDay } from "./platformMetrics";
import ClientReviews from "./ClientReviews";
type Stats = { id: string; name: string; orders: number; first: number | null };
export default function SuperAdmin() {
  const user = useOwner();
  const [allowed, setAllowed] = useState(false),
    [busy, setBusy] = useState(true);
  const [rows, setRows] = useState<Stats[]>([]),
    [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0),
    [updated, setUpdated] = useState<Date | null>(null);
  useEffect(() => {
    if (!user || user.isAnonymous) return;
    let active = true;
    setBusy(true);
    setError("");
    setAllowed(false);
    (async () => {
      try {
        const role = await getDoc(doc(db, "platformAdmins", user.uid));
        if (!active) return;
        const permitted = role.exists() && role.data().enabled === true;
        setAllowed(permitted);
        if (!permitted) return;
        const restaurants = await getDocs(collection(db, "restaurants"));
        const result: Stats[] = [];
        for (let i = 0; i < restaurants.docs.length; i += 5) {
          const batch = await Promise.all(
            restaurants.docs.slice(i, i + 5).map(async (r) => {
              const orders = collection(db, "restaurants", r.id, "orders");
              const [count, first] = await Promise.all([
                getCountFromServer(orders),
                getDocs(query(orders, orderBy("createdAt"), limit(1))),
              ]);
              return {
                id: r.id,
                name: String(r.data().name || "Unnamed restaurant"),
                orders: count.data().count,
                first: first.docs[0]?.data().createdAt?.toMillis?.() ?? null,
              };
            }),
          );
          result.push(...batch);
        }
        if (active) {
          setRows(result.sort((a, b) => b.orders - a.orders));
          setUpdated(new Date());
        }
      } catch (e) {
        if (active)
          setError(
            e instanceof Error ? e.message : "Could not load statistics.",
          );
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user?.uid, refresh]);
  if (!user || user.isAnonymous)
    return (
      <Navigate
        to="/admin/login"
        state={{ returnTo: "/super-admin" }}
        replace
      />
    );
  const total = rows.reduce((n, r) => n + r.orders, 0);
  const dates = rows.flatMap((r) => (r.first === null ? [] : [r.first]));
  const first = dates.length ? Math.min(...dates) : null;
  return (
    <main className="platform-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">SCANDINE · PLATFORM OWNER</span>
          <h1>Super admin dashboard</h1>
          <p>Your restaurant network at a glance.</p>
        </div>
        <button
          className="secondary"
          onClick={() => attempt(() => signOut(auth))}
        >
          Sign out
        </button>
      </header>
      {allowed && <ClientReviews restaurants={rows} />}
      {busy ? (
        <div className="empty">Loading platform statistics…</div>
      ) : error ? (
        <section className="panel">
          <div className="error">{error}</div>
          <button onClick={() => setRefresh((v) => v + 1)}>Try again</button>
        </section>
      ) : !allowed ? (
        <section className="panel">
          <h2>Access restricted</h2>
          <p>This account does not have platform owner access.</p>
          <Link to="/admin">Restaurant dashboard →</Link>
        </section>
      ) : (
        <>
          <div className="stats">
            <section className="stat">
              <span>Registered restaurants</span>
              <h2>{rows.length.toLocaleString("en-IN")}</h2>
              <small>One restaurant per client account</small>
            </section>
            <section className="stat">
              <span>All-time dine-in orders</span>
              <h2>{total.toLocaleString("en-IN")}</h2>
              <small>Pending and completed combined</small>
            </section>
            <section className="stat">
              <span>Average orders per day</span>
              <h2>
                {averagePerDay(
                  total,
                  first,
                  updated?.getTime() ?? Date.now(),
                ).toFixed(2)}
              </h2>
              <small>Across all restaurants</small>
            </section>
          </div>
          <section className="panel">
            <div className="page-heading">
              <h2>Registered restaurants</h2>
              <button onClick={() => setRefresh((v) => v + 1)}>
                Refresh statistics
              </button>
            </div>
            <p>
              Each order counts once, including when more dishes are added. The
              average includes all calendar days since the first order,
              including today and days without orders (India time).
            </p>
            {updated && (
              <p>Last refreshed: {updated.toLocaleString("en-IN")}</p>
            )}
            {first !== null && (
              <p>
                First order:{" "}
                {new Date(first).toLocaleDateString("en-IN", {
                  timeZone: "Asia/Kolkata",
                })}
              </p>
            )}
            {rows.length === 0 ? (
              <div className="empty">No restaurants registered yet.</div>
            ) : (
              <div className="platform-table-wrap">
                <table className="platform-table">
                  <thead>
                    <tr>
                      <th>Restaurant</th>
                      <th>Dine-in orders</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <strong>{r.name}</strong>
                          <small>{r.id}</small>
                        </td>
                        <td>{r.orders.toLocaleString("en-IN")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
