import { z } from "zod";

/* ---------- USERS ---------- */
// Firestore: /users/{uid}
export const UserDocSchema = z.object({
  uid: z.string().min(1),
  handle: z.string().min(2).max(32),
  displayName: z.string().min(1),
  photoURL: z.string().url().optional(),
  createdAt: z.union([z.number(), z.any()]).optional(), // Firestore Timestamp or ms
  updatedAt: z.union([z.number(), z.any()]).optional(),
});
export type UserDoc = z.infer<typeof UserDocSchema>;

/* ---------- GAMES ---------- */
// Player info inside /games/{gameId}
export const PlayerSchema = z.object({
  uid: z.string().min(1),
  score: z.number().int().min(0).max(5).default(0),
  lastClipPath: z.string().optional(), // storage path
});

export const GameDocSchema = z.object({
  gameId: z.string().min(1),
  status: z.enum(["waiting", "active", "finished"]),
  players: z.object({
    A: PlayerSchema,
    B: PlayerSchema,
  }),
  turn: z.enum(["A", "B"]).optional(),
  createdAt: z.union([z.number(), z.any()]).optional(),
  updatedAt: z.union([z.number(), z.any()]).optional(),
});
export type GameDoc = z.infer<typeof GameDocSchema>;

/* ---------- LOBBIES ---------- */
// Firestore: /lobbies/{lobbyId}
export const LobbyDocSchema = z.object({
  lobbyId: z.string().min(4),
  hostUid: z.string().min(1),
  code: z.string().min(4).max(8),
  createdAt: z.union([z.number(), z.any()]).optional(),
});
export type LobbyDoc = z.infer<typeof LobbyDocSchema>;

/* ---------- STORAGE PATH HELPERS ---------- */
// IDs
export const IdSchema = z.string().regex(/^[a-zA-Z0-9_-]{6,64}$/);

// Filenames: only allow .mp4, .mov, .webm
export const FileNameSchema = z.string().regex(/^[^\/]{1,200}\.(mp4|mov|webm)$/i);

// Challenge clips live under: /challenges/{gameId}/{uid}/{filename}
export const ChallengeClipPathSchema = z.string().regex(
  /^challenges\/[A-Za-z0-9_-]{6,64}\/[A-Za-z0-9_-]{6,64}\/[^/]{1,200}\.(mp4|mov|webm)$/i,
  { message: "Invalid challenge clip storage path." }
);

export function buildChallengeClipPath(params: {
  gameId: string;
  uid: string;
  fileName: string; // e.g. trick.mp4
}) {
  const gameId = IdSchema.parse(params.gameId);
  const uid = IdSchema.parse(params.uid);
  const fileName = FileNameSchema.parse(params.fileName);
  const path = `challenges/${gameId}/${uid}/${fileName}`;
  return ChallengeClipPathSchema.parse(path);
}

/* ---------- UPLOAD META (client-side checks) ---------- */
export const UploadMetaSchema = z.object({
  sizeBytes: z.number().int().positive().max(100 * 1024 * 1024), // 100 MB
  mimeType: z.string().regex(/^video\/(mp4|quicktime|webm)$/i),
});
export type UploadMeta = z.infer<typeof UploadMetaSchema>;
