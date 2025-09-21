import Link from "next/link";
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export default function MyChallenges() {
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    const u = auth.currentUser;
    if (!u) return;
    const q1 = query(collection(db, "challenges"), where("challengerUid", "==", u.uid));
    const q2 = query(collection(db, "challenges"), where("opponentUid", "==", u.uid));
    const unsub1 = onSnapshot(q1, (snap) => setItems((prev) => {
      const a = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const map = new Map((prev||[]).map(i => [i.id, i]));
      a.forEach(i => map.set(i.id, i));
      return Array.from(map.values());
    }));
    const unsub2 = onSnapshot(q2, (snap) => setItems((prev) => {
      const b = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const map = new Map((prev||[]).map(i => [i.id, i]));
      b.forEach(i => map.set(i.id, i));
      return Array.from(map.values());
    }));
    return () => { unsub1(); unsub2(); };
  }, []);

  return (
    <div className="min-h-screen p-6 bg-gray-100">
      <div className="max-w-xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold">My Challenges</h1>
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.id} className="p-3 bg-white rounded shadow flex justify-between">
              <div>
                <div className="font-semibold">{it.status}</div>
                <div className="text-sm text-gray-600">C: {it.challengerUid || "?"} • O: {it.opponentUid || "(open)"}</div>
              </div>
              <Link className="text-blue-700 underline" href={`/challenges/${it.id}`}>Open</Link>
            </li>
          ))}
          {items.length === 0 && <li>No challenges yet.</li>}
        </ul>
      </div>
    </div>
  );
}