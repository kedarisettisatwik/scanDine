import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
export async function saveClient(uid: string, details: Record<string, string>) {
  const ref = doc(db, "clients", uid);
  await runTransaction(db, async (tx) => {
    const old = await tx.get(ref);
    const fields = {
      ...details,
      updatedAt: serverTimestamp(),
      reviewPending: true,
    };
    if (old.exists()) tx.update(ref, fields);
    else
      tx.set(ref, { ...fields, approved: false, createdAt: serverTimestamp() });
  });
}
