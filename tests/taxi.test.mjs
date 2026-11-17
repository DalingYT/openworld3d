import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRoom} from '../server/room.mjs';
const room=createRoom({adminCode:'12345678'}); const server=createServer((req,res)=>req.url.startsWith('/lan/join')?room.join(req,res):req.url==='/lan/admin'?room.admin(req,res):room.move(req,res));
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
async function join(name){const r=await fetch(url+'/lan/join?name='+name);const reader=r.body.pipeThrough(new TextDecoderStream()).getReader();let buf='';return {close:()=>reader.cancel(),async read(event,predicate=()=>true){for(;;){const i=buf.indexOf('\n\n');if(i<0){const n=await reader.read();if(n.done)throw Error('closed');buf+=n.value;continue;}const block=buf.slice(0,i);buf=buf.slice(i+2);if(block.startsWith('event: '+event+'\n')){const d=JSON.parse(block.split('\ndata: ')[1]);if(predicate(d))return d;}}}}}


const streams=await Promise.all(['Driver','P1','P2','P3','P4'].map(join));
try {
 const ids=await Promise.all(streams.map(s=>s.read('ready')));
 const send=async(i,data)=>(await fetch(url+'/lan/move',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:ids[i].token,...data})})).status;
 for(let i=0;i<5;i++)assert.equal(await send(i,{x:2000,y:0,z:0,yaw:0}),204);
 assert.equal(await send(0,{ride:'spawn',vehicleType:'taxi'}),204);
 let car=(await streams[0].read('cars',c=>c.length>0))[0];
 assert.equal(car.kind,'taxi');assert.equal(car.passengers.length,3);
 for(let i=0;i<5;i++)await send(i,{x:car.x,y:0,z:car.z+2,yaw:0});
 assert.equal(await send(0,{ride:car.id}),204);
 for(let i=1;i<=3;i++)assert.equal(await send(i,{ride:car.id}),204);
 assert.equal(await send(4,{ride:car.id}),409);
 car=(await streams[0].read('cars',c=>c[0]?.passengers.filter(Boolean).length===3))[0];
 assert.equal(await send(1,{x:9999,y:100,z:9999,yaw:0,drivingCar:car.id,carImpact:car.impact}),204);
 assert.equal(await send(1,{ride:'eject',targetId:ids[2].id}),403);
 assert.equal(await send(4,{ride:'eject',targetId:ids[2].id}),403);
 assert.equal(await send(0,{ride:'eject',targetId:ids[1].id}),204);
 assert.equal(await send(1,{ride:'exit'}),204);
 let after=(await streams[0].read('cars',c=>c[0]?.passengers.filter(Boolean).length===2))[0];
 assert.equal(after.driver,ids[0].id);assert.equal(after.x,car.x);assert.equal(after.z,car.z);
 assert.equal(await send(4,{ride:car.id}),204);
 assert.equal(await send(0,{ride:'exit'}),204);
 assert.equal(await send(0,{ride:'spawn',vehicleType:'car'}),409,'occupied taxi cannot be replaced');
 await streams[2].read('cars',c=>c[0]?.passengers.includes(ids[2].id));
 await streams[0].close();
 await streams[2].read('cars',c=>c.length===0);
 assert.equal(await send(2,{x:2000,y:0,z:0,yaw:0}),204,'owner disconnect frees riders');
 console.log('PASS: driver + 3 passengers, full capacity, passenger cannot drive, seat reuse, occupied replacement blocked, owner disconnect');
} finally {await Promise.allSettled(streams.map(s=>s.close()));room.close();server.closeAllConnections();server.close();}
