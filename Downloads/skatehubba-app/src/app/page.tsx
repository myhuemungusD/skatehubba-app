import type { Metadata } from "next";
import HomeClient from "./page.client";

export const metadata: Metadata = {
  title: "SkateHubba — Battle for S.K.8",
  description:
    "Create or join a S.K.8 lobby, record tricks live, and judge outcomes in real time with Firebase integrity.",
};

export default function Page() {
  return <HomeClient />;
}
