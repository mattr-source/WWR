/**
 * The sandbox's two scenes: Home Base (the live base board and building art)
 * and the World Map (the live Season 1 terrain), plus the offline Comms.
 *
 *   npm test
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import test from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {BOARD_BUILDINGS} from '../../shared/base';
import {CHAT_TABS, TAB_LABEL} from '../../shared/chat';
import {groundAt, legacyTerrainSeed} from '../../shared/terrain';
import {PROP_FRAMES} from '../../shared/terrainAtlas';
import {BUILDING_ROLE, buildingLabel} from '../../src/sandbox/baseRoles';
import Comms, {COMMS_OFFLINE, CommsPanel} from '../../src/sandbox/Comms';
import {HOME_ANCHOR, HOME_PLOT, SANDBOX_SEASON, SANDBOX_WORLD_ID, WORLD_EXTENT, clearPlots, groundColour, toPlot} from '../../src/sandbox/worldGround';

const root = join(import.meta.dirname, '..', '..');

test('home base: every building on the live board has a sandbox role or an honest none, and nothing extra', () => {
  assert.deepEqual(Object.keys(BUILDING_ROLE).sort(), BOARD_BUILDINGS.map((b) => b.id).sort());
  const functional = Object.entries(BUILDING_ROLE).filter(([, r]) => r);
  const kinds = new Set(functional.map(([, r]) => r!.target.kind));
  for (const k of ['bay', 'repair', 'hangar', 'ops', 'record']) assert.ok(kinds.has(k as never), `a building opens ${k}`);
  // The three starter Assets each have their own hub.
  const hangars = functional.map(([, r]) => r!.target).filter((t) => t.kind === 'hangar').map((t) => (t as {assetId: string}).assetId).sort();
  assert.deepEqual(hangars, ['m1a2', 'mi35m', 'rq4']);
  for (const b of BOARD_BUILDINGS) {
    assert.match(b.art, /^\/base\/(building|vehicle)-[a-z-]+\.webp$/, b.id);
    assert.equal(buildingLabel(b.id), b.name);
  }
});

test('home base: the scene reuses the live board data and art, and no live module', () => {
  const src = readFileSync(join(root, 'src/sandbox/HomeBase.tsx'), 'utf8');
  for (const name of ['BOARD_IMAGE', 'PADS', 'resolvePlacements', 'TASK_FORCE_PADS', 'COMMAND_CENTER_BOX', 'ART_W', 'VEHICLE_W']) assert.match(src, new RegExp(`\\b${name}\\b`), name);
  for (const m of src.matchAll(/from '([^']+)'/g)) assert.doesNotMatch(m[1], /live|net|BaseBoard/, m[1]);
  assert.doesNotMatch(src, /['"`]\/api\//);
});

test('world map: the ground is the live Season 1 generator, deterministic, and targets stand on clear plots', () => {
  assert.equal(WORLD_EXTENT, 200);
  const home = toPlot(HOME_ANCHOR.x, HOME_ANCHOR.y);
  assert.deepEqual(home, {x: HOME_PLOT.x + 0.5, y: HOME_PLOT.y + 0.5});
  const a = groundColour(12.3, -40.7, 94);
  assert.deepEqual(groundColour(12.3, -40.7, 94), a);
  for (const c of a) assert.ok(c >= 0 && c <= 255);
  // Different ground reads differently: the colour follows groundAt.
  const seed = legacyTerrainSeed(SANDBOX_WORLD_ID, SANDBOX_SEASON);
  const g = groundAt(seed, WORLD_EXTENT, HOME_PLOT.x, HOME_PLOT.y);
  assert.ok(g.sand + g.salt + g.rock + g.scrub > 0);
  const clear = clearPlots([HOME_ANCHOR], 1);
  assert.equal(clear.size, 9);
  assert.ok(clear.has(`${HOME_PLOT.x},${HOME_PLOT.y}`));
  assert.ok(Object.keys(PROP_FRAMES).length > 10, 'the live prop atlas is in');
});

test('comms: the live tabs, offline, with sending disabled', () => {
  const bar = renderToStaticMarkup(createElement(Comms));
  assert.match(bar, /Comms/);
  assert.match(bar, /Offline in the practice sandbox/);
  const panel = renderToStaticMarkup(createElement(CommsPanel, {tab: 'server', onTab: () => {}, onClose: () => {}}));
  for (const t of CHAT_TABS) assert.ok(panel.includes(`>${TAB_LABEL[t]}<`), TAB_LABEL[t]);
  assert.ok(panel.includes(COMMS_OFFLINE.replace(/'/g, '&#x27;')));
  assert.match(panel, /<input disabled=""/);
  assert.match(panel, /<button disabled=""[^>]*>Send<\/button>/);
  const src = readFileSync(join(root, 'src/sandbox/Comms.tsx'), 'utf8');
  assert.deepEqual([...src.matchAll(/from '([^']+)'/g)].map((m) => m[1]), ['react', '../../shared/chat']);
});
