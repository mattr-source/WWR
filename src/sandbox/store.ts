/**
 * Where the Field Sandbox keeps its state: this browser's localStorage, under
 * one key, and nowhere else. It never calls the API, so nothing a player does
 * here can reach their account, their base, their wallet or anyone else.
 *
 * Every dispatch re-reads the stored state before applying, so two tabs take
 * turns instead of overwriting each other, and the action id stops a replay.
 */
import {
  type ActionResult,
  type SandboxAction,
  type SandboxState,
  applyAction,
  createSandbox,
  parseSandbox,
  sandboxNow,
  settle,
} from '../../shared/sandbox';

export const SANDBOX_STORAGE_KEY = 'wwr.sandbox.v1';

/** The part of Storage the sandbox uses; a Map-backed fake in tests. */
export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function read(kv: KeyValue): SandboxState | null {
  try {
    const raw = kv.getItem(SANDBOX_STORAGE_KEY);
    return raw ? parseSandbox(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveSandbox(kv: KeyValue, state: SandboxState): void {
  try {
    kv.setItem(SANDBOX_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private mode or a full quota: the sandbox still plays, it just will not resume.
  }
}

/** The stored sandbox with finished timers folded in, or a new one. */
export function loadSandbox(kv: KeyValue, realNow: number): SandboxState {
  const stored = read(kv);
  const state = stored ? settle(stored, sandboxNow(stored, realNow)) : createSandbox(realNow);
  if (state !== stored) saveSandbox(kv, state);
  return state;
}

export function dispatchSandbox(kv: KeyValue, actionId: string, action: SandboxAction, realNow: number): ActionResult {
  const result = applyAction(loadSandbox(kv, realNow), actionId, action, realNow);
  if (result.ok) saveSandbox(kv, result.state);
  return result;
}

export function resetSandbox(kv: KeyValue, realNow: number): SandboxState {
  const fresh = createSandbox(realNow);
  saveSandbox(kv, fresh);
  return fresh;
}
