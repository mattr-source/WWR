/**
 * Field Sandbox playthrough: drives shared/sandbox.ts through a run of
 * Dominion Patrols with repairs and robot upgrades between them, and prints
 * what happened, for tuning the TEST-ONLY numbers by eye.
 *
 *   node --import tsx tools/sim/sandboxPlaythrough.ts [patrols]
 *
 * tools/tests/sandbox.test.ts is what guards the loop; this only reports.
 */
import * as S from '../../shared/sandbox';

const patrols = Number(process.argv[2] ?? 25);
let t = Date.UTC(2026, 8, 15, 12);
let n = 0;
let s = S.createSandbox(t);
const go = (a: S.SandboxAction) => {
  const r = S.applyAction(s, `a${n++}`, a, t);
  s = r.state;
  return r.ok;
};
const wait = (min: number) => {
  t += min * 60_000;
  s = S.settle(s, S.sandboxNow(s, t));
};

go({type: 'tutorial.skip'});
for (let p = 1; p <= patrols; p += 1) {
  const site = S.sitesFor(s, S.sandboxDay(s, S.sandboxNow(s, t))).find((x) => x.kind === 'patrol')!;
  const robots = S.ROLES.filter((r) => s.robots[r].status === 'ready');
  const assets = s.assets.filter((a) => a.status === 'ready').map((a) => a.assetId);
  if (go({type: 'march.start', siteId: site.id, robots, assets})) {
    go({type: 'clock.skipMarch'});
    const e = s.encounter!;
    const c = S.battleCasualties(e);
    go({type: 'clock.skipMarch'});
    go({type: 'battle.seen'});
    go({type: 'clock.skipMarch'});
    console.log(
      `patrol ${p} strength ${e.wave} ${e.status} rounds ${e.rounds.length} kills ${e.kills}/${e.enemiesStart.length}`,
      `destroyed [${c.destroyed}] disabled [${c.disabled}] assets down [${c.assetsDisabled}]`,
      `levels ${S.ROLES.map((r) => s.robots[r].level)} steel ${s.supplies.steel}`,
    );
  } else console.log(`patrol ${p}: no eligible Task Force, waiting`);
  for (const r of S.ROLES) {
    if (s.robots[r].status === 'destroyed') go({type: 'robot.remanufacture', role: r});
    else if (S.robotNeedsRepair(s.robots[r])) go({type: 'robot.repair', role: r});
  }
  for (const a of s.assets) if (S.assetNeedsRepair(a)) go({type: 'asset.repair', assetId: a.assetId});
  wait(30);
  for (let k = 0; k < 3; k += 1) {
    const r = [...S.ROLES].sort((a, b) => s.robots[a].level - s.robots[b].level)[0];
    const q = S.nextInstall(s.robots[r]);
    if (!q || !go({type: 'robot.upgrade', role: r})) break;
    wait(q.minutes + 0.1);
  }
}
console.log(s.stats, s.supplies, `${s.credits} test Credits`);
