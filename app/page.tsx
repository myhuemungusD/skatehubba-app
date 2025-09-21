'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGameStore } from '../src/store/game';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { SkateLogo } from '../components/ui/skate-logo';
import { 
  sanitizeDisplayName, 
  sanitizeJoinCode, 
  validateDisplayName, 
  validateJoinCode 
} from '../src/lib/validation';

export default function HomePage() {
  const router = useRouter();
  const { actions, loading, error } = useGameStore((state) => ({
    actions: state.actions,
    loading: state.loading,
    error: state.error
  }));
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [validationErrors, setValidationErrors] = useState<{
    name?: string;
    code?: string;
  }>({});

  useEffect(() => {
    actions.bootstrap().catch((err) => {
      // Don't expose internal errors to console in production
      if (process.env.NODE_ENV === 'development') {
        console.error(err);
      }
    });
  }, [actions]);

  const handleNameChange = (value: string) => {
    const sanitized = sanitizeDisplayName(value);
    setName(sanitized);
    
    if (validationErrors.name) {
      const validation = validateDisplayName(sanitized);
      if (validation.isValid) {
        setValidationErrors(prev => ({ ...prev, name: undefined }));
      }
    }
  };

  const handleCodeChange = (value: string) => {
    const sanitized = sanitizeJoinCode(value);
    setCode(sanitized);
    
    if (validationErrors.code) {
      const validation = validateJoinCode(sanitized);
      if (validation.isValid) {
        setValidationErrors(prev => ({ ...prev, code: undefined }));
      }
    }
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    
    const trimmedName = name.trim();
    const nameValidation = validateDisplayName(trimmedName);
    
    if (!nameValidation.isValid) {
      setValidationErrors({ name: nameValidation.error });
      return;
    }
    
    setValidationErrors({});
    
    try {
      const { code: joinCode } = await actions.createGame(trimmedName);
      await actions.connectGame(joinCode);
      router.push(`/game/${joinCode}`);
    } catch (err) {
      // Error is handled by the store
    }
  };

  const handleJoin = async (event: FormEvent) => {
    event.preventDefault();
    
    const trimmedName = name.trim();
    const trimmedCode = code.trim();
    
    const nameValidation = validateDisplayName(trimmedName);
    const codeValidation = validateJoinCode(trimmedCode);
    
    const errors: typeof validationErrors = {};
    if (!nameValidation.isValid) errors.name = nameValidation.error;
    if (!codeValidation.isValid) errors.code = codeValidation.error;
    
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }
    
    setValidationErrors({});
    
    try {
      await actions.joinGame(trimmedCode.toUpperCase(), trimmedName);
      router.push(`/game/${trimmedCode.toUpperCase()}`);
    } catch (err) {
      // Error is handled by the store
    }
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
            onChange={(event) => handleNameChange(event.target.value)}
            maxLength={32}
            required
            aria-describedby={validationErrors.name ? 'create-name-error' : undefined}
          />
          {validationErrors.name && (
            <p id="create-name-error" className="text-sm text-red-400" role="alert">
              {validationErrors.name}
            </p>
          )}
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
            onChange={(event) => handleNameChange(event.target.value)}
            maxLength={32}
            required
            aria-describedby={validationErrors.name ? 'join-name-error' : undefined}
          />
          {validationErrors.name && (
            <p id="join-name-error" className="text-sm text-red-400" role="alert">
              {validationErrors.name}
            </p>
          )}
          <label className="text-sm font-medium text-slate-200" htmlFor="join-code">
            Room code
          </label>
          <Input
            id="join-code"
            placeholder="ABCD"
            value={code}
            onChange={(event) => handleCodeChange(event.target.value)}
            className="uppercase"
            maxLength={8}
            required
            aria-describedby={validationErrors.code ? 'join-code-error' : undefined}
          />
          {validationErrors.code && (
            <p id="join-code-error" className="text-sm text-red-400" role="alert">
              {validationErrors.code}
            </p>
          )}
          <Button type="submit" disabled={loading} className="mt-4 bg-hubba-green text-black">
            {loading ? 'Joining…' : 'Join Game'}
          </Button>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
        </form>
      </div>
    </div>
  );
}
