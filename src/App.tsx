import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  type FormEvent,
} from "react";
import {
  Routes,
  Route,
  Navigate,
  Link,
  Outlet,
  useNavigate,
  useLocation,
} from "react-router-dom";
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  type User,
} from "firebase/auth";
import {
  doc,
  setDoc,
  serverTimestamp,
  updateDoc,
  collection,
  onSnapshot,
} from "firebase/firestore";
import toast from "react-hot-toast";
import {
  Bell,
  UtensilsCrossed,
  LayoutDashboard,
  BookOpen,
  Settings,
  Volume2,
  LogOut,
  Users,
} from "lucide-react";
import { auth, db } from "./firebase";
import { features, useRows, useRestaurant, millis } from "./data";
import { Orders, OrderDetail, Menu, Profile, Notifications } from "./admin";
import Visitor from "./Visitor";
import ViewOrder from "./ViewOrder";
import ClientAccess from "./ClientAccess";
import ContactFooter from "./ContactFooter";
import Tables from "./Tables";
import SuperAdmin from "./SuperAdmin";
const AuthContext = createContext<User | null>(null);
export const useOwner = () => useContext(AuthContext)!;
export const attempt = async (fn: () => Promise<unknown>, success?: string) => {
  try {
    await fn();
    if (success) toast.success(success);
  } catch (e) {
    toast.error(
      e instanceof Error
        ? e.message
        : "Something went wrong. Please try again.",
    );
  }
};
const alertAudio = new Audio(`${import.meta.env.BASE_URL}notification.wav`);
export default function App() {
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false);
  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        setReady(true);
      }),
    [],
  );
  if (!ready) return <div className="loading">Opening ScanDine…</div>;
  return (
    <AuthContext.Provider value={user}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/super-admin" element={<SuperAdmin />} />
        <Route path="/admin/login" element={<AuthPage mode="login" />} />
        <Route path="/admin/signup" element={<AuthPage mode="signup" />} />
        <Route
          path="/admin/forgot-password"
          element={<AuthPage mode="reset" />}
        />
        <Route
          path="/admin"
          element={
            user && !user.isAnonymous ? (
              <ClientAccess>
                <AdminShell />
              </ClientAccess>
            ) : (
              <Navigate to="/admin/login" replace />
            )
          }
        >
          <Route index element={<Orders />} />
          <Route path="orders/:orderId" element={<OrderDetail />} />
          <Route path="menu" element={<Menu />} />
          <Route path="tables" element={<Tables />} />
          <Route path="profile" element={<Profile />} />
          <Route path="notifications" element={<Notifications />} />
        </Route>
        <Route path="/r/:restaurantId" element={<Visitor />} />
        <Route path="/view-order/:orderId" element={<ViewOrder />} />
        <Route
          path="*"
          element={
            <div className="loading">
              Page not found. <Link to="/">Go home</Link>
            </div>
          }
        />
      </Routes>
    </AuthContext.Provider>
  );
}
function Brand() {
  return (
    <Link className="brand" to="/">
      <span className="brand-icon">
        <UtensilsCrossed size={23} />
      </span>
      scan<span>dine</span>
      <i>●</i>
    </Link>
  );
}
function Landing() {
  return (
    <div className="landing">
      <header>
        <Brand />
        <Link className="button secondary" to="/admin/login">
          Owner login →
        </Link>
      </header>
      <main>
        <span className="eyebrow">LESS WAITING. MORE DINING.</span>
        <h1>
          A better meal
          <br />
          starts with a scan.
        </h1>
        <p>
          Your menu, orders, and table requests.
          <br />
          One simple place to keep service moving.
        </p>
        <Link className="button" to="/admin/signup">
          Set up your restaurant →
        </Link>
        <div className="steps">
          <span>01 · Scan the menu</span>
          <span>02 · Pick your favourites</span>
          <span>03 · Enjoy your meal</span>
        </div>
      </main>
      <div className="landing-art">
        <span>TABLE SERVICE, SIMPLIFIED</span>
        <UtensilsCrossed size={100} />
        <h2>
          Scan.
          <br />
          Dine.
          <br />
          <em>Done.</em>
        </h2>
      </div>
    </div>
  );
}
function AuthPage({ mode }: { mode: "login" | "signup" | "reset" }) {
  const [userBusy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email")),
      password = String(f.get("password"));
    if (mode === "signup" && password !== f.get("confirm"))
      return toast.error("Passwords do not match");
    setBusy(true);
    await attempt(
      async () => {
        if (mode === "reset") {
          await sendPasswordResetEmail(auth, email);
          toast.success("Password reset email sent");
          return;
        }
        if (mode === "signup") {
          const c = await createUserWithEmailAndPassword(auth, email, password);
          await setDoc(doc(db, "restaurants", c.user.uid), {
            name: String(f.get("name")).trim(),
            ownerUid: c.user.uid,
            logoUrl: "",
            bannerImages: [],
            features,
            createdAt: serverTimestamp(),
          });
          navigate("/admin");
        } else {
          await signInWithEmailAndPassword(auth, email, password);
          navigate(
            location.state?.returnTo === "/super-admin"
              ? "/super-admin"
              : "/admin",
          );
        }
      },
      mode === "reset" ? undefined : "Welcome to ScanDine",
    );
    setBusy(false);
  }
  return (
    <div className="auth-page">
      <div className="auth-story">
        <Brand />
        <h1>
          Great food.
          <br />
          Effortless service.
        </h1>
        <p>Give every table a little more attention.</p>
        <span>SCANDINE · BUILT FOR YOUR RESTAURANT</span>
      </div>
      <section className="auth-card">
        <span className="eyebrow">WELCOME TO SCANDINE</span>
        <h2>
          {mode === "signup"
            ? "Your next chapter starts here."
            : mode === "reset"
              ? "Let’s get you back in."
              : "Welcome back."}
        </h2>
        <p>
          {mode === "signup"
            ? "Create your restaurant account."
            : mode === "reset"
              ? "We’ll email you a password reset link."
              : "Sign in to manage your restaurant."}
        </p>
        <form onSubmit={submit}>
          {mode === "signup" && (
            <label>
              Restaurant name
              <input
                name="name"
                required
                maxLength={100}
                placeholder="e.g. The Green Table"
              />
            </label>
          )}
          <label>
            Email address
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@restaurant.com"
            />
          </label>
          {mode !== "reset" && (
            <label>
              Password
              <input
                name="password"
                type="password"
                required
                minLength={6}
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
              />
            </label>
          )}
          {mode === "signup" && (
            <label>
              Confirm password
              <input name="confirm" type="password" required minLength={6} />
            </label>
          )}
          <button disabled={userBusy}>
            {userBusy
              ? "Please wait…"
              : mode === "signup"
                ? "Create account →"
                : mode === "reset"
                  ? "Send reset link"
                  : "Sign in →"}
          </button>
        </form>
        <div className="auth-links">
          <Link to={mode === "signup" ? "/admin/login" : "/admin/signup"}>
            {mode === "signup"
              ? "Already have an account? Sign in"
              : "New here? Create an account"}
          </Link>
          <Link
            to={mode === "reset" ? "/admin/login" : "/admin/forgot-password"}
          >
            {mode === "reset" ? "Back to login" : "Forgot password?"}
          </Link>
        </div>
        <ContactFooter />
      </section>
    </div>
  );
}
function AdminShell() {
  const user = useOwner(),
    { restaurant, loading, error } = useRestaurant(user.uid);
  const { rows: notifications, error: notifyError } = useRows(
    user.uid,
    "notifications",
  );
  const [sound, setSound] = useState(false);
  const soundRef = useRef(false);
  soundRef.current = sound;
  const location = useLocation();
  useEffect(() => {
    let initialized = false;
    let seen = new Set<string>();
    const stop = onSnapshot(
      collection(db, "restaurants/" + user.uid + "/notifications"),
      (s) => {
        if (!initialized) {
          seen = new Set(s.docs.map((d) => d.id));
          initialized = true;
          return;
        }
        for (const d of s.docs) {
          if (!seen.has(d.id)) {
            seen.add(d.id);
            const n = d.data();
            toast("Table " + n.tableNumber + " — " + n.message, { icon: "🔔" });
            if (soundRef.current) {
              alertAudio.currentTime = 0;
              alertAudio.play().catch(() => {
                setSound(false);
                toast.error("Tap Enable sound to allow alerts");
              });
            }
          }
        }
      },
      (e) => toast.error(e.message),
    );
    return stop;
  }, [user.uid]);
  async function enable() {
    try {
      alertAudio.currentTime = 0;
      await alertAudio.play();
      setSound(true);
      toast.success("Sound alerts enabled for this session");
    } catch {
      toast.error("Could not play sound. Check browser permissions.");
    }
  }
  const count = notifications.filter((n) => !n.read).length;
  const title = location.pathname.includes("tables")
    ? "Tables"
    : location.pathname.includes("notifications")
      ? "Notifications"
      : location.pathname.includes("profile")
        ? "Restaurant profile"
        : location.pathname.includes("menu")
          ? "Menu management"
          : location.pathname.includes("/orders/")
            ? "Order details"
            : "Orders overview";
  return (
    <div className="dashboard">
      <aside className="sidebar">
        <Brand />
        <small>RESTAURANT WORKSPACE</small>
        <nav>
          <Nav
            icon={<LayoutDashboard size={19} />}
            to="/admin"
            label="Orders"
          />
          <Nav icon={<BookOpen size={19} />} to="/admin/menu" label="Menu" />
          <Nav icon={<Users size={19} />} to="/admin/tables" label="Tables" />
          <Nav
            icon={<Settings size={19} />}
            to="/admin/profile"
            label="Profile"
          />
        </nav>
        <div className="sidebar-bottom">
          <div className="live-dot">Live service dashboard</div>
          <p>Scan. Dine. Done.</p>
          <button
            className="text-button"
            onClick={() => attempt(() => signOut(auth))}
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>
      <div className="dashboard-main">
        <header className="topbar">
          <div>
            <small>YOUR RESTAURANT</small>
            <strong>{restaurant?.name || "ScanDine"}</strong>
          </div>
          <div className="top-actions">
            <button
              className={sound ? "sound enabled" : "sound"}
              onClick={enable}
            >
              <Volume2 size={18} />
              <span>{sound ? "Sound enabled" : "Enable sound"}</span>
            </button>
            <Link
              aria-label={`${count} unread notifications`}
              className="bell"
              to="/admin/notifications"
            >
              <Bell size={21} />
              {count > 0 && <b>{count}</b>}
            </Link>
            <span className="avatar">{(restaurant?.name || "S")[0]}</span>
          </div>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">KEEP SERVICE MOVING</span>
              <h1>{title}</h1>
            </div>
            <span className="date-label">
              {new Date().toLocaleDateString("en-IN", {
                weekday: "short",
                day: "numeric",
                month: "long",
              })}
            </span>
          </div>
          {error || notifyError ? (
            <div className="error">{error || notifyError}</div>
          ) : loading ? (
            <div className="empty">Loading restaurant…</div>
          ) : restaurant ? (
            <Outlet />
          ) : (
            <section className="panel">
              <h2>Finish setting up your restaurant</h2>
              <p>Your account exists, but its restaurant profile is missing.</p>
              <button
                onClick={() =>
                  attempt(
                    () =>
                      setDoc(doc(db, "restaurants", user.uid), {
                        ownerUid: user.uid,
                        name: "My restaurant",
                        logoUrl: "",
                        bannerImages: [],
                        features,
                        createdAt: serverTimestamp(),
                      }),
                    "Restaurant created",
                  )
                }
              >
                Create restaurant profile
              </button>
            </section>
          )}
        </main>
        <ContactFooter />
      </div>
    </div>
  );
}
function Nav({
  to,
  label,
  icon,
}: {
  to: string;
  label: string;
  icon: React.ReactNode;
}) {
  const l = useLocation();
  return (
    <Link
      className={
        (to === "/admin" ? l.pathname === to : l.pathname.startsWith(to))
          ? "nav active"
          : "nav"
      }
      to={to}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}
