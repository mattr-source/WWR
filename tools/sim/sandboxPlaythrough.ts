/**
 * Field Sandbox playthrough: drives shared/sandbox.ts through ten patrols and
 * prints what happened, for tuning the provisional numbers by eye.
 *
 *   node --import tsx tools/sim/sandboxPlaythrough.ts
 *
 * Started as a scratch script while tuning; tools/tests/sandbox.test.ts is
 * what guards the loop.
 */
import {applyAction, createSandbox, TUTORIAL, settle} from '../../shared/sandbox';
let t = 1_000_000; let n=0;
let s = createSandbox(t);
const go = (a:any) => { const r = applyAction(s, `a${n++}`, a, t); if (!r.ok) console.log('ERR', a.type, r.error); else if (r.note) console.log('NOTE', r.note); s = r.state; };
go({type:'tutorial.next'}); go({type:'tutorial.next'}); go({type:'encounter.start'});
for (let i=0;i<8 && s.encounter!.status==='active';i++) go({type:'encounter.fire'});
console.log(s.encounter!.log.join('\n')); console.log(Object.values(s.chassis).map(c=>`${c.role}:${c.hp}:${c.status}`).join(' '), 'step', s.tutorial.step, TUTORIAL[s.tutorial.step].objective);
go({type:'encounter.claim'}); console.log(s.supplies); go({type:'workshop.start'});
const dis = Object.values(s.chassis).find(c=>c.status==='disabled'); if (dis) go({type:'chassis.repair', role: dis.role});
console.log('step', s.tutorial.step, TUTORIAL[s.tutorial.step].objective, s.supplies);
go({type:'clock.advance', minutes: 3}); console.log('step', s.tutorial.step, s.tutorial.completed, s.workshop, Object.values(s.chassis).map(c=>`${c.role}:${c.hp}:${c.status}`).join(' '));
for (let w=2; w<=10; w++) { go({type:'encounter.start'}); for (let i=0;i<12 && s.encounter?.status==='active';i++) go({type:'encounter.fire'}); console.log('wave',w,s.encounter!.status, Object.values(s.chassis).map(c=>`${c.role}:${c.hp}:${c.status}`).join(' '), s.supplies); go({type:'encounter.claim'});
 for (const c of Object.values(s.chassis)) { if (c.status==='disabled' || (c.status==='ready' && c.hp < ({scout:50,assault:120,support:70} as any)[c.role])) go({type:'chassis.repair', role:c.role}); if (c.status==='destroyed') go({type:'chassis.reinforce', role:c.role}); }
 go({type:'workshop.start'}); go({type:'clock.advance', minutes: 31}); }
console.log(s.stats, s.company);
