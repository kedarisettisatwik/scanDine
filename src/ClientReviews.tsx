import { useEffect, useRef, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import toast from "react-hot-toast";
import { db } from "./firebase";
import { attempt } from "./App";
import { date, type Row } from "./data";

export default function ClientReviews({
  restaurants,
}: {
  restaurants: { id: string; name: string }[];
}) {
  const [clients, setClients] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "pending">("all");
  const restaurantNames = new Map(restaurants.map((r) => [r.id, r.name]));
  const searchTerm = search.trim().toLocaleLowerCase();
  const visible = clients.filter(
    (client) =>
      (filter === "all" || client.reviewPending === true) &&
      [restaurantNames.get(client.id) || "", client.clientName || ""].some(
        (name) => name.toLocaleLowerCase().includes(searchTerm),
      ),
  );
  const seen = useRef<Map<string, number> | null>(null);
  useEffect(
    () =>
      onSnapshot(
        collection(db, "clients"),
        (s) => {
          const rows = s.docs.map((d) => ({ ...d.data(), id: d.id }) as Row);
          for (const client of rows) {
            const time = client.updatedAt?.toMillis?.() || 0;
            if (
              seen.current &&
              client.reviewPending &&
              seen.current.get(client.id) !== time
            )
              toast(`Client details need review: ${client.clientName}`, {
                icon: "🔔",
              });
          }
          seen.current = new Map(
            rows.map((c) => [c.id, c.updatedAt?.toMillis?.() || 0]),
          );
          setClients(
            rows.sort(
              (a, b) =>
                Number(b.reviewPending) - Number(a.reviewPending) ||
                (b.updatedAt?.toMillis?.() || 0) -
                  (a.updatedAt?.toMillis?.() || 0),
            ),
          );
          setLoading(false);
        },
        (e) => {
          setError(e.message);
          setLoading(false);
        },
      ),
    [],
  );
  async function review(client: Row, approved: boolean) {
    setBusy(client.id);
    await attempt(
      async () => {
        const ref = doc(db, "clients", client.id);
        await runTransaction(db, async (tx) => {
          const fresh = await tx.get(ref);
          if (
            !fresh.exists() ||
            fresh.data().updatedAt?.toMillis?.() !==
              client.updatedAt?.toMillis?.()
          )
            throw Error(
              "The client details changed. Review the latest details before continuing.",
            );
          tx.update(ref, {
            approved,
            reviewPending: false,
            reviewedAt: serverTimestamp(),
          });
        });
      },
      approved ? "Dashboard access approved" : "Dashboard access suspended",
    );
    setBusy("");
  }
  return (
    <section className="panel">
      <h2>
        Client reviews · {clients.filter((c) => c.reviewPending).length}{" "}
        awaiting review
      </h2>
      <p>
        Review new applications and updated details. Access status is true when
        approved and false when suspended.
      </p>
      <label>
        Filter by restaurant or client name
        <input
          type="search"
          placeholder="Search restaurant or client name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <div className="chips" role="group" aria-label="Client review filters">
        <button
          className={filter === "all" ? "chip selected" : "chip"}
          aria-pressed={filter === "all"}
          onClick={() => setFilter("all")}
        >
          All
        </button>
        <button
          className={filter === "pending" ? "chip selected" : "chip"}
          aria-pressed={filter === "pending"}
          onClick={() => setFilter("pending")}
        >
          Pending review
        </button>
      </div>
      {!loading && !error && clients.length > 0 && (
        <p aria-live="polite">
          Showing {visible.length} of {clients.length} clients
        </p>
      )}
      {error && <div className="error">{error}</div>}
      {loading && <p>Loading client applications…</p>}
      {!loading && !error && !clients.length && (
        <p>No client applications yet.</p>
      )}
      {!loading && !error && clients.length > 0 && !visible.length && (
        <p>No clients match these filters.</p>
      )}
      {visible.map((c) => (
        <article className="client-review" key={c.id}>
          <p>{restaurantNames.get(c.id) || "Restaurant account"}</p>
          <div className="section-title">
            <h3>{c.clientName}</h3>
            <span className={`badge ${c.approved ? "completed" : "pending"}`}>
              {c.approved ? "Access approved" : "Access blocked"}
            </span>
          </div>
          {c.reviewPending && (
            <strong>
              🔔{" "}
              {c.reviewedAt
                ? "Details changed — review required"
                : "New application — review required"}
            </strong>
          )}
          <dl>
            <dt>Phone number</dt>
            <dd>{c.phone}</dd>
            <dt>Address</dt>
            <dd>{c.address}</dd>
            <dt>Location</dt>
            <dd>{c.location}</dd>
            <dt>Account ID</dt>
            <dd>{c.id}</dd>
            <dt>Details updated</dt>
            <dd>{date(c.updatedAt)}</dd>
          </dl>
          <div className="order-link-actions">
            <button disabled={busy === c.id} onClick={() => review(c, true)}>
              {busy === c.id
                ? "Saving…"
                : c.approved
                  ? "Confirm details and keep access"
                  : "Approve access"}
            </button>
            <button
              className="secondary"
              disabled={busy === c.id}
              onClick={() => review(c, false)}
            >
              Suspend access
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}
