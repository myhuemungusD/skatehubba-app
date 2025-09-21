"use client";

import { useState } from "react";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { storage, db } from "@/lib/firebase/client";
import { buildChallengeClipPath, UploadMetaSchema } from "@/lib/validators";

interface Props {
  gameId: string;
  uid: string;
  playerKey: "A" | "B"; // which side this player is
}

export default function VideoUploader({ gameId, uid, playerKey }: Props) {
  const [progress, setProgress] = useState(0);

  const handleUpload = async (file: File) => {
    UploadMetaSchema.parse({ sizeBytes: file.size, mimeType: file.type });

    const path = buildChallengeClipPath({
      gameId,
      uid,
      fileName: file.name,
    });

    const storageRef = ref(storage, path);
    const task = uploadBytesResumable(storageRef, file);

    task.on("state_changed", (snap) => {
      setProgress((snap.bytesTransferred / snap.totalBytes) * 100);
    });

    task.on("error", (err) => console.error(err));

    task.on("complete", async () => {
      const url = await getDownloadURL(storageRef);
      await updateDoc(doc(db, "games", gameId), {
        [`players.${playerKey}.lastClipPath`]: path,
        updatedAt: serverTimestamp(),
      });
      console.log("Uploaded", url);
    });
  };

  return (
    <div className="space-y-2">
      <input
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUpload(f);
        }}
      />
      {progress > 0 && <p>Upload: {progress.toFixed(0)}%</p>}
    </div>
  );
}
