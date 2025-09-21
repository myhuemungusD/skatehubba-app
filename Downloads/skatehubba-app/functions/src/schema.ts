import { admin } from './firebase';
import { z } from 'zod';

export const playerKeySchema = z.enum(['A', 'B']);
export type PlayerKey = z.infer<typeof playerKeySchema>;

export const phaseSchema = z.enum([
  'SET_RECORD',
  'SET_JUDGE',
  'RESP_RECORD',
  'RESP_JUDGE',
]);
export type Phase = z.infer<typeof phaseSchema>;

export const lettersSequence = ['S', 'K', '8'] as const;

export const playerSchema = z.object({
  uid: z.string().min(1),
  name: z.string().min(1).max(60),
  letters: z.union([
    z.literal(''),
    z.literal('S'),
    z.literal('SK'),
    z.literal('SK8'),
  ]),
});

export const currentSchema = z.object({
  by: playerKeySchema,
  setVideoPath: z.string().min(1).nullable(),
  responseVideoPath: z.string().min(1).nullable(),
});

export const historyEntrySchema = z.object({
  by: playerKeySchema,
  setPath: z.string().min(1).nullable(),
  respPath: z.string().min(1).nullable(),
  result: z.enum(['declined_set', 'approved_set', 'landed', 'failed']),
  ts: z.instanceof(admin.firestore.Timestamp),
});

export const gameSchema = z.object({
  code: z.string().regex(/^[A-Z0-9]{6}$/),
  turn: playerKeySchema,
  phase: phaseSchema,
  winner: playerKeySchema.nullable(),
  players: z.object({
    A: playerSchema,
    B: playerSchema.nullable(),
  }),
  current: currentSchema,
  history: z.array(historyEntrySchema),
  createdAt: z.instanceof(admin.firestore.Timestamp),
  updatedAt: z.instanceof(admin.firestore.Timestamp),
});

export type GameDoc = z.infer<typeof gameSchema>;
export type PlayerState = z.infer<typeof playerSchema>;
export type HistoryEntry = z.infer<typeof historyEntrySchema>;
