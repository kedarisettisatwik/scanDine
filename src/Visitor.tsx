import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { signInAnonymously } from "firebase/auth";
import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import toast from "react-hot-toast";
import {
  ShoppingBag,
  UtensilsCrossed,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import { guestAuth, guestDb, guestReady } from "./firebase";
import {
  useRestaurant,
  useRows,
  where,
  path,
  money,
  placeOrder,
  type Row,
} from "./data";
import { attempt } from "./App";
import { OrderLink } from "./ViewOrder";
import {
  joinTable,
  useJoinRequest,
  useTableOccupancy,
  sessionIsCurrent,
  assertTableAccess,
  type TableAccess,
} from "./tableAccess";
function Gallery({
  images,
  name,
  banner = false,
}: {
  images: string[];
  name: string;
  banner?: boolean;
}) {
  const [index, setIndex] = useState(0),
    [paused, setPaused] = useState(0);
  const start = useRef(0);
  useEffect(() => {
    if (!banner || images.length < 2) return;
    const timer = setInterval(() => {
      if (Date.now() > paused) setIndex((i) => (i + 1) % images.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [images.length, banner, paused]);
  function move(d: number) {
    setIndex((i) => (i + d + images.length) % images.length);
    setPaused(Date.now() + 10000);
  }
  return (
    <div
      className={banner ? "banner-gallery" : "dish-gallery"}
      onTouchStart={(e) => (start.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        const d = e.changedTouches[0].clientX - start.current;
        if (Math.abs(d) > 40) move(d < 0 ? 1 : -1);
      }}
    >
      {images.length ? (
        <img src={images[index % images.length]} alt={name} />
      ) : (
        <div className="food-placeholder">
          <UtensilsCrossed size={40} />
        </div>
      )}
      {images.length > 1 && (
        <>
          <button
            className="gallery-prev"
            aria-label="Previous image"
            onClick={() => move(-1)}
          >
            <ChevronLeft size={17} />
          </button>
          <button
            className="gallery-next"
            aria-label="Next image"
            onClick={() => move(1)}
          >
            <ChevronRight size={17} />
          </button>
          <div className="dots">
            {images.map((_, i) => (
              <button
                aria-label={`Show image ${i + 1}`}
                key={i}
                className={i === index ? "active" : ""}
                onClick={() => {
                  setIndex(i);
                  setPaused(Date.now() + 10000);
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
export default function Visitor() {
  const { restaurantId: rid } = useParams();
  const [params] = useSearchParams();
  const { restaurant: r, loading, error } = useRestaurant(rid, guestDb),
    menu = useRows(rid, "menuItems", guestDb),
    { rows: categories } = useRows(rid, "categories", guestDb);
  const [uid, setUid] = useState(""),
    [authError, setAuthError] = useState(""),
    [table, setTable] = useState(
      () => params.get("table") || sessionStorage.getItem(`table-${rid}`) || "",
    ),
    [type, setType] = useState("all"),
    [category, setCategory] = useState("all"),
    [search, setSearch] = useState(""),
    [cart, setCart] = useState<Record<string, number>>({}),
    [cartOpen, setCartOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false),
    [access, setAccess] = useState<TableAccess | null>(() => {
      try {
        return JSON.parse(sessionStorage.getItem(`access-${rid}`) || "null");
      } catch {
        return null;
      }
    });
  const {
    occupancy,
    loading: tableLoading,
    error: tableError,
  } = useTableOccupancy(guestDb, rid, table, uid);
  const verified =
    !!access &&
    access.tableNumber === table &&
    sessionIsCurrent(occupancy, access, uid);
  const joinRequest = useJoinRequest(guestDb, rid, table, uid);
  const awaitingApproval =
    !!access &&
    !verified &&
    joinRequest?.sessionId === access.sessionId &&
    joinRequest.status === "pending";
  useEffect(() => {
    if (
      access &&
      joinRequest?.sessionId === access.sessionId &&
      joinRequest.status === "rejected"
    ) {
      setAccess(null);
      sessionStorage.removeItem(`access-${rid}`);
      toast.error(
        "The staff declined this table request. Please speak to them.",
      );
    }
  }, [access, joinRequest, rid]);
  const wasVerified = useRef(false);
  useEffect(() => {
    if (tableLoading) return;
    if (wasVerified.current && !verified) {
      setAccess(null);
      setCart({});
      setCartOpen(false);
      sessionStorage.removeItem(`access-${rid}`);
      toast(
        "Your dining session has ended or the table was reset. Please join again.",
        { icon: "🔒" },
      );
    }
    wasVerified.current = verified;
  }, [verified, tableLoading, rid]);
  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    if (!uid)
      return toast.error(
        "Guest connection is not ready. Please refresh and try again.",
      );
    setVerifying(true);
    await attempt(async () => {
      const next = await joinTable(guestDb, rid!, uid, table);
      setAccess(next);
      sessionStorage.setItem(`access-${rid}`, JSON.stringify(next));
    }, "Table request sent. Please wait for staff approval.");
    setVerifying(false);
  }
  const orders = useRows(uid ? rid : undefined, "orders", guestDb, [
      where("guestUid", "==", uid),
    ]),
    requests = useRows(uid ? rid : undefined, "requests", guestDb, [
      where("guestUid", "==", uid),
    ]);
  const current = orders.rows.find(
    (o) => o.tableNumber === table && o.status === "pending",
  );
  useEffect(() => {
    let active = true;
    guestReady
      .then(
        () =>
          guestAuth.currentUser ||
          signInAnonymously(guestAuth).then((c) => c.user),
      )
      .then((u) => {
        if (active) setUid(u.uid);
      })
      .catch((e) => {
        if (active) setAuthError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    sessionStorage.setItem(`table-${rid}`, table);
  }, [table, rid]);
  const selected = Object.entries(cart).flatMap(([id, qty]) => {
    const item = menu.rows.find((i) => i.id === id);
    return item && qty > 0
      ? [
          {
            itemId: id,
            name: item.name,
            price: item.price,
            type: item.type,
            qty,
          },
        ]
      : [];
  });
  const quantity = selected.reduce((n, i) => n + i.qty, 0),
    total = selected.reduce((n, i) => n + i.price * i.qty, 0);
  function change(id: string, delta: number) {
    setCart((c) => ({
      ...c,
      [id]: Math.min(99, Math.max(0, (c[id] || 0) + delta)),
    }));
  }
  async function order() {
    if (!verified || !access)
      return toast.error(
        "Enter your table number and request staff approval first",
      );
    if (!table.trim()) return toast.error("Please enter your table number");
    if (!uid) return toast.error("Connecting your session. Please try again.");
    if (!selected.length) return;
    setBusy(true);
    await attempt(
      async () => {
        await placeOrder(guestDb, rid!, uid, table, selected, access);
        setCart({});
        setCartOpen(false);
      },
      current
        ? "Extra items sent to the kitchen"
        : "Your order is on its way to the kitchen",
    );
    setBusy(false);
  }
  async function request(f: any) {
    if (!verified || !access)
      return toast.error(
        "Enter your table number and request staff approval first",
      );
    if (!table.trim()) return toast.error("Please enter your table number");
    if (!uid) return toast.error("Connecting your session. Please try again.");
    setBusy(true);
    await attempt(async () => {
      const ref = doc(
          guestDb,
          path(rid!, "requests"),
          `${table}_${uid}_${f.id}`,
        ),
        lock = doc(guestDb, path(rid!, "serviceLocks"), `${table}_${f.id}`),
        n = doc(collection(guestDb, path(rid!, "notifications")));
      await runTransaction(guestDb, async (tx) => {
        await assertTableAccess(tx, guestDb, rid!, uid, table, access);
        const lockSnap = await tx.get(lock);
        if (lockSnap.exists())
          throw Error("This request is already with the staff");
        const old = await tx.get(ref);
        if (old.exists() && old.data().status === "open")
          throw Error("This request is already with the staff");
        tx.set(ref, {
          orderId: current?.id || null,
          guestUid: uid,
          sessionId: access.sessionId,
          tableNumber: table,
          featureId: f.id,
          featureIcon: f.icon,
          label: f.label,
          status: "open",
          createdAt: serverTimestamp(),
        });
        tx.set(lock, { guestUid: uid, requestId: ref.id });
        tx.set(n, {
          type: "request",
          requestId: ref.id,
          orderId: current?.id || null,
          guestUid: uid,
          tableNumber: table,
          message: f.label,
          read: false,
          createdAt: serverTimestamp(),
        });
      });
    }, "We’ve informed the staff 👍");
    setBusy(false);
  }
  if (error) return <div className="loading error">{error}</div>;
  if (loading) return <div className="loading">Preparing your menu…</div>;
  if (!r)
    return (
      <div className="loading">
        Restaurant not found. <Link to="/">Go home</Link>
      </div>
    );
  return (
    <div className="visitor">
      <header className="visitor-header">
        <div className="restaurant-logo">
          {r.logoUrl ? (
            <img src={r.logoUrl} alt="" />
          ) : (
            <UtensilsCrossed size={25} />
          )}
        </div>
        <div>
          <small>WELCOME TO</small>
          <h1>{r.name}</h1>
        </div>
        <span className="powered">
          scan<b>dine</b>●
        </span>
      </header>
      {r.bannerImages.length > 0 ? (
        <Gallery images={r.bannerImages} name={`${r.name} banner`} banner />
      ) : (
        <div className="visitor-hero">
          <span>FRESHLY MADE. HAPPILY SHARED.</span>
          <h2>
            Something delicious
            <br />
            is waiting for you.
          </h2>
          <p>Take your time. Find your favourite.</p>
        </div>
      )}
      <div className="visitor-content">
        <label className="table-input">
          <span>
            YOUR TABLE<span>Where shall we bring your meal?</span>
          </span>
          <input
            aria-label="Table number"
            placeholder="e.g. 05"
            value={table}
            maxLength={12}
            onChange={(e) => {
              wasVerified.current = false;
              setTable(e.target.value.replace(/[^a-zA-Z0-9-]/g, ""));
              setAccess(null);
              sessionStorage.removeItem(`access-${rid}`);
            }}
          />
        </label>
        <form className="table-join-form" onSubmit={unlock}>
          {verified ? (
            <div className="table-verified">
              ✓ Table {table} approved · Ready to order
            </div>
          ) : (
            <>
              <button
                disabled={verifying || !uid || !table || awaitingApproval}
              >
                {verifying
                  ? "Sending…"
                  : awaitingApproval
                    ? "Waiting for staff approval…"
                    : "Request table approval"}
              </button>
              <p>
                {awaitingApproval
                  ? "Your request has been sent. Staff will confirm your table shortly."
                  : "Enter your table number and ask the staff to approve your dining session."}
              </p>
            </>
          )}
          {tableError && <div className="error">{tableError}</div>}
        </form>
        {authError && (
          <div className="error">Guest connection failed: {authError}</div>
        )}
        {(orders.error || requests.error) && (
          <div className="error">{orders.error || requests.error}</div>
        )}
        <div className="visitor-section-title">
          <h2>Explore the menu</h2>
          <span>{menu.rows.filter((i) => i.available).length} dishes</span>
        </div>
        <div className="search">
          <Search size={18} />
          <input
            aria-label="Search dishes"
            placeholder="Find something you’ll love"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="chips">
          {["all", "veg", "nonveg"].map((t) => (
            <button
              key={t}
              className={type === t ? "chip selected" : "chip"}
              onClick={() => setType(t)}
            >
              {t === "all"
                ? "All dishes"
                : t === "veg"
                  ? "🟢 Veg"
                  : "🔴 Non-veg"}
            </button>
          ))}
        </div>
        <div className="chips category-chips">
          {[
            { id: "all", name: "Everything" },
            ...categories.sort((a, b) => a.order - b.order),
          ].map((c) => (
            <button
              key={c.id}
              className={category === c.id ? "chip selected" : "chip"}
              onClick={() => setCategory(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
        {menu.error && <div className="error">{menu.error}</div>}
        {menu.loading && <p>Loading menu…</p>}
        <div className="visitor-menu">
          {menu.rows
            .filter(
              (i) =>
                i.available &&
                (type === "all" || i.type === type) &&
                (category === "all" || i.categoryIds.includes(category)) &&
                i.name.toLowerCase().includes(search.toLowerCase()),
            )
            .map((i) => (
              <article className="visitor-dish" key={i.id}>
                <Gallery images={i.images} name={i.name} />
                <div className="dish-body">
                  <span className={`food-dot ${i.type}`}>●</span>
                  <h3>{i.name}</h3>
                  <p>{i.description || "Made fresh, just for you."}</p>
                  <div>
                    <strong>{money(i.price)}</strong>
                    {cart[i.id] > 0 ? (
                      <div className="qty">
                        <button
                          aria-label={`Remove one ${i.name}`}
                          onClick={() => change(i.id, -1)}
                        >
                          −
                        </button>
                        <span>{cart[i.id]}</span>
                        <button
                          aria-label={`Add one ${i.name}`}
                          onClick={() => change(i.id, 1)}
                        >
                          +
                        </button>
                      </div>
                    ) : (
                      <button
                        className="secondary small"
                        onClick={() => change(i.id, 1)}
                      >
                        ADD +
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
        </div>
        {!menu.loading &&
          !menu.error &&
          menu.rows.filter(
            (i) =>
              i.available &&
              (type === "all" || i.type === type) &&
              (category === "all" || i.categoryIds.includes(category)) &&
              i.name.toLowerCase().includes(search.toLowerCase()),
          ).length === 0 && (
            <div className="empty">
              <h3>No dishes here yet</h3>
              <p>Try another filter or check with the staff.</p>
            </div>
          )}
        {orders.rows.some((o) => o.trackingAvailable) && (
          <section className="your-order">
            <h2>Your order links</h2>
            {orders.rows
              .filter((o) => o.trackingAvailable)
              .sort(
                (a, b) =>
                  (b.createdAt?.toMillis?.() || 0) -
                  (a.createdAt?.toMillis?.() || 0),
              )
              .map((o) => (
                <div key={o.id}>
                  <h3>
                    Table {o.tableNumber} ·{" "}
                    {o.status === "completed" ? "Completed" : "Still dining"}
                  </h3>
                  <OrderLink orderId={o.id} />
                </div>
              ))}
          </section>
        )}
        {current && (
          <section className="your-order">
            <div className="section-title">
              <h2>Your order</h2>
              <span className="badge pending">Still dining</span>
            </div>
            {current.items.map((i: any, j: number) => (
              <div className="line-item" key={j}>
                <span>
                  {i.qty} × {i.name}
                  {i.isAddon && <small> · Added later</small>}
                </span>
                <strong>{money(i.qty * i.price)}</strong>
              </div>
            ))}
            <div className="total">
              <span>Order total</span>
              <strong>{money(current.total)}</strong>
            </div>
          </section>
        )}
        <section className="services">
          <h2>A little extra help?</h2>
          <p>Tap a service and we’ll let the staff know.</p>
          <div>
            {r.features
              .filter((f: any) => f.enabled)
              .map((f: any) => {
                const pending = requests.rows.some(
                  (q) =>
                    q.featureId === f.id &&
                    q.tableNumber === table &&
                    q.status === "open",
                );
                return (
                  <button
                    className={pending ? "service requested" : "service"}
                    disabled={busy || pending || !verified}
                    onClick={() => request(f)}
                    key={f.id}
                  >
                    <span>{f.icon}</span>
                    {pending ? "Requested ✓" : f.label}
                  </button>
                );
              })}
          </div>
        </section>
        <footer>
          Made for good meals. Powered by <b>ScanDine</b>.
        </footer>
      </div>
      {quantity > 0 && (
        <button className="cart-bar" onClick={() => setCartOpen(true)}>
          <span>
            <ShoppingBag size={20} />
            {quantity} items · {money(total)}
          </span>
          <span>View cart →</span>
        </button>
      )}
      {cartOpen && (
        <div className="modal-backdrop">
          <section
            className="modal cart-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Review your cart"
          >
            <div className="section-title">
              <h2>Your next delicious bite.</h2>
              <button
                className="text-button"
                onClick={() => setCartOpen(false)}
              >
                Close ✕
              </button>
            </div>
            <p>Table {table || "—"}</p>
            {selected.map((i) => (
              <div className="line-item" key={i.itemId}>
                <div>
                  <strong>{i.name}</strong>
                  <p>{money(i.price)} each</p>
                </div>
                <div className="qty">
                  <button onClick={() => change(i.itemId, -1)}>−</button>
                  {i.qty}
                  <button onClick={() => change(i.itemId, 1)}>+</button>
                </div>
                <strong>{money(i.qty * i.price)}</strong>
              </div>
            ))}
            <div className="total">
              <span>Total</span>
              <strong>{money(total)}</strong>
            </div>
            {current && (
              <p>
                Your earlier order stays unchanged. These items will be added to
                it.
              </p>
            )}
            {!verified && (
              <p>
                Please request staff approval for your table before ordering.
              </p>
            )}
            <button
              disabled={busy || !quantity || !uid || !verified}
              onClick={order}
            >
              {busy ? "Sending…" : current ? "Add to my order" : "Place order"}{" "}
              →
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
