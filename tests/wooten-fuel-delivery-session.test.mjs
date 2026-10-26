import test from 'node:test';
import assert from 'node:assert/strict';
import {deliverySessionStep} from '../assets/js/wooten-fuel-monitor-server.mjs';

const location={
 interval:300,delivery_notification:true,
 tanks:[{number:1,capacity:10000},{number:2,capacity:10000},{number:3,capacity:10000}]
};
const base=Date.parse('2026-10-26T19:00:00.000Z');
const reading=(minutes,volumes)=>({
 observed_at:new Date(base+minutes*60000).toISOString(),
 tanks:volumes.map((volume,i)=>({number:i+1,volume}))
});
test('one opt-in delivery alert, one combined stabilized recovery, no five-minute duplicates',()=>{
 const steps=[
  {minute:0,values:[300,700,2500],levels:{1:'critical',2:'low',3:'normal'},recovered:[],start:false,finish:false},
  {minute:5,values:[800,700,2500],levels:{1:'critical',2:'low',3:'normal'},recovered:[],start:true,finish:false},
  {minute:10,values:[1500,750,2500],levels:{1:'normal',2:'low',3:'normal'},recovered:[1],start:false,finish:false},
  {minute:15,values:[1800,820,2500],levels:{1:'normal',2:'low',3:'normal'},recovered:[],start:false,finish:false},
  {minute:20,values:[1900,1300,2500],levels:{1:'normal',2:'normal',3:'normal'},recovered:[2],start:false,finish:false},
  {minute:25,values:[1900,1300,2500],levels:{1:'normal',2:'normal',3:'normal'},recovered:[],start:false,finish:false},
  {minute:30,values:[1900,1300,2500],levels:{1:'normal',2:'normal',3:'normal'},recovered:[],start:false,finish:false},
  {minute:35,values:[1900,1300,2500],levels:{1:'normal',2:'normal',3:'normal'},recovered:[],start:false,finish:false},
  {minute:40,values:[1900,1300,2500],levels:{1:'normal',2:'normal',3:'normal'},recovered:[],start:false,finish:true},
  {minute:45,values:[1900,1300,2500],levels:{1:'normal',2:'normal',3:'normal'},recovered:[],start:false,finish:false}
 ];
 let previous=null,session=null;
 for(const step of steps){
  const current=reading(step.minute,step.values);
  const result=deliverySessionStep(location,previous,current,session,step.recovered,step.levels);
  assert.equal(result.started,step.start,'start at minute '+step.minute);
  assert.equal(result.finished,step.finish,'finish at minute '+step.minute);
  if(step.finish)assert.deepEqual(result.recoveredTanks,[1,2]);
  previous=current;session=result.session;
 }
});
test('unchecked delivery notification still permits a stabilized recovery',()=>{
 const config={...location,delivery_notification:false};
 let a=reading(0,[400,400,2000]),b=reading(5,[900,400,2000]);
 let result=deliverySessionStep(config,a,b,null,[],{1:'critical',2:'low',3:'normal'});
 assert.equal(result.started,false);
 assert.ok(result.session);
 let last=b;
 for(const minute of [10,15,20,25]){
  const current=reading(minute,[900,400,2000]);
  result=deliverySessionStep(config,last,current,result.session,minute===10?[1]:[],{1:'normal',2:'low',3:'normal'});
  last=current;
 }
 assert.equal(result.finished,true);
 assert.deepEqual(result.recoveredTanks,[1]);
});
test('no silent 20-minute stabilization while collector readings are missing',()=>{
 let a=reading(0,[400,400,2000]),b=reading(5,[900,400,2000]);
 const start=deliverySessionStep(location,a,b,null,[],{1:'critical',2:'low',3:'normal'});
 const afterGap=deliverySessionStep(location,b,reading(90,[900,400,2000]),start.session,[],{1:'normal',2:'low',3:'normal'});
 assert.equal(afterGap.finished,false);
});
