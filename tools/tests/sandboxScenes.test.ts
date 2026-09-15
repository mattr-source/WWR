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
import {CHAT_TABS} from '../../shared/chat';
import {groundAt, legacyTerrainSeed} from '../../shared/terrain';
import {PROP_FRAMES} from '../../shared/terrainAtlas';
import {BUILDING_ROLE, buildingLabel} from '../../src/sandbox/baseRoles';
import {CHAT as LIVE_CHAT} from '../../src/i18n/en/chat';
import {SKIN_IDENTITY, STARTER_SKIN_IDS} from '../../shared/skins';
import {PRACTICE_SKIN, RIVAL_SKIN, SKIN_ART, plateLabel} from '../../src/sandbox/worldSkins';
import {existsSync} from 'node:fs';
import {Sheet} from '../../src/sandbox/ui';
import Comms, {COMMS_OFFLINE, CommsPanel} from '../../src/sandbox/Comms';
import {CHAPTERS, chapterOf, hubModel, phaseOfWeek, unlocksIn} from '../../src/sandbox/seasonHub';
import {SEASON_1_START, STARTER_ASSETS, UNLOCK_WEEK} from '../../shared/season';
import {LANES_FOR_CACHE, SEASON_1_NAME} from '../../shared/season1Ops';
import {POINTS, WARFRONT} from '../../shared/warfront';
import {ROLES, applyAction, createSandbox, readSandbox, sandboxDay, sitesFor, squadDeployment} from '../../shared/sandbox';
import {HOME_ANCHOR, HOME_PLOT, SANDBOX_SEASON, SANDBOX_WORLD_ID, WORLD_EXTENT, clearPlots, groundColour, toPlot} from '../../src/sandbox/worldGround';

const root = join(import.meta.dirname, '..', '..');

