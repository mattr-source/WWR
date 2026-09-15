/**
 * Prints the Command Center 10 pacing report for every balance profile.
 *
 *   npm run sim:pacing
 *   npm run sim:pacing -- --log      (build order for the target players)
 *
 * Section A is the game as it can be played today. Section B re-runs the
 * target players with HYPOTHETICAL paid options that do not exist in the
 * game; it is there to show what would have to change, not to propose it.
 */
import {BALANCE_PROFILES, SEASON_1_CANDIDATE_CC10} from '../../shared/balance';
import {
  type Hypothetical,
  PLAYERS,
  TARGETS,
  WEEKLY_TOKEN_CAP,
  bestPlan,
  checkTargets,
  tokenCeilingByDay,
  wholeBaseDays,
} from './seasonPacing';

const day = (d: number | null | undefined) => (d === null || d === undefined ? '>70' : d.toFixed(1));
const num = (n: number) => Math.round(n).toLocaleString('en-US');
const pad = (s: string | number, n: number) => String(s).padEnd(n);

console.log('WWR Command Center 10 pacing - 70-day season, one build queue unless noted');
console.log(
  `Targets: typical free player CC10 on day ${TARGETS.free.from}-${TARGETS.free.to} (week 8); heavy spender day ${TARGETS.spender.from}-${TARGETS.spender.to} (week 3). ` +
    `Token cap ${num(WEEKLY_TOKEN_CAP)} per Monday week, so at most ${num(tokenCeilingByDay(20))} Tokens by day 21.`,
);

console.log('\n=== A. ACTUAL MECHANICS (Depot 1:1 under daily caps is the only paid lever) ===');
for (const profile of BALANCE_PROFILES) {
  console.log(`\n${profile.id}@${profile.version} [${profile.status}] - whole base L2-10 raw timers ${wholeBaseDays(profile).toFixed(1)} d`);
  console.log(`  ${pad('player', 16)} ${pad('best plan', 30)} CC5    CC10   | queue  res.wait offline | Credits earned/spent  Tokens  max/wk  longest build`);
  for (const [key, player] of Object.entries(PLAYERS)) {
    const r = bestPlan(profile, player);
    console.log(
      `  ${pad(key, 16)} ${pad(r.plan, 30)} ${pad(day(r.ccDay[5]), 6)} ${pad(day(r.cc10Day), 6)} | ${pad(r.queueDays.toFixed(1), 6)} ${pad(r.resourceWaitDays.toFixed(1), 8)} ${pad(r.offlineWaitDays.toFixed(1), 7)} | ${pad(`${num(r.creditsEarned)}/${num(r.creditsSpent)}`, 20)} ${pad(num(r.tokensSpent), 7)} ${pad(num(r.maxTokensInAWeek), 7)} ${r.longestBuildHours.toFixed(1)} h`,
    );
  }
  const t = checkTargets(profile);
  console.log(`  targets: free ${day(t.free.cc10Day)} (${t.freeVerdict}), spender ${day(t.spender.cc10Day)} (${t.spenderVerdict})`);
}

console.log('\n=== B. HYPOTHETICAL options on the candidate (none exists in the game; not authorized) ===');
const whatIfs: Array<[string, Hypothetical]> = [
  ['Depot daily caps x3', {depotCapMultiplier: 3}],
  ['Second Engineer Team at Engineer Yard 5', {secondTeamAtEngineerYard: 5}],
  ['CC timer cut at 50 currency/hour', {commandCenterSpeedupPerHour: 50}],
  ['CC timer cut at 100 currency/hour', {commandCenterSpeedupPerHour: 100}],
  ['caps x3 + CC cut at 50/hour', {depotCapMultiplier: 3, commandCenterSpeedupPerHour: 50}],
];
console.log(`  ${pad('what-if', 42)} free CC10        spender CC10      spender Tokens (cut h)`);
for (const [label, h] of whatIfs) {
  const t = checkTargets(SEASON_1_CANDIDATE_CC10, h);
  console.log(
    `  ${pad(label, 42)} ${pad(`${day(t.free.cc10Day)} ${t.freeVerdict}`, 17)} ${pad(`${day(t.spender.cc10Day)} ${t.spenderVerdict}`, 17)} ${num(t.spender.tokensSpent)} (${t.spender.speedupHours.toFixed(0)})`,
  );
}

if (process.argv.includes('--log')) {
  for (const profile of BALANCE_PROFILES) {
    const t = checkTargets(profile);
    for (const r of [t.free, t.spender]) {
      console.log(`\nCC day by level, ${profile.id}, ${r.player} [${r.plan}]`);
      console.log(`  ${[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `${n}:${day(r.ccDay[n])}`).join('  ')}`);
    }
  }
}
