// TODO(integration): Worker A (parallel worktree) owns the real version of this file — Supabase
// Presence/Broadcast wiring on the PLAZA_CHANNEL_NAME channel from plaza/types.ts. It did not
// exist yet in this worktree when Worker B (UI/Movement) started, so this is a minimal local
// stand-in matching the exact exported shape from the Phase 2A brief, just enough for Plaza.tsx to
// compile and be visually testable standalone: nobody else is ever in the plaza, `ready` is always
// true (no loading state to wait on), and `updateMyState` is a no-op (nothing to broadcast to).
// The Integration Lead replaces this file with Worker A's real implementation — nothing outside
// this file (Plaza.tsx included) should need to change when that happens, since the shape below is
// exactly the contract Worker A's hook must also satisfy.
import { useCallback } from 'react';
import type { PlazaDirection, PlazaPlayerState } from './types';
import type { PublicAvatarAppearance } from '../shop/types';

export interface UsePlazaRealtimeResult {
  players: PlazaPlayerState[]; // everyone else in the plaza (not me)
  ready: boolean;
  updateMyState: (partial: { x: number; y: number; direction: PlazaDirection; moving: boolean }) => void;
}

const NO_PLAYERS: PlazaPlayerState[] = [];

export function usePlazaRealtime(_sessionId: string, _appearance: PublicAvatarAppearance): UsePlazaRealtimeResult {
  const updateMyState = useCallback((_partial: { x: number; y: number; direction: PlazaDirection; moving: boolean }) => {
    // no-op stub — the real hook broadcasts this on PLAZA_CHANNEL_NAME at PLAZA_MOVE_TICK_MS cadence.
  }, []);
  return { players: NO_PLAYERS, ready: true, updateMyState };
}
