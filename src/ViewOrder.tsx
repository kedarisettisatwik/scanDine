import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import toast from "react-hot-toast";
import { guestDb } from "./firebase";
import { money, type Row } from "./data";

export function OrderLink({ orderId }: { orderId: string }) {
  const route = `/view-order/${encodeURIComponent(orderId)}`;
  const url = new URL(window.location.href);
  url.hash = route;
  return (
    <div className="order-link">
      <p>
        Save this link to view your order even after leaving the restaurant.
        Anyone with the link can view it.
      </p>
      <label>
        Order tracking URL
        <input readOnly value={url.href} onFocus={(e) => e.target.select()} />
      </label>
      <div className="order-link-actions">
        <Link className="button secondary" to={route}>
          View order →
        </Link>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url.href);
              toast.success("Order link copied");
            } catch {
              toast.error("Select the order URL and copy it manually.");
            }
          }}
        >
          Copy link
        </button>
      </div>
    </div>
  );
}

export default function ViewOrder() {
  const { orderId } = useParams();
  const [order, setOrder] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    setLoading(true);
    setOrder(null);
    setError("");
    if (!orderId) {
      setLoading(false);
      return;
    }
    return onSnapshot(
      doc(guestDb, "orderViews", orderId),
      (snapshot) => {
        setOrder(
          snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } : null,
        );
        setLoading(false);
      },
      () => {
        setError(
          "Unable to load your order. Please check your connection and try again.",
        );
        setLoading(false);
      },
    );
  }, [orderId]);
  if (loading) return <div className="loading">Loading your order…</div>;
  if (error)
    return (
      <div className="loading error" role="alert">
        {error}
      </div>
    );
  if (!order)
    return (
      <div className="loading">Order not found. Please check your link.</div>
    );
  return (
    <main className="visitor order-page">
      <header className="visitor-header">
        <div>
          <small>YOUR ORDER AT</small>
          <h1>{order.restaurantName}</h1>
        </div>
        <span className="powered">
          scan<b>dine</b>●
        </span>
      </header>
      <div className="visitor-content">
        <section className="your-order">
          <div className="section-title">
            <h2>Table {order.tableNumber}</h2>
            <span className={`badge ${order.status}`}>
              {order.status === "completed" ? "Completed" : "Still dining"}
            </span>
          </div>
          <p>Order #{order.id}</p>
          {order.items.map((item: any, index: number) => (
            <div className="line-item" key={index}>
              <div>
                <strong>
                  {item.qty} × {item.name}
                </strong>
                <p>
                  {money(item.price)} each{item.isAddon && " · Added later"}
                </p>
              </div>
              <strong>{money(item.qty * item.price)}</strong>
            </div>
          ))}
          <div className="total">
            <span>Order total</span>
            <strong>{money(order.total)}</strong>
          </div>
          <OrderLink orderId={order.id} />
        </section>
      </div>
    </main>
  );
}
