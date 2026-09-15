/**
 * Asset Service Rank art (src/sandbox/RefitArt.tsx): every rank step 2..10
 * must visibly install an appropriate equipment component - not only swap the
 * rank badge - and keep every earlier one. These tests render the real SVG
 * markup and inspect the equipment itself, per Asset family.
 *
 *   npm test
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import type {AssetCategory} from '../../shared/assets';
import {assetOf} from '../../shared/sandbox';
import {SANDBOX_SEASON_1_TEST} from '../../shared/sandboxSeason';
import {NO_PACKAGES} from '../../shared/upgrades';
import {AssetKitGroup, RankPlateGroup, ServiceCoverGroup, ServiceItemGroup, serviceFamily, serviceItemFor, serviceItems} from '../../src/sandbox/RefitArt';

const kit = (category: AssetCategory, rank: number, hide: 'rank' | null = null) =>
  renderToStaticMarkup(createElement('svg', null, createElement(AssetKitGroup, {category, packages: NO_PACKAGES, rank, hide})));

/** The service-kit group's markup alone (no rank plate, no packages), with instance ids normalised. */
function serviceMarkup(markup: string): string {
  const start = markup.indexOf('<g data-service=');
  assert.ok(start >= 0, 'service kit group is drawn');
  let depth = 0;
  const re = /<g[\s>]|<\/g>/g;
  re.lastIndex = start;
  for (let m = re.exec(markup); m; m = re.exec(markup)) {
    depth += m[0] === '</g>' ? -1 : 1;
    if (depth === 0) return markup.slice(start, m.index + 4).replace(/ra[A-Za-z0-9]+(?=sand|olive|gun|dark|glow|cone|haz)/g, 'ID');
  }
  throw new Error('unbalanced markup');
}

const equipIds = (markup: string) => [...markup.matchAll(/data-equip="([^"]+)"/g)].map((m) => m[1]);
const coverIds = (markup: string) => [...markup.matchAll(/data-cover="([^"]+)"/g)].map((m) => m[1]);
const shapes = (markup: string) => (markup.match(/<(rect|path|circle|ellipse)\b/g) ?? []).length;

const STARTERS = SANDBOX_SEASON_1_TEST.taskForceAssets.map((id) => ({id, category: assetOf(id)!.category}));

test('the three starter Assets cover the three kit families', () => {
  assert.deepEqual(STARTERS.map((a) => serviceFamily(a.category)).sort(), ['aircraft', 'armour', 'rotary']);
  assert.equal(serviceFamily('fixed_wing'), 'aircraft');
  assert.equal(serviceFamily('artillery'), 'armour');
});

for (const {id, category} of STARTERS) {
  test(`${id} (${category}): every rank 2..10 installs one new, persistent equipment component`, () => {
    let prevService = serviceMarkup(kit(category, 1));
    let prevIds = equipIds(kit(category, 1));
    assert.deepEqual(prevIds, [], 'rank 1 is the stock Asset');
    assert.deepEqual(coverIds(kit(category, 1)), [serviceItemFor(category, 2)!.id], 'rank 1 shows the cover for the rank 2 mount');
    for (let rank = 2; rank <= 10; rank += 1) {
      const markup = kit(category, rank);
      const service = serviceMarkup(markup);
      const ids = equipIds(markup);
      const item = serviceItemFor(category, rank)!;
      // Exactly one new component, and every earlier one is still fitted.
      assert.equal(ids.length, rank - 1, `${id} rank ${rank} component count`);
      assert.deepEqual(ids.slice(0, -1), prevIds, `${id} rank ${rank} keeps earlier components`);
      assert.equal(ids.at(-1), item.id);
      assert.ok(!prevIds.includes(item.id), 'the new component is not a repeat');
      assert.deepEqual(serviceItems(category, rank).map((x) => x.id), ids);
      // The equipment drawing itself changed (the rank plate is outside this group).
      assert.notEqual(service, prevService, `${id} rank ${rank - 1} -> ${rank}: equipment differs`);
      const itemGroup = new RegExp(`<g data-equip="${item.id}"[^>]*>(.*?)</g></g>`).exec(service);
      assert.ok(itemGroup && shapes(itemGroup[0]) >= 2, `${item.name} is drawn inside the fitted kit`);
      assert.doesNotMatch(service, /<text\b/, 'equipment is drawn, not a label');
      const alone = renderToStaticMarkup(createElement('svg', null, createElement(ServiceItemGroup, {category, step: rank})));
      assert.equal(equipIds(alone)[0], item.id);
      assert.ok(shapes(alone) >= 2, `${item.name} is a real drawing (${shapes(alone)} shapes)`);
      // The cover moves on to the next mount; none after the last rank.
      assert.deepEqual(coverIds(markup), rank < 10 ? [serviceItemFor(category, rank + 1)!.id] : []);
      // During the ceremony the new component and the cover are held back for the drop-in.
      const held = kit(category, rank, 'rank');
      assert.deepEqual(equipIds(held), prevIds);
      assert.deepEqual(coverIds(held), []);
      const cover = renderToStaticMarkup(createElement('svg', null, createElement(ServiceCoverGroup, {category, step: rank})));
      assert.deepEqual(coverIds(cover), [item.id], 'the ceremony lifts the cover of this mount');
      prevService = service;
      prevIds = ids;
    }
    assert.equal(serviceItemFor(category, 11), null);
  });
}

test('the kit families are different equipment, with type-appropriate names', () => {
  const sets = STARTERS.map(({category}) => new Set(serviceItems(category, 10).map((x) => x.id)));
  for (let i = 0; i < sets.length; i += 1) for (let j = i + 1; j < sets.length; j += 1) assert.equal([...sets[i]].filter((x) => sets[j].has(x)).length, 0);
  const names = (c: AssetCategory) => serviceItems(c, 10).map((x) => x.name).join(' | ');
  assert.match(names('armour'), /Track guards|Smoke grenade launchers|Reactive armour/);
  assert.match(names('rotary'), /Tail rotor guard|Flare dispensers|Wire-strike cutter/);
  assert.match(names('drone'), /Winglets|Air-data probe|de-icing/);
});

test('the rank plate still changes every rank, alongside the equipment', () => {
  let prev = '';
  for (let rank = 1; rank <= 10; rank += 1) {
    const plate = renderToStaticMarkup(createElement('svg', null, createElement(RankPlateGroup, {rank}))).replace(/ra[A-Za-z0-9]+(?=sand|olive|gun|dark|glow|cone|haz)/g, 'ID');
    assert.notEqual(plate, prev);
    prev = plate;
  }
});
