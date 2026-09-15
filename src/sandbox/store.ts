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
  type SandboxRejection,
  createSandbox,
  readSandbox,
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

function read(kv: KeyValue): {raw: string | null; state: SandboxState | null; rejected: SandboxRejection | null} {
  let raw: string | null = null;
  try {
    raw = kv.getItem(SANDBOX_STORAGE_KEY);
    if (!raw) return {raw, state: null, rejected: 'empty'};
    return {raw, ...readSandbox(JSON.parse(raw))};
  } catch {
    return {raw, state: null, rejected: 'invalid'};
  }
}

export function saveSandbox(kv: KeyValue, state: SandboxState): void {
  try {
    kv.setItem(SANDBOX_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private mode or a full quota: the sandbox still plays, it just will not resume.
  }
}

/** Why a stored practice save could not be kept, in words for the screen. Null when nothing was lost. */
export function resetNotice(rejected: SandboxRejection | null): string | null {
  if (rejected === 'schema' || rejected === 'config') return 'The practice test build changed, so this sandbox started over. Nothing real was affected.';
  if (rejected === 'invalid') return 'The saved practice sandbox could not be read, so it started over. Nothing real was affected.';
  return null;
}

/** The stored sandbox with finished timers folded in, or a new one - and, if a save was replaced, why. */
export function openSandbox(kv: KeyValue, realNow: number): {state: SandboxState; notice: string | null} {
  const stored = read(kv);
  const state = stored.state ? settle(stored.state, sandboxNow(stored.state, realNow)) : createSandbox(realNow);
  const json = JSON.stringify(state);
  if (json !== stored.raw) saveSandbox(kv, state);
  return {state, notice: resetNotice(stored.rejected)};
}

export function loadSandbox(kv: KeyValue, realNow: number): SandboxState {
  return openSandbox(kv, realNow).state;
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
