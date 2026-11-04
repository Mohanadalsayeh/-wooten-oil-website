import test from 'node:test';
import assert from 'node:assert/strict';
import {deliverySessionStep} from '../assets/js/wooten-fuel-monitor-server.mjs';

const location={interval:300,delivery_notification:true,
 tanks:[1,2,3].map(number=>({number,capacity:10000}))};
const base=Date.parse('2026-11-04T01:00:00.000Z');
const reading=(minute,values)=>({observed_at:new Date(base+minute*60000).toISOString(),
 tanks:values.map((volume,i)=>({number:i+1,volume}))});
function run(samples,options={}){
 let previous=null,session=null;const output=[];
 for(const step of samples){
  const now=reading(step.minute,step.values);
  const result=deliverySessionStep(options.config||location,previous,now,session,
   step.recovered||[],step.levels||{1:'normal',2:'normal',3:'normal'});
  output.push({...result,minute:step.minute});session=result.session;previous=now;
 }
 return output;
}
const at=(minute,values,extra={})=>({minute,values,...extra});

test('new monitoring session only establishes baseline and does not report historical fuel',()=>{
 const x=run([at(0,[3100,1500,800]),at(5,[3100,1500,800])]);
 assert.ok(x.every(s=>!s.started&&!s.finished));
 assert.equal(x[0].session.phase,'armed');
});
test('one transient 352-gallon spike is never confirmed as a delivery',()=>{
 const x=run([at(0,[5000,6003,2800]),at(5,[5000,6355,2800]),
  at(10,[5000,6003,2800]),at(15,[5000,6003,2800]),at(35,[5000,6003,2800])]);
 assert.equal(x[1].session.phase,'candidate');
 assert.equal(x[2].session.phase,'armed');
 assert.ok(x.every(s=>!s.started&&!s.finished));
});
test('confirmed persistent delivery finishes after 20 minutes of actual stability',()=>{
 const samples=[at(0,[3100,5900,2800]),at(5,[3100,6400,2800]),
  at(10,[3100,6420,2800]),at(15,[3100,6420,2800]),at(20,[3100,6420,2800]),
  at(25,[3100,6420,2800]),at(30,[3100,6420,2800])];
 const x=run(samples);
 assert.equal(x[1].started,false);
 assert.equal(x[2].started,true);
 assert.ok(x.slice(3,5).every(s=>!s.finished));
 assert.equal(x[5].finished,true); // 20 minutes after the first stable reading
 assert.equal(x[6].finished,false); // no duplicate alert
 assert.deepEqual(x[5].deliveredTanks,[2]);
 assert.equal(x[5].measurements.find(m=>m.number===2).received,520);
});
test('stability clock restarts after significant negative volume movement',()=>{
 const samples=[at(0,[3100,5900,2800]),at(5,[3100,6400,2800]),at(10,[3100,6400,2800]),
  at(15,[3100,6400,2800]),at(20,[3100,6335,2800]),at(25,[3100,6335,2800]),
  at(30,[3100,6335,2800]),at(35,[3100,6335,2800]),at(40,[3100,6335,2800])];
 const x=run(samples);
 assert.equal(x[6].finished,false); // 20 minutes since confirmation, but unstable at 20
 assert.equal(x.at(-1).finished,true); // 20 minutes from the actual new stable level
});
test('readings after a long collector gap do not create a new delivery',()=>{
 const x=run([at(0,[3100,5900,2800]),at(45,[3100,6400,2800]),
  at(50,[3100,6400,2800]),at(55,[3100,6400,2800])]);
 assert.ok(x.every(s=>!s.started&&!s.finished));
});
test('threshold-only recovery stays separate from a completed delivery',()=>{
 const samples=[at(0,[3100,5900,2800]),at(5,[3100,5900,2800],{recovered:[2]}),
  at(10,[3100,5900,2800]),at(15,[3100,5900,2800]),at(20,[3100,5900,2800]),
  at(25,[3100,5900,2800])];
 const x=run(samples);
 assert.equal(x.at(-1).finished,true);
 assert.equal(x.at(-1).recoveryOnly,true);
 assert.deepEqual(x.at(-1).recoveredTanks,[2]);
 assert.deepEqual(x.at(-1).deliveredTanks,[]);
 assert.deepEqual(x.at(-1).measurements,[]);
 assert.ok(x.every(s=>!s.started));
});
test('delivery start toggle only affects start SMS, not verified finished delivery',()=>{
 const config={...location,delivery_notification:false};
 const x=run([at(0,[3100,5900,2800]),at(5,[3100,6400,2800]),
  at(10,[3100,6400,2800]),at(15,[3100,6400,2800]),at(20,[3100,6400,2800]),
  at(25,[3100,6400,2800]),at(30,[3100,6400,2800])],{config});
 assert.ok(x.every(s=>!s.started));
 assert.equal(x.at(-2).finished,true);
 assert.equal(x.at(-1).finished,false);
 assert.deepEqual(x.at(-2).deliveredTanks,[2]);
});
test('no delivery notification for normal five-minute variation',()=>{
 const x=run([at(0,[3100,5900,2800]),at(5,[3094,5890,2794]),
  at(10,[3100,5898,2800]),at(15,[3092,5890,2790]),at(20,[3096,5901,2795]),
  at(25,[3084,5890,2790]),at(30,[3089,5898,2791])]);
 assert.ok(x.every(s=>!s.started&&!s.finished));
});
test('unrelated tank sales do not reset stability of the receiving tank',()=>{
 const x=run([at(0,[3100,5900,2800]),at(5,[3100,6400,2800]),
  at(10,[3100,6400,2800]),at(15,[3000,6400,2800]),at(20,[2900,6400,2800]),
  at(25,[2800,6400,2800]),at(30,[2700,6400,2800])]);
 assert.equal(x.at(-2).finished,true);
 assert.deepEqual(x.at(-2).deliveredTanks,[2]);
});
test('collector gap during confirmed delivery resets the 20-minute stability clock',()=>{
 const x=run([at(0,[3100,5900,2800]),at(5,[3100,6400,2800]),
  at(10,[3100,6400,2800]),at(40,[3100,6400,2800]),
  at(45,[3100,6400,2800]),at(50,[3100,6400,2800]),
  at(55,[3100,6400,2800]),at(60,[3100,6400,2800])]);
 assert.equal(x[3].finished,false);
 assert.equal(x.at(-1).finished,true);
});
test('separate tanks delivered in consecutive readings use their own pre-rise baselines',()=>{
 const x=run([at(0,[3000,1000,2800]),at(5,[3600,1000,2800]),
  at(10,[3600,1500,2800]),at(15,[3600,1500,2800]),
  at(20,[3600,1500,2800]),at(25,[3600,1500,2800]),at(30,[3600,1500,2800])]);
 assert.equal(x.at(-1).finished,true);
 assert.deepEqual(x.at(-1).deliveredTanks,[1,2]);
 assert.deepEqual(x.at(-1).measurements.slice(0,2).map(m=>m.received),[600,500]);
});
test('candidate spike reverting while a different tank rises waits for proof of the new rise',()=>{
 const x=run([at(0,[3000,1000,2800]),at(5,[3600,1000,2800]),
  at(10,[3000,1500,2800]),at(15,[3000,1500,2800])]);
 assert.equal(x[2].started,false);
 assert.equal(x[2].session.phase,'candidate');
 assert.equal(x[3].started,true);
 assert.deepEqual(x[3].startedTanks,[2]);
});
