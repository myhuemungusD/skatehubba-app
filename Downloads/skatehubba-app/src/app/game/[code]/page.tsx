import { GameScreen } from "./_components/game-screen";

interface GamePageProps {
  params: { code: string };
}

export default function GamePage({ params }: GamePageProps) {
  return <GameScreen code={decodeURIComponent(params.code)} />;
}
