import { useRouter } from "next/router";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useEffect, useState } from "react";

export default function ChallengeDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!id) return;
    const ref = doc(db, "challenges", id as string);
    const unsub = onSnapshot(ref, (snap) => setData({ id: snap.id, ...snap.data() }));
    return () => unsub();
  }, [id]);

  if (!id) return <div className="p-6">Loading…</div>;
  if (!data) return <div className="p-6">No data</div>;

  return (
    <div className="min-h-screen p-6 bg-gray-100">
      <div className="max-w-xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold">Challenge {data.id}</h1>
        <div className="p-4 bg-white rounded shadow">
          <div><b>Status:</b> {data.status}</div>
          <div><b>Challenger:</b> {data.challengerUid || "?"}</div>
          <div><b>Opponent:</b> {data.opponentUid || "(open)"} </div>
          <div><b>Winner:</b> {data.winnerUid || "-"}</div>
        </div>
      </div>
    </div>
  );
}