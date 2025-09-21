"use client";

import { getDownloadURL, ref } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { useEffect, useState } from "react";

interface Props {
  storagePath: string;
}

export default function VideoPlayer({ storagePath }: Props) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const fileRef = ref(storage, storagePath);
      setUrl(await getDownloadURL(fileRef));
    };
    load();
  }, [storagePath]);

  if (!url) return <p>Loading video…</p>;

  return <video src={url} controls className="w-full rounded-xl" />;
}
