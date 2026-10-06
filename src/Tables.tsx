import { useState, type FormEvent } from "react";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { Link } from "react-router-dom";
import { Plus, Users } from "lucide-react";
import { db } from "./firebase";
import { useOwner, attempt } from "./App";
import { useRows, date } from "./data";
import {
  configPath,
  validTableNumber,
  releaseTable,
  approveTable,
  rejectTable,
} from "./tableAccess";
export default function Tables() {
  const u = useOwner(),
    configs = useRows(u.uid, "tableConfigs"),
    tables = useRows(u.uid, "tables"),
    requests = useRows(u.uid, "requests");
  const joins = useRows(u.uid, "tableJoinRequests");
  const [number, setNumber] = useState(""),
    [saving, setSaving] = useState(false),
    [resetting, setResetting] = useState("");
  async function create(e: FormEvent) {
    e.preventDefault();
    if (!validTableNumber(number)) return;
    setSaving(true);
    await attempt(async () => {
      if (configs.rows.some((c) => c.id === number))
        throw Error("This table already exists");
      await setDoc(doc(db, configPath(u.uid, number)), {
        tableNumber: number,
        updatedAt: serverTimestamp(),
      });
      setNumber("");
    }, "Table created");
    setSaving(false);
  }
  async function reset(table: any) {
    if (
      !window.confirm(
        `Reset Table ${table.tableNumber || table.id}? Its current order will be marked completed, open requests cleared, and the guest session ended.`,
      )
    )
      return;
    setResetting(table.id);
    await attempt(
      () =>
        releaseTable(
          db,
          u.uid,
          table.tableNumber || table.id,
          table.sessionId,
          requests.rows,
        ),
      "Table is empty and ready for the next guests",
    );
    setResetting("");
  }
  const all = Array.from(
    new Set([
      ...configs.rows.map((c) => c.id),
      ...tables.rows.map((t) => t.id),
    ]),
  ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return (
    <>
      <div className="section-lead">
        <p>See who is dining, and keep each table ready.</p>
        <span className="live-dot">Updating live</span>
      </div>
      <section className="panel">
        <h2>Add a restaurant table</h2>
        <form className="inline-form" onSubmit={create}>
          <input
            required
            aria-label="New table number"
            placeholder="Table number, e.g. 5"
            pattern="[a-zA-Z0-9-]{1,12}"
            maxLength={12}
            value={number}
            onChange={(e) =>
              setNumber(e.target.value.replace(/[^a-zA-Z0-9-]/g, ""))
            }
          />
          <button disabled={saving || configs.loading}>
            <Plus size={16} />
            {saving ? "Adding…" : "Add table"}
          </button>
        </form>
        <p className="table-help">
          Visitors enter their table number, then wait for your approval. One
          dining session can occupy each table at a time. If a visitor reports
          that someone else is using their table, you’ll receive a notification
          and can reset it here.
        </p>
      </section>
      <section className="panel">
        <div className="section-title">
          <h2>Guests waiting for approval</h2>
          <span>
            {joins.rows.filter((j) => j.status === "pending").length} waiting
          </span>
        </div>
        {joins.error ? (
          <div className="error">{joins.error}</div>
        ) : joins.loading ? (
          <p>Loading requests…</p>
        ) : !joins.rows.some((j) => j.status === "pending") ? (
          <p>No guests waiting.</p>
        ) : (
          joins.rows
            .filter((j) => j.status === "pending")
            .map((j) => (
              <div className="activity" key={j.id}>
                <div>
                  <strong>Table {j.tableNumber}</strong>
                  <p>{date(j.updatedAt)}</p>
                  <small>
                    Confirm this guest is dining at the table before approving.
                  </small>
                </div>
                <button
                  disabled={
                    !!resetting ||
                    tables.rows.some((t) => t.id === j.tableNumber)
                  }
                  onClick={async () => {
                    setResetting(j.id);
                    await attempt(
                      () => approveTable(db, u.uid, j),
                      "Guest approved",
                    );
                    setResetting("");
                  }}
                >
                  Approve
                </button>
                <button
                  className="secondary"
                  disabled={!!resetting}
                  onClick={async () => {
                    setResetting(j.id);
                    await attempt(
                      () => rejectTable(db, u.uid, j),
                      "Request declined",
                    );
                    setResetting("");
                  }}
                >
                  Decline
                </button>
              </div>
            ))
        )}
      </section>
      <section className="panel">
        <div className="section-title">
          <h2>Your tables</h2>
          <span>
            {tables.rows.length} filled ·{" "}
            {Math.max(0, all.length - tables.rows.length)} empty
          </span>
        </div>
        {configs.error || tables.error || requests.error ? (
          <div className="error">
            {configs.error || tables.error || requests.error}
          </div>
        ) : configs.loading || tables.loading ? (
          <p>Loading tables…</p>
        ) : !all.length ? (
          <div className="empty">
            <Users />
            <h3>Add your first table</h3>
            <p>Guests can join after you add their table number here.</p>
          </div>
        ) : (
          <div className="order-grid">
            {all.map((id) => {
              const current = tables.rows.find((t) => t.id === id);
              return (
                <article className="order-card" key={id}>
                  <div className="order-top">
                    <span className="table-icon">{id}</span>
                    <span
                      className={`badge ${current ? "pending" : "completed"}`}
                    >
                      {current ? "Filled" : "Empty"}
                    </span>
                  </div>
                  <h3>Table {id}</h3>
                  {current ? (
                    <>
                      <p>Joined {date(current.createdAt)}</p>
                      {current.orderId ? (
                        <Link to={`/admin/orders/${current.orderId}`}>
                          Order #{current.orderId.slice(-8).toUpperCase()} →
                        </Link>
                      ) : (
                        <p>No order placed yet</p>
                      )}
                      <button
                        className="secondary small"
                        style={{ marginTop: 15 }}
                        disabled={resetting === id || requests.loading}
                        onClick={() => reset(current)}
                      >
                        {resetting === id ? "Resetting…" : "Reset table"}
                      </button>
                    </>
                  ) : (
                    <p>Ready for the next guests</p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
