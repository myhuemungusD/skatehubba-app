'use client';

import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGameStore } from '../src/store/game';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { SkateLogo } from '../components/ui/skate-logo';

export default function HomePage() {
  const router = useRouter();
  const { actions, loading, error } = useGameStore((state) => ({
    actions: state.actions,
    loading: state.loading,
    error: state.error
  }));
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  useEffect(() => {
    actions.bootstrap().catch((err) => console.error(err));
  }, [actions]);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    const { code: joinCode } = await actions.createGame(name.trim());
    await actions.connectGame(joinCode);
    router.push(`/game/${joinCode}`);
  };

  const handleJoin = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !code.trim()) return;
    await actions.joinGame(code.trim().toUpperCase(), name.trim());
    router.push(`/game/${code.trim().toUpperCase()}`);
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-6 py-16">
      <div className="flex flex-col items-center text-center">
        <SkateLogo />
        <h1 className="mt-6 text-4xl font-bold sm:text-5xl">SkateHubba S.K.8</h1>
        <p className="mt-4 text-lg text-slate-300">
          Challenge friends in a live head-to-head S.K.8 battle. Record tricks, judge in real time, and
          climb the leaderboard.
        </p>
      </div>
      <div className="grid gap-8 md:grid-cols-2">
        <form
          onSubmit={handleCreate}
          className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl backdrop-blur"
        >
          <h2 className="text-2xl font-semibold text-hubba-green">Create Room</h2>
          <label className="text-sm font-medium text-slate-200" htmlFor="create-name">
            Your name
          </label>
          <Input
            id="create-name"
            placeholder="Nyjah"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
          <Button type="submit" disabled={loading} className="mt-4 bg-hubba-orange text-black">
            {loading ? 'Creating…' : 'Create Game'}
          </Button>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
        </form>
        <form
          onSubmit={handleJoin}
          className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl backdrop-blur"
        >
          <h2 className="text-2xl font-semibold text-hubba-orange">Join Room</h2>
          <label className="text-sm font-medium text-slate-200" htmlFor="join-name">
            Your name
          </label>
          <Input
            id="join-name"
            placeholder="Elissa"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
          <label className="text-sm font-medium text-slate-200" htmlFor="join-code">
            Room code
          </label>
          <Input
            id="join-code"
            placeholder="ABCD"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            className="uppercase"
            required
          />
          <Button type="submit" disabled={loading} className="mt-4 bg-hubba-green text-black">
            {loading ? 'Joining…' : 'Join Game'}
          </Button>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
        </form>
      </div>
    </div>
  );
}
