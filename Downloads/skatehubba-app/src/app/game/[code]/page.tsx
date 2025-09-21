import GameClient from "./page.client";

interface GamePageProps {
  params: { code: string };
}

export default function GamePage({ params }: GamePageProps) {
  return <GameClient code={params.code.toUpperCase()} />;
}
