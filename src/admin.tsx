import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  updateDoc,
  writeBatch,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { sendPasswordResetEmail } from "firebase/auth";
import { QRCodeCanvas } from "qrcode.react";
import {
  Plus,
  ArrowUpRight,
  ClipboardList,
  Clock,
  Bell,
  Search,
} from "lucide-react";
import { auth, db } from "./firebase";
import {
  useRows,
  useRestaurant,
  money,
  date,
  millis,
  path,
  type Row,
} from "./data";
import { useOwner, attempt } from "./App";
import { releaseTable } from "./tableAccess";
import { ClientForm, useClient } from "./ClientAccess";
function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="empty">
      <ClipboardList size={32} />
      <h3>{children}</h3>
      <p>Updates appear here as your restaurant gets going.</p>
    </div>
  );
}
function Errors({ error, loading }: { error: string; loading: boolean }) {
  return error ? (
    <div className="error">{error}</div>
  ) : loading ? (
    <p>Loading…</p>
  ) : null;
}
function WaitingRequests({ requests }: { requests: Row[] }) {
  const u = useOwner();
  if (!requests.length) return null;
  return (
    <section className="panel">
      <h2>Requests waiting</h2>
      {requests.map((r) => (
        <div className="activity" key={r.id}>
          <div>
            <strong>
              Table {r.tableNumber} — {r.label}
            </strong>
            <p>{date(r.createdAt)}</p>
            {r.orderId && (
              <Link to={`/admin/orders/${r.orderId}`}>View table order →</Link>
            )}
          </div>
          <button
            className="secondary small"
            onClick={() =>
              attempt(async () => {
                const b = writeBatch(db);
                b.update(doc(db, path(u.uid, "requests"), r.id), {
                  status: "done",
                });
                b.delete(
                  doc(
                    db,
                    path(u.uid, "serviceLocks"),
                    r.tableNumber + "_" + r.featureId,
                  ),
                );
                await b.commit();
              }, "Request completed")
            }
          >
            Mark as done
          </button>
        </div>
      ))}
    </section>
  );
}
export function Orders() {
  const u = useOwner(),
    orders = useRows(u.uid, "orders"),
    requests = useRows(u.uid, "requests");
  const [filter, setFilter] = useState("all"),
    [period, setPeriod] = useState("today");
  const all = orders.rows.sort(
    (a, b) => millis(b.createdAt) - millis(a.createdAt),
  );
  const today = all.filter(
    (o) => o.createdAt?.toDate?.().toDateString() === new Date().toDateString(),
  );
  const visible = all.filter((o) => filter === "all" || o.status === filter);
  return (
    <>
      <div className="section-lead">
        <p>A little clarity for a busy day.</p>
        <select
          aria-label="Summary period"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        >
          <option value="today">Today</option>
          <option value="all">All time</option>
        </select>
      </div>
      <div className="stats">
        <Stat
          icon={<ClipboardList />}
          label="TOTAL ORDERS"
          value={(period === "today" ? today : all).length}
          hint={
            period === "today"
              ? "Orders received today"
              : "Orders received so far"
          }
        />
        <Stat
          icon={<Clock />}
          label="TABLES DINING"
          value={all.filter((o) => o.status === "pending").length}
          hint="A good meal is still underway"
        />
        <Stat
          icon={<Bell />}
          label="REQUESTS WAITING"
          value={requests.rows.filter((r) => r.status === "open").length}
          hint="A little attention goes a long way"
        />
      </div>
      <section className="panel">
        <div className="section-title">
          <h2>
            Table orders <span className="count">{all.length}</span>
          </h2>
          <span className="live-dot">Updating live</span>
        </div>
        <div className="chips">
          {["all", "pending", "completed"].map((f) => (
            <button
              key={f}
              className={filter === f ? "chip selected" : "chip"}
              onClick={() => setFilter(f)}
            >
              {f === "all"
                ? "All orders"
                : f === "pending"
                  ? "Still dining"
                  : "Completed"}
            </button>
          ))}
        </div>
        <Errors {...orders} />
        {!orders.loading && !orders.error && !visible.length && (
          <Empty>No orders yet</Empty>
        )}
        <div className="order-grid">
          {visible.map((o) => (
            <Link
              key={o.id}
              className="order-card"
              to={`/admin/orders/${o.id}`}
            >
              <div className="order-top">
                <span className="table-icon">{o.tableNumber}</span>
                <span className={`badge ${o.status}`}>
                  {o.status === "pending" ? "Still dining" : "Completed"}
                </span>
              </div>
              <h3>
                Table {o.tableNumber}{" "}
                {requests.rows.some(
                  (r) => r.tableNumber === o.tableNumber && r.status === "open",
                ) && <i className="request-dot" />}
              </h3>
              <p>
                {o.items.reduce((n: number, i: any) => n + i.qty, 0)} items ·{" "}
                {date(o.createdAt)}
              </p>
              <div className="order-foot">
                <strong>{money(o.total)}</strong>
                <span>
                  View order <ArrowUpRight size={16} />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>
      <WaitingRequests
        requests={requests.rows.filter((r) => r.status === "open")}
      />
    </>
  );
}
function Stat({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="stat">
      <div className="stat-label">
        {label}
        <span>{icon}</span>
      </div>
      <strong>{value.toString().padStart(2, "0")}</strong>
      <p>{hint}</p>
    </div>
  );
}
export function OrderDetail() {
  const u = useOwner(),
    { orderId } = useParams();
  const { rows, error, loading } = useRows(u.uid, "orders");
  const { rows: requests } = useRows(u.uid, "requests"),
    { rows: notifications } = useRows(u.uid, "notifications");
  const order = rows.find((o) => o.id === orderId);
  const [busy, setBusy] = useState(false);
  if (!order)
    return (
      <>
        <Link to="/admin">← Back to orders</Link>
        <Errors error={error} loading={loading} />
        {!loading && !error && <Empty>Order not found</Empty>}
      </>
    );
  const req = requests.filter(
    (r) =>
      r.tableNumber === order.tableNumber &&
      (r.orderId === order.id ||
        (!r.orderId && millis(r.createdAt) >= millis(order.createdAt))),
  );
  async function close() {
    if (!window.confirm("Close this table after payment?")) return;
    setBusy(true);
    await attempt(
      () =>
        releaseTable(
          db,
          u.uid,
          order!.tableNumber,
          order!.sessionId,
          requests,
          order!.id,
        ),
      "Table completed and released",
    );
    setBusy(false);
  }
  return (
    <>
      <Link to="/admin">← Back to orders</Link>
      <div className="detail-grid">
        <section className="panel">
          <div className="section-title">
            <div>
              <h2>Table {order.tableNumber}</h2>
              <p>Order #{order.id.slice(-8).toUpperCase()}</p>
            </div>
            <span className={`badge ${order.status}`}>{order.status}</span>
          </div>
          {order.items.map((i: any, index: number) => (
            <div className="line-item" key={index}>
              <span className={`food-dot ${i.type}`}>●</span>
              <div>
                <strong>{i.name}</strong>
                <p>
                  {i.qty} × {money(i.price)}{" "}
                  {i.isAddon && (
                    <span className="addon">
                      Added later · {new Date(i.addedAt).toLocaleTimeString()}
                    </span>
                  )}
                </p>
              </div>
              <strong>{money(i.qty * i.price)}</strong>
            </div>
          ))}
          <div className="total">
            <span>Total</span>
            <strong>{money(order.total)}</strong>
          </div>
          {order.status === "pending" && (
            <button disabled={busy} onClick={close}>
              {busy ? "Closing…" : "Close table / Mark completed"}
            </button>
          )}
        </section>
        <section className="panel">
          <h2>Table activity</h2>
          {req.map((r) => (
            <div className="activity" key={r.id}>
              <div>
                <strong>{r.label}</strong>
                <p>{date(r.createdAt)}</p>
              </div>
              {r.status === "open" ? (
                <button
                  className="secondary small"
                  onClick={() =>
                    attempt(async () => {
                      const batch = writeBatch(db);
                      batch.update(doc(db, path(u.uid, "requests"), r.id), {
                        status: "done",
                      });
                      batch.delete(
                        doc(
                          db,
                          path(u.uid, "serviceLocks"),
                          r.tableNumber + "_" + r.featureId,
                        ),
                      );
                      await batch.commit();
                    }, "Request completed")
                  }
                >
                  Mark as done
                </button>
              ) : (
                <span className="badge completed">Done</span>
              )}
            </div>
          ))}
          {notifications
            .filter((n) => n.orderId === order.id)
            .sort((a, b) => millis(b.createdAt) - millis(a.createdAt))
            .map((n) => (
              <div className="activity" key={n.id}>
                <span>●</span>
                <div>
                  <strong>{n.message}</strong>
                  <p>{date(n.createdAt)}</p>
                </div>
              </div>
            ))}
        </section>
      </div>
    </>
  );
}
export function Notifications() {
  const u = useOwner(),
    { rows, error, loading } = useRows(u.uid, "notifications");
  async function markAll() {
    for (let start = 0; start < rows.length; start += 400) {
      const b = writeBatch(db);
      rows
        .slice(start, start + 400)
        .filter((n) => !n.read)
        .forEach((n) =>
          b.update(doc(db, path(u.uid, "notifications"), n.id), { read: true }),
        );
      await b.commit();
    }
  }
  return (
    <section className="panel">
      <div className="section-title">
        <div>
          <h2>Your latest updates</h2>
          <p>Orders, extra items, and table requests.</p>
        </div>
        <button
          className="secondary"
          onClick={() => attempt(markAll, "All notifications marked as read")}
        >
          Mark all read
        </button>
      </div>
      <Errors error={error} loading={loading} />
      {!loading && !error && !rows.length && (
        <Empty>You’re all caught up</Empty>
      )}
      {rows
        .sort((a, b) => millis(b.createdAt) - millis(a.createdAt))
        .map((n) => (
          <div className={`notification ${n.read ? "" : "unread"}`} key={n.id}>
            <span className="notification-icon">
              {n.type === "request"
                ? "🔔"
                : n.type === "items_added"
                  ? "＋"
                  : "🍽️"}
            </span>
            <div>
              <strong>
                Table {n.tableNumber} — {n.message}
              </strong>
              <p>{date(n.createdAt)}</p>
              {(n.type === "table_conflict" || n.type === "table_join") && (
                <Link to="/admin/tables">Open Tables →</Link>
              )}

              {n.orderId && (
                <Link to={`/admin/orders/${n.orderId}`}>View order →</Link>
              )}
            </div>
            {!n.read && (
              <button
                className="text-button"
                onClick={() =>
                  attempt(() =>
                    updateDoc(doc(db, path(u.uid, "notifications"), n.id), {
                      read: true,
                    }),
                  )
                }
              >
                Mark read
              </button>
            )}
          </div>
        ))}
    </section>
  );
}
function Urls({
  values,
  onChange,
  max = 3,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  max?: number;
}) {
  return (
    <div className="image-editor">
      {values.map((url, i) => (
        <div className="image-row" key={i}>
          {url && (
            <img
              src={url}
              alt={`Image ${i + 1}`}
              onError={(e) => (e.currentTarget.style.visibility = "hidden")}
            />
          )}
          <input
            aria-label={`Image URL ${i + 1}`}
            type="url"
            placeholder="https://…"
            value={url}
            onChange={(e) =>
              onChange(values.map((v, j) => (i === j ? e.target.value : v)))
            }
          />
          <button
            type="button"
            className="text-button"
            onClick={() => onChange(values.filter((_, j) => j !== i))}
          >
            Remove
          </button>
          {i > 0 && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                const copy = [...values];
                [copy[i - 1], copy[i]] = [copy[i], copy[i - 1]];
                onChange(copy);
              }}
            >
              ↑
            </button>
          )}
        </div>
      ))}
      {values.length < max && (
        <button
          type="button"
          className="secondary small"
          onClick={() => onChange([...values, ""])}
        >
          + Image URL
        </button>
      )}
      <small>
        Use publicly accessible HTTPS image links. Images are not uploaded to
        Firebase.
      </small>
    </div>
  );
}
export function Menu() {
  const u = useOwner(),
    items = useRows(u.uid, "menuItems"),
    { rows: categories } = useRows(u.uid, "categories");
  const [editing, setEditing] = useState<Row | null>(null),
    [open, setOpen] = useState(false),
    [images, setImages] = useState<string[]>([]),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState("all"),
    [saving, setSaving] = useState(false);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      price = Number(f.get("price"));
    if (!Number.isFinite(price) || price < 0) return;
    setSaving(true);
    await attempt(async () => {
      const value = {
        name: String(f.get("name")).trim(),
        description: String(f.get("description")).trim(),
        price,
        type: f.get("type"),
        categoryIds: f.getAll("categories"),
        images: images.filter(Boolean),
        available: f.get("available") === "on",
      };
      if (editing)
        await updateDoc(doc(db, path(u.uid, "menuItems"), editing.id), value);
      else
        await addDoc(collection(db, path(u.uid, "menuItems")), {
          ...value,
          createdAt: serverTimestamp(),
        });
      setOpen(false);
    }, "Menu saved");
    setSaving(false);
  }
  return (
    <>
      <div className="section-lead">
        <p>Good food deserves a great menu.</p>
        <button
          onClick={() => {
            setEditing(null);
            setImages([]);
            setOpen(true);
          }}
        >
          <Plus size={17} /> Add menu item
        </button>
      </div>
      <section className="panel">
        <div className="toolbar">
          <div className="search">
            <Search size={18} />
            <input
              placeholder="Search your menu"
              aria-label="Search menu"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            aria-label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <Errors {...items} />
        {!items.loading && !items.error && !items.rows.length && (
          <Empty>Add your first menu item</Empty>
        )}
        <div className="menu-grid">
          {items.rows
            .filter(
              (i) =>
                i.name.toLowerCase().includes(search.toLowerCase()) &&
                (category === "all" || i.categoryIds.includes(category)),
            )
            .map((i) => (
              <article className="menu-card" key={i.id}>
                <div className="menu-image">
                  {i.images[0] ? (
                    <img src={i.images[0]} alt={i.name} />
                  ) : (
                    <span>🍽️</span>
                  )}
                  <span
                    className={`badge ${i.available ? "completed" : "pending"}`}
                  >
                    {i.available ? "Available" : "Sold out"}
                  </span>
                </div>
                <div className="menu-body">
                  <div className="section-title">
                    <h3>
                      <span className={`food-dot ${i.type}`}>●</span> {i.name}
                    </h3>
                    <strong>{money(i.price)}</strong>
                  </div>
                  <p>
                    {i.description ||
                      categories
                        .filter((c) => i.categoryIds.includes(c.id))
                        .map((c) => c.name)
                        .join(" · ") ||
                      "Freshly made, thoughtfully served"}
                  </p>
                  <div className="card-actions">
                    <button
                      className="secondary small"
                      onClick={() => {
                        setEditing(i);
                        setImages(i.images);
                        setOpen(true);
                      }}
                    >
                      Edit item
                    </button>
                    <button
                      className="text-button"
                      onClick={() =>
                        attempt(() =>
                          updateDoc(doc(db, path(u.uid, "menuItems"), i.id), {
                            available: !i.available,
                          }),
                        )
                      }
                    >
                      {i.available ? "Mark sold out" : "Make available"}
                    </button>
                    <button
                      className="text-button danger"
                      onClick={() => {
                        if (window.confirm(`Delete ${i.name}?`))
                          attempt(
                            () =>
                              deleteDoc(
                                doc(db, path(u.uid, "menuItems"), i.id),
                              ),
                            "Item deleted",
                          );
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            ))}
        </div>
      </section>
      {open && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Menu item editor"
          >
            <div className="section-title">
              <h2>{editing ? "Edit" : "Add"} menu item</h2>
              <button className="text-button" onClick={() => setOpen(false)}>
                Close ✕
              </button>
            </div>
            <form onSubmit={save}>
              <label>
                Name
                <input
                  name="name"
                  required
                  maxLength={100}
                  defaultValue={editing?.name}
                />
              </label>
              <label>
                Description
                <input
                  name="description"
                  maxLength={300}
                  defaultValue={editing?.description}
                />
              </label>
              <div className="form-grid">
                <label>
                  Price (₹)
                  <input
                    name="price"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    defaultValue={editing?.price}
                  />
                </label>
                <label>
                  Type
                  <select name="type" defaultValue={editing?.type || "veg"}>
                    <option value="veg">Vegetarian</option>
                    <option value="nonveg">Non-vegetarian</option>
                  </select>
                </label>
              </div>
              <fieldset>
                <legend>Categories</legend>
                {categories.map((c) => (
                  <label className="check" key={c.id}>
                    <input
                      type="checkbox"
                      name="categories"
                      value={c.id}
                      defaultChecked={editing?.categoryIds?.includes(c.id)}
                    />
                    {c.name}
                  </label>
                ))}
                {!categories.length && (
                  <small>Create categories in Profile.</small>
                )}
              </fieldset>
              <label className="check">
                <input
                  name="available"
                  type="checkbox"
                  defaultChecked={editing?.available ?? true}
                />
                Available to order
              </label>
              <label>Images (up to 3)</label>
              <Urls values={images} onChange={setImages} />
              <button disabled={saving}>
                {saving ? "Saving…" : "Save menu item"}
              </button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
export function Profile() {
  const u = useOwner(),
    { restaurant: r } = useRestaurant(u.uid),
    { rows: categories } = useRows(u.uid, "categories");
  const { client, error: clientError } = useClient(u.uid);
  const [banners, setBanners] = useState<string[]>([]),
    [name, setName] = useState(""),
    [logo, setLogo] = useState(""),
    [table, setTable] = useState("");
  useEffect(() => {
    if (r) {
      setName(r.name);
      setLogo(r.logoUrl);
      setBanners(r.bannerImages);
    }
  }, [r?.id]);
  if (!r) return null;
  const url = `${window.location.href.split("#")[0]}#/r/${u.uid}${table ? `?table=${encodeURIComponent(table)}` : ""}`;
  async function category(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const value = String(new FormData(form).get("category")).trim();
    if (!value) return;
    await attempt(async () => {
      await addDoc(collection(db, path(u.uid, "categories")), {
        name: value,
        order: categories.length,
      });
      form.reset();
    }, "Category created");
  }
  function download() {
    const canvas = document.querySelector<HTMLCanvasElement>(
      "#restaurant-qr canvas",
    );
    if (!canvas) return;
    const a = document.createElement("a");
    a.download = `scandine-${table || "menu"}.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
  }
  return (
    <div className="profile-grid">
      <div>
        <section className="panel">
          <h2>Client details</h2>
          <p>
            Changes notify the team for review. The team may suspend access if
            details need correcting.
          </p>
          {clientError ? (
            <div className="error">{clientError}</div>
          ) : (
            <ClientForm client={client} />
          )}
        </section>
        <section className="panel">
          <h2>Restaurant details</h2>
          <p>Make the menu feel like your restaurant.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              attempt(async () => {
                const batch = writeBatch(db);
                batch.update(doc(db, "restaurants", u.uid), {
                  name: name.trim(),
                  logoUrl: logo,
                  bannerImages: banners.filter(Boolean),
                });
                if (name.trim() !== r.name)
                  batch.update(doc(db, "clients", u.uid), {
                    reviewPending: true,
                    updatedAt: serverTimestamp(),
                  });
                await batch.commit();
              }, "Profile saved");
            }}
          >
            <label>
              Restaurant name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={100}
              />
            </label>
            <label>
              Logo image URL
              <input
                type="url"
                value={logo}
                onChange={(e) => setLogo(e.target.value)}
                placeholder="https://…"
              />
            </label>
            {logo && (
              <img className="logo-preview" src={logo} alt="Restaurant logo" />
            )}
            <label>Banner images</label>
            <Urls max={8} values={banners} onChange={setBanners} />
            <button>Save profile</button>
          </form>
        </section>
        <section className="panel">
          <h2>Categories</h2>
          <p>Organise the menu your way.</p>
          <form className="inline-form" onSubmit={category}>
            <input
              name="category"
              required
              maxLength={60}
              aria-label="New category name"
              placeholder="e.g. Starters"
            />
            <button>Add</button>
          </form>
          {categories
            .sort((a, b) => a.order - b.order)
            .map((c) => (
              <div className="activity" key={c.id}>
                <strong>{c.name}</strong>
                <button
                  className="text-button"
                  onClick={() => {
                    const next = window.prompt("Category name", c.name);
                    if (next?.trim())
                      attempt(() =>
                        updateDoc(doc(db, path(u.uid, "categories"), c.id), {
                          name: next.trim(),
                        }),
                      );
                  }}
                >
                  Rename
                </button>
                <button
                  className="text-button danger"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Delete ${c.name}? Existing menu items will keep their other categories.`,
                      )
                    )
                      attempt(() =>
                        deleteDoc(doc(db, path(u.uid, "categories"), c.id)),
                      );
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
        </section>
        <section className="panel">
          <h2>Table services</h2>
          <p>Let guests ask for a little extra help.</p>
          {r.features.map((f: any) => (
            <label className="feature-toggle" key={f.id}>
              <span>
                {f.icon} {f.label}
              </span>
              <input
                type="checkbox"
                checked={f.enabled}
                onChange={() =>
                  attempt(() =>
                    updateDoc(doc(db, "restaurants", u.uid), {
                      features: r.features.map((x: any) =>
                        x.id === f.id ? { ...x, enabled: !x.enabled } : x,
                      ),
                    }),
                  )
                }
              />
            </label>
          ))}
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget,
                label = String(new FormData(form).get("feature")).trim();
              if (label)
                attempt(async () => {
                  await updateDoc(doc(db, "restaurants", u.uid), {
                    features: [
                      ...r.features,
                      {
                        id: crypto.randomUUID(),
                        label,
                        icon: "🔔",
                        enabled: true,
                      },
                    ],
                  });
                  form.reset();
                });
            }}
          >
            <input
              aria-label="Custom service name"
              name="feature"
              maxLength={60}
              required
              placeholder="Add a custom service"
            />
            <button>Add</button>
          </form>
        </section>
      </div>
      <div>
        <section className="panel qr-panel">
          <span className="eyebrow">YOUR MENU, ONE SCAN AWAY</span>
          <h2>Meet your menu QR.</h2>
          <p>Print it. Place it. Let guests take it from here.</p>
          <div id="restaurant-qr">
            <QRCodeCanvas value={url} size={240} marginSize={4} level="M" />
          </div>
          <label>
            Table number (optional)
            <input
              value={table}
              onChange={(e) =>
                setTable(e.target.value.replace(/[^a-zA-Z0-9-]/g, ""))
              }
              maxLength={12}
              placeholder="e.g. 5"
            />
          </label>
          <div className="qr-actions">
            <button onClick={download}>Download PNG</button>
            <button className="secondary" onClick={() => window.print()}>
              Print
            </button>
          </div>
          <Link
            target="_blank"
            to={`/r/${u.uid}${table ? `?table=${table}` : ""}`}
          >
            Open visitor menu ↗
          </Link>
          <input readOnly value={url} aria-label="Visitor menu URL" />
        </section>
        <section className="panel">
          <h2>Account</h2>
          <p>{u.email}</p>
          <button
            className="secondary"
            onClick={() =>
              attempt(
                () => sendPasswordResetEmail(auth, u.email!),
                "Password reset email sent",
              )
            }
          >
            Change password by email
          </button>
        </section>
      </div>
    </div>
  );
}