test('home base: every building on the live board has a sandbox role or an honest none, and nothing extra', () => {
  assert.deepEqual(Object.keys(BUILDING_ROLE).sort(), BOARD_BUILDINGS.map((b) => b.id).sort());
  const functional = Object.entries(BUILDING_ROLE).filter(([, r]) => r);
  const kinds = new Set(functional.map(([, r]) => r!.target.kind));
  for (const k of ['bay', 'repair', 'hangar', 'season', 'record']) assert.ok(kinds.has(k as never), `a building opens ${k}`);
  // The three starter Assets each have their own hub.
  const hangars = functional.map(([, r]) => r!.target).filter((t) => t.kind === 'hangar').map((t) => (t as {assetId: string}).assetId).sort();
  assert.deepEqual(hangars, ['m1a2', 'mi35m', 'rq4']);
  for (const b of BOARD_BUILDINGS) {
    assert.match(b.art, /^\/base\/(building|vehicle)-[a-z-]+\.webp$/, b.id);
    assert.equal(buildingLabel(b.id), b.name);
  }
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

test('season hub: ten design chapters, the live unlock schedule and the live phase rule', () => {
  const design = readFileSync(join(root, 'docs/SEASON-1-LIVE-OPS-DESIGN-v1.md'), 'utf8');
  assert.equal(CHAPTERS.length, 10);
  for (const c of CHAPTERS) {
    const row = design.split('\n').find((l) => l.startsWith(`| ${c.week} | ${c.name} |`));
    assert.ok(row, `design row for week ${c.week}`);
    assert.ok(row!.includes(c.featured) && row!.includes(c.beat), `week ${c.week} text matches the design`);
  }
  assert.deepEqual(unlocksIn(1).sort(), [...STARTER_ASSETS].sort());
  assert.equal(CHAPTERS.reduce((n, c) => n + unlocksIn(c.week).length, 0), Object.keys(UNLOCK_WEEK).length);
  assert.equal(phaseOfWeek(4), 'proving_ground');
  assert.equal(phaseOfWeek(5), 'head_to_head');
  assert.equal(chapterOf(99).week, 10);
});

test('season hub: progress is read from the practice state, and the Warfront card only estimates with the live table', () => {
  const T0 = SEASON_1_START + 8 * 24 * 3_600_000 + 5_000;
  let s = createSandbox(T0);
  s = applyAction(s, 'a', {type: 'tutorial.skip'}, T0).state;
  let h = hubModel(s, T0, T0);
  assert.equal(h.name, SEASON_1_NAME);
  assert.equal(h.week, 1);
  assert.equal(h.chapter.name, 'Signal Breach');
  assert.equal(h.live.week, 2, 'live calendar: 2026-09-15 is week 2');
  assert.equal(h.live.chapter?.name, 'Scraplands Sweep');
  assert.deepEqual(h.ops, {lanes: 0, target: LANES_FOR_CACHE, cacheClaimed: false});
  assert.equal(h.warfront.total, 0);
  assert.equal(h.exercises.length, sitesFor(s, 0).filter((x) => x.kind !== 'patrol' && x.kind !== 'rival_base').length);
  assert.ok(h.exercises.every((x) => !x.done));
  // Clear one exercise and complete two lanes by hand: the hub follows.
  const ex = h.exercises[0];
  s = {...s, cleared: [...s.cleared, ex.site.id], ledger: [...s.ledger, 'lane:0:command', 'lane:0:mobilization']};
  h = hubModel(s, T0, T0);
  assert.equal(h.exercises.filter((x) => x.done).length, 1);
  assert.equal(h.ops.lanes, 2);
  const expectOps = 2 * POINTS.dailyLane.points + (ex.kind === 'hold' ? POINTS.exerciseHold.points : 0);
  const expectAssault = ex.kind === 'battle' ? POINTS.exerciseBattle.points : 0;
  assert.equal(h.warfront.metrics.operations, expectOps);
  assert.equal(h.warfront.metrics.assault, expectAssault);
  assert.ok(h.warfront.total <= WARFRONT.perPlayerDailyCap);
  assert.ok(h.convoy.rules.every((r) => !/Tokens/.test(r)), 'no Token-priced rule in the sandbox');
  // A new practice day and week move the chapter.
  const later = T0 + 7 * 24 * 3_600_000;
  assert.equal(sandboxDay(s, later), 7);
  assert.equal(hubModel(s, later, T0).chapter.name, 'Scraplands Sweep');
});

test('sheets: the title bar is outside the scrolling body, on an opaque panel', () => {
  const html = renderToStaticMarkup(createElement(Sheet, {title: 'Season 1 · Events', onClose: () => {}, children: createElement('p', null, 'body')}));
  const head = html.indexOf('data-sheet-header');
  const body = html.indexOf('data-sheet-body');
  assert.ok(head > 0 && body > head, 'header comes before the body');
  const bodyTag = html.slice(html.lastIndexOf('<div', body), html.indexOf('>', body));
  assert.match(bodyTag, /overflow-y-auto/);
  const headTag = html.slice(html.lastIndexOf('<div', head), html.indexOf('>', head));
  assert.doesNotMatch(headTag, /overflow-y-auto|sticky/);
  assert.match(headTag, /bg-\[#0d0b08\]/);
  assert.ok(html.slice(head, body).includes('Season 1 · Events'), 'title inside the header, not the body');
});

/** Class strings that appear verbatim in both files: the port keeps the live markup, not a look-alike. */
function sharedClasses(livePath: string, portPath: string, classes: string[]) {
  const live = readFileSync(join(root, livePath), 'utf8');
  const port = readFileSync(join(root, portPath), 'utf8');
  for (const c of classes) {
    assert.ok(live.includes(c), `${livePath} has "${c}"`);
    assert.ok(port.includes(c), `${portPath} keeps "${c}"`);
  }
}

test('original layouts: the base view is the live BaseBoard presentation, with no live or network import', () => {
  const port = 'src/sandbox/original/SandboxBaseBoard.tsx';
  sharedClasses('src/live/BaseBoard.tsx', port, [
    'absolute inset-0 h-full w-full',
    'whitespace-nowrap rounded bg-black/80 px-2 py-0.5 font-semibold text-neutral-50 shadow',
    'mt-0.5 rounded bg-black/60 px-1.5 text-[0.8em] text-neutral-300',
    'whitespace-nowrap font-semibold uppercase tracking-wider text-neutral-800/90',
    "pointer-events-none absolute inset-[6%] rounded-lg ring-2 ring-white/70",
  ]);
  const src = readFileSync(join(root, port), 'utf8');
  for (const needle of ['Math.max(vw / BOARD_W, vh / BOARD_H)', "t('board.openHintFixed')", "t('board.tfHome')", 'data-guide={`building:${b.id}`}', 'data-guide={`slab:${squad}`}', 'data-guide="building:command_center"']) assert.ok(src.includes(needle), needle);
  sharedClasses('src/live/LiveApp.tsx', 'src/sandbox/Sandbox.tsx', [
    'pointer-events-none absolute inset-x-0 top-0 z-40 flex items-',
    'rounded border border-neutral-800 bg-black/70 px-3 py-1.5 text-[11px] backdrop-blur',
    'rounded bg-neutral-800/90 px-3 py-2 text-sm font-medium text-neutral-100 shadow backdrop-blur transition hover:bg-neutral-700',
  ]);
  for (const f of ['src/sandbox/original/SandboxBaseBoard.tsx', 'src/sandbox/original/WorldView.tsx', 'src/sandbox/original/SandboxGuide.tsx', 'src/sandbox/original/SandboxPanels.tsx', 'src/sandbox/Comms.tsx']) {
    const text = readFileSync(join(root, f), 'utf8');
    for (const m of text.matchAll(/from '([^']+)'/g)) assert.doesNotMatch(m[1], /\/live\/|\/net\/|^\.\.\/i18n$|^\.\.\/\.\.\/i18n$/, `${f}: ${m[1]}`);
    assert.doesNotMatch(text, /['"`]\/api\/|fetch\(/, f);
  }
});

test('original layouts: the world view keeps the live map controls, strings and places', () => {
  const port = 'src/sandbox/original/WorldView.tsx';
  sharedClasses('src/live/WorldMap.tsx', port, [
    'pointer-events-none absolute inset-x-0 top-0 z-40 grid grid-cols-[auto_1fr_auto] items-start gap-2 p-3 pt-[calc(0.75rem+env(safe-area-inset-top))]',
    'pointer-events-auto flex min-w-0 items-center justify-center gap-x-2 rounded border border-neutral-800 bg-black/70 px-3 py-1.5 text-center backdrop-blur',
    'pointer-events-auto w-56 rounded border border-neutral-800 bg-black/70 backdrop-blur',
    'pointer-events-auto flex h-11 items-center gap-2 rounded border border-neutral-700 bg-black/70 px-4 text-sm font-semibold text-neutral-100 backdrop-blur transition hover:border-red-600 hover:text-red-200',
    'pointer-events-auto flex h-11 items-center gap-2 rounded border border-neutral-700 bg-black/70 px-4 text-sm font-semibold text-neutral-100 backdrop-blur transition hover:border-fuchsia-500 hover:text-fuchsia-200',
    'M4 5h11l-1.5 3L15 11H4',
    'M3 10.5 12 3l9 7.5',
  ]);
  const src = readFileSync(join(root, port), 'utf8');
  for (const key of ['nav.squads', 'nav.myBase', 'map.squadsOut', 'map.recall', 'map.reports', 'map.home']) assert.ok(src.includes(`t('${key}')`), key);
  assert.doesNotMatch(src, /choose a Task Force|Deploy a Task Force/, 'no squad chooser on the World Map: Attack sends the saved line-up');
});

test('original layouts: Comms is the live bar and panel, offline, with nothing sent and no messages', () => {
  sharedClasses('src/live/Chat.tsx', 'src/sandbox/Comms.tsx', [
    'fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)]',
    'flex min-h-[48px] w-full items-center gap-3 border-t border-orange-900/60 bg-neutral-900/95 px-4 py-2.5 text-left backdrop-blur',
    'shrink-0 rounded border border-orange-700/70 bg-orange-950/40 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-orange-300',
    'fixed inset-0 z-50 flex flex-col bg-neutral-950',
    'flex items-center justify-between border-b border-neutral-800 px-4 py-3',
    'text-xs uppercase tracking-[0.3em] text-orange-500',
  ]);
  const bar = renderToStaticMarkup(createElement(Comms));
  assert.match(bar, />Comms</);
  assert.match(bar, /Offline in the practice sandbox/);
  const panel = renderToStaticMarkup(createElement(CommsPanel, {tab: 'private', onTab: () => {}, onClose: () => {}}));
  const labels = {server: LIVE_CHAT['chat.server'], alliance: LIVE_CHAT['chat.alliance'], leadership: LIVE_CHAT['chat.leadership'], private: LIVE_CHAT['chat.private']};
  for (const tab of CHAT_TABS) {
    const m = new RegExp(`<button([^>]*)>${labels[tab]}</button>`).exec(panel);
    assert.ok(m, labels[tab]);
    assert.equal(m![1].includes('disabled=""'), tab !== 'private', `${tab} locked as live chat locks a tab with no channel`);
  }
  assert.ok(panel.includes(COMMS_OFFLINE.replace(/'/g, '&#x27;')));
  assert.ok(panel.includes(LIVE_CHAT['chat.noConversations'].replace(/'/g, '&#x27;')));
  assert.match(panel, /<button type="submit" disabled=""[^>]*>Send<\/button>/);
  assert.doesNotMatch(panel, /data-message|createdAt/, 'no messages are drawn');
  const src = readFileSync(join(root, 'src/sandbox/Comms.tsx'), 'utf8');
  assert.deepEqual([...src.matchAll(/from '([^']+)'/g)].map((m) => m[1]), ['react', '../../shared/chat', './original/strings']);
});

test('world map bases are starter skins with the live nameplate, drawn with the live presentation values', () => {
  const live = readFileSync(join(root, 'src/live/skins.ts'), 'utf8');
  for (const id of [PRACTICE_SKIN, RIVAL_SKIN]) {
    assert.ok(SKIN_IDENTITY[id].starter && !SKIN_IDENTITY[id].exclusive, `${id} is a starter, not an exclusive`);
    assert.ok(existsSync(join(root, 'public/skins', `${id}.webp`)), `${id} art exists`);
    const block = live.slice(live.indexOf(`  ${id}: {`), live.indexOf('},\n  },', live.indexOf(`  ${id}: {`)));
    assert.match(block, new RegExp(`overhang: ${SKIN_ART.overhang}`), `${id} overhang`);
    assert.match(block, new RegExp(`fill: ${SKIN_ART.fill}`), `${id} fill`);
    assert.match(block, new RegExp(`frameW: ${SKIN_ART.frameW},\\s+frameH: ${SKIN_ART.frameH}`), `${id} frame`);
  }
  assert.equal(PRACTICE_SKIN, STARTER_SKIN_IDS[0], 'the live default starter');
  assert.notEqual(PRACTICE_SKIN, 'signature_one');
  // The live plate rules: font min(13, max(8, size x 0.2)); a long name is cut from the middle, keeping its tail.
  assert.equal(plateLabel('Rogue', 92).font, 13);
  assert.equal(plateLabel('Rogue', 30).font, 8);
  const cut = plateLabel('LieutenantCommanderOfTheSaltBasin123456', 60);
  assert.match(cut.label, /…123456$/);
  const map = readFileSync(join(root, 'src/sandbox/SectorMap.tsx'), 'utf8');
  assert.doesNotMatch(map, /\/base\/building-/, 'no base-view building art stands in for a base on the World Map');
});

test('squad line-up: set on the base, sent by Attack, and older saves without it still load', () => {
  const T0 = Date.UTC(2026, 8, 15, 12);
  let s = applyAction(createSandbox(T0), 'a', {type: 'tutorial.skip'}, T0).state;
  assert.equal(s.squad, null);
  assert.deepEqual(squadDeployment(s).robots, [...ROLES], 'no line-up means the whole Task Force');
  s = applyAction(s, 'b', {type: 'squad.set', robots: ['scout'], assets: ['rq4', 'm1a2']}, T0).state;
  assert.deepEqual(s.squad, {robots: ['scout'], assets: ['m1a2', 'rq4']});
  const d = squadDeployment(s);
  assert.deepEqual([d.robots, d.assets, d.blocked], [['scout'], ['m1a2', 'rq4'], null]);
  const noDrone = applyAction(s, 'c', {type: 'squad.set', robots: ['scout'], assets: ['m1a2']}, T0).state;
  assert.match(squadDeployment(noDrone).blocked ?? '', /drone/);
  const site = sitesFor(s, 0).find((x) => x.kind === 'patrol')!;
  const d2 = squadDeployment(s);
  const marched = applyAction(s, 'd', {type: 'march.start', siteId: site.id, robots: d2.robots, assets: d2.assets}, T0).state;
  assert.deepEqual([marched.march?.robots, marched.march?.assets], [['scout'], ['m1a2', 'rq4']]);
  assert.equal(applyAction(marched, 'e', {type: 'squad.set', robots: [], assets: []}, T0).ok, false, 'no changes while out');
  // A save written before the line-up existed: no squad field at all.
  const old = JSON.parse(JSON.stringify(createSandbox(T0)));
  delete old.squad;
  const read = readSandbox(old);
  assert.equal(read.rejected, null);
  assert.equal(read.state?.squad, null);
  // An unreadable line-up never drops a save.
  assert.equal(readSandbox({...old, squad: 'garbage'}).state?.squad, null);
});

test('review fixes: General Rider height is not reserved after the walkthrough; the temporary-art label lives outside the map', () => {
  const shell = readFileSync(join(root, 'src/sandbox/Sandbox.tsx'), 'utf8');
  const inset = /const bottomInset = ([^;]+);/.exec(shell);
  assert.ok(inset, 'bottomInset is derived in one place');
  assert.match(inset![1], /state\.tutorial\.completed/, 'a skipped or finished walkthrough reserves no guide height, even though the guide is unmounted');
  const world = readFileSync(join(root, 'src/sandbox/original/WorldView.tsx'), 'utf8');
  const strip = world.indexOf('data-notice-strip');
  const column = world.indexOf('data-bottom-column');
  assert.ok(strip > 0 && column > strip, 'the notice has its own strip before the bottom column');
  assert.equal(world.slice(column).includes('{notice}'), false, 'the notice is not inside the bottom controls over the map');
  assert.match(world, /bottom: mapBottom/, 'the map stops above the notice strip');
});
