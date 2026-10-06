import { saveClient } from "./clientData";
import ContactFooter from "./ContactFooter";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { signOut } from "firebase/auth";
import {
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { attempt, useOwner } from "./App";
import type { Row } from "./data";

export function useClient(uid: string) {
  const [client, setClient] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    setClient(null);
    setLoading(true);
    setError("");
    return onSnapshot(
      doc(db, "clients", uid),
      (s) => {
        setClient(s.exists() ? { ...s.data(), id: s.id } : null);
        setLoading(false);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      },
    );
  }, [uid]);
  return { client, loading, error };
}

export function ClientForm({ client }: { client: Row | null }) {
  const user = useOwner();
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const details = Object.fromEntries(
      ["clientName", "phone", "address", "location"].map((key) => [
        key,
        String(form.get(key) || "").trim(),
      ]),
    );
    if (Object.values(details).some((v) => !v)) return;
    if (
      client &&
      Object.entries(details).every(([key, value]) => client[key] === value)
    )
      return;
    setBusy(true);
    await attempt(
      () => saveClient(user.uid, details),
      "Details submitted for team review",
    );
    setBusy(false);
  }
  return (
    <form onSubmit={submit} key={client?.updatedAt?.toMillis?.() || "new"}>
      <label>
        Client name
        <input
          name="clientName"
          required
          maxLength={100}
          defaultValue={client?.clientName || ""}
        />
      </label>
      <label>
        Phone number
        <input
          name="phone"
          type="tel"
          required
          pattern="[+0-9 ()-]{7,25}"
          maxLength={25}
          defaultValue={client?.phone || ""}
        />
      </label>
      <label>
        Address
        <textarea
          name="address"
          required
          maxLength={500}
          defaultValue={client?.address || ""}
        />
      </label>
      <label>
        Location
        <input
          name="location"
          required
          maxLength={200}
          placeholder="City, area or location link"
          defaultValue={client?.location || ""}
        />
      </label>
      <button disabled={busy}>
        {busy
          ? "Submitting…"
          : client
            ? "Save client details"
            : "Submit for review"}
      </button>
    </form>
  );
}

export default function ClientAccess({ children }: { children: ReactNode }) {
  const user = useOwner();
  const { client, loading, error } = useClient(user.uid);
  if (loading) return <div className="loading">Checking dashboard access…</div>;
  if (client?.approved === true) return children;
  return (
    <main className="platform-page">
      <section className="panel onboarding-card">
        <h1>
          {client
            ? "Waiting for team to review and allow access"
            : "Fill out your details"}
        </h1>
        <p>
          {client
            ? "Your details have been submitted. Your dashboard will open here once the team approves access. You can update your details below."
            : "Tell us about yourself so our team can review your restaurant account."}
        </p>
        {error ? (
          <div className="error" role="alert">
            {error}
          </div>
        ) : (
          <ClientForm client={client} />
        )}
        <button
          className="text-button"
          onClick={() => attempt(() => signOut(auth))}
        >
          Sign out
        </button>
      </section>
      <ContactFooter />
    </main>
  );
}
