import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRoom} from '../server/room.mjs';
const room=createRoom({adminCode:'12345678'}); const server=createServer((req,res)=>req.url.startsWith('/lan/join')?room.join(req,res):req.url==='/lan/admin'?room.admin(req,res):room.move(req,res));
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
async function join(name){const r=await fetch(url+'/lan/join?name='+name+'&clientId='+name.padEnd(16,'x'));const reader=r.body.pipeThrough(new TextDecoderStream()).getReader();let buf='';return {close:()=>reader.cancel(),async read(event,predicate=()=>true){for(;;){const i=buf.indexOf('\n\n');if(i<0){const n=await reader.read();if(n.done)throw Error('closed');buf+=n.value;continue;}const block=buf.slice(0,i);buf=buf.slice(i+2);if(block.startsWith('event: '+event+'\n')){const d=JSON.parse(block.split('\ndata: ')[1]);if(predicate(d))return d;}}}}}


const a=await join('Admin'),b=await join('User');let c;
try {
 const pa=await a.read('ready'),pb=await b.read('ready');
 const send=async(p,path,data)=>(await fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:p.token,...data})})).status;
 assert.equal(await send(pb,'/lan/move',{x:0,y:0,z:0,yaw:0,speedMode:8}),403);
 await send(pa,'/lan/admin',{code:'12345678'});await send(pa,'/lan/admin',{action:'chat_allow',targetId:pb.id});
 for(let i=0;i<3;i++) {assert.equal(await send(pb,'/lan/move',{text:'p u t a'}),i===2?403:204);if(i<2)await new Promise(r=>setTimeout(r,1850));}
 const ban=await b.read('kicked');assert(ban.until>Date.now()+590000);
 c=await join('User');assert.equal((await c.read('kicked')).until,ban.until);
 console.log('PASS: Muerte denied to normal player, filtered-message ban, reconnect blocked for same browser identity');
}finally{await Promise.allSettled([a.close(),b.close(),c?.close()]);room.close();server.closeAllConnections();server.close();}
