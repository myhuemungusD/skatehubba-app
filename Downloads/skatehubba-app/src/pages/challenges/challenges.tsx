import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface Challenge {
  id: string;
  challengerUid: string;
  opponentUid: string;
  trick: string;
  status: string;
}

export default function Challenges() {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchChallenges() {
      try {
        const querySnapshot = await getDocs(collection(db, "challenges"));
        const data: Challenge[] = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Challenge),
        }));
        setChallenges(data);
      } catch (err) {
        console.error("Error fetching challenges:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchChallenges();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p className="text-gray-600">Loading challenges...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center bg-gray-100 p-6">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">SkateHubba Challenges</h1>
      {challenges.length === 0 ? (
        <p className="text-gray-600">No challenges yet. Start one!</p>
      ) : (
        <ul className="w-full max-w-lg space-y-4">
          {challenges.map((ch) => (
            <li
              key={ch.id}
              className="p-4 bg-white rounded shadow hover:shadow-md"
            >
              <p>
                <span className="font-semibold">{ch.challengerUid}</span> vs{" "}
                <span className="font-semibold">{ch.opponentUid}</span>
              </p>
              <p>Trick: {ch.trick}</p>
              <p>Status: {ch.status}</p>
            </li>
          ))}
        </ul>
      )}
      <a
        href="/"
        className="mt-6 px-4 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700"
      >
        Back to Home
      </a>
    </div>
  );
}
