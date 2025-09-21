import { useState } from "react";
import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import Link from "next/link";

export default function ChallengesHome() {
  const [joinId, setJoinId] = useState("");

  const createChallenge = async () => {
    const user = auth.currentUser;
    if (!user) return alert("Not signed in");
    await addDoc(collection(db, "challenges"), {
      challengerUid: user.uid,
      opponentUid: null,
      trick: "",
      status: "pending",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      expiresAt: serverTimestamp(),
      challengerClipId: null,
      opponentClipId: null,
      winnerUid: null
    }).then((ref) => alert(`Challenge created: ${ref.id}`)).catch((e) => alert(e.message));
  };

  const joinChallenge = async () => {
    const user = auth.currentUser;
    if (!user) return alert("Not signed in");
    if (!joinId) return alert("Enter a challenge ID");
    const ref = doc(db, "challenges", joinId);
    await updateDoc(ref, { opponentUid: user.uid, updatedAt: serverTimestamp() })
      .then(() => alert("Joined challenge"))
      .catch((e) => alert(e.message));
  };

  return (
    <div className="min-h-screen p-6 bg-gray-100">
      <div className="max-w-xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold">Challenges</h1>
        <div className="p-4 bg-white rounded shadow">
          <h2 className="font-semibold mb-2">Create</h2>
          <button onClick={createChallenge} className="px-4 py-2 bg-blue-600 text-white rounded">Create Challenge</button>
        </div>
        <div className="p-4 bg-white rounded shadow">
          <h2 className="font-semibold mb-2">Join</h2>
          <input className="border rounded px-3 py-2 mr-2" placeholder="Challenge ID" value={joinId} onChange={(e) => setJoinId(e.target.value)} />
          <button onClick={joinChallenge} className="px-4 py-2 bg-green-600 text-white rounded">Join</button>
        </div>
        <div className="p-4 bg-white rounded shadow">
          <Link className="text-blue-700 underline" href="/challenges/mine">My Challenges</Link>
        </div>
      </div>
    </div>
  );
}
