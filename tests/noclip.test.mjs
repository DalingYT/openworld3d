import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRoom} from '../server/room.mjs';
const room=createRoom({adminCode:'12345678'}); const server=createServer((req,res)=>req.url.startsWith('/lan/join')?room.join(req,res):req.url==='/lan/admin'?room.admin(req,res):room.move(req,res));
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
async function join(name){const r=await fetch(url+'/lan/join?name='+name);const reader=r.body.pipeThrough(new TextDecoderStream()).getReader();let buf='';return {close:()=>reader.cancel(),async read(event,predicate=()=>true){for(;;){const i=buf.indexOf('\n\n');if(i<0){const n=await reader.read();if(n.done)throw Error('closed');buf+=n.value;continue;}const block=buf.slice(0,i);buf=buf.slice(i+2);if(block.startsWith('event: '+event+'\n')){const d=JSON.parse(block.split('\ndata: ')[1]);if(predicate(d))return d;}}}}}

const a=await join('Admin'),b=await join('User');let c;
try {
 const pa=await a.read('ready'),pb=await b.read('ready');
 const send=async(p,path,data)=>(await fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:p.token,...data})})).status;
 assert.equal(await send(pb,'/lan/admin',{action:'noclip'}),403);
 assert.equal(await send(pb,'/lan/admin',{action:'groundcar'}),403);
 assert.equal(await send(pb,'/lan/move',{x:0,y:0,z:0,yaw:0,speedMode:30}),403);
 assert.equal(await send(pb,'/lan/move',{text:'Forbidden'}),403);
 assert.equal(await send(pb,'/lan/admin',{action:'chat_allow',targetId:pb.id}),403);
 assert.equal(await send(pa,'/lan/admin',{code:'12345678'}),204);
 assert.equal((await a.read('permissions')).freeChat,true);
 assert.equal(await send(pa,'/lan/admin',{action:'groundcar'}),204);assert.equal((await a.read('permissions')).groundCar,true);
 assert.equal(await send(pa,'/lan/admin',{action:'freecar'}),204);assert.equal((await a.read('permissions')).groundCar,false);
 assert.equal(await send(pa,'/lan/admin',{action:'noclip'}),204);assert.equal((await a.read('permissions')).noclip,true);
 assert.equal(await send(pa,'/lan/admin',{action:'clip'}),204);assert.equal((await a.read('permissions')).noclip,false);
 assert.equal(await send(pa,'/lan/move',{text:'Admin can speak'}),204);
 assert.equal((await b.read('chat')).text,'Admin can speak');
 assert.equal(await send(pa,'/lan/admin',{action:'chat_allow',targetId:pb.id}),204);
 assert.equal((await b.read('permissions')).freeChat,true);
 assert.equal(await send(pb,'/lan/move',{text:'x'.repeat(161)}),400);
 assert.equal(await send(pb,'/lan/move',{text:'   '}),400);
 assert.equal(await send(pb,'/lan/move',{text:'<img src=x onerror=alert(1)>'}),204);
 const delivered=await a.read('chat',m=>m.id===pb.id);assert.equal(delivered.text,'<img src=x onerror=alert(1)>');
 assert.equal(await send(pb,'/lan/move',{text:'Spam'}),429);
 assert.equal(await send(pa,'/lan/admin',{action:'chat_block',targetId:pb.id}),204);
 assert.equal((await b.read('permissions')).freeChat,false);
 assert.equal(await send(pb,'/lan/move',{text:'Blocked immediately'}),403);
 await b.close();c=await join('User');const pc=await c.read('ready');
 assert.equal(pc.freeChat,false);assert.equal(await send(pc,'/lan/move',{text:'No retained access'}),403);
 assert.equal(await send(pc,'/lan/move',{phrase:'hello'}),204);
 console.log('PASS: admin unlock, unauthorized denial, grant/revoke, length/rate limits, literal text, reconnect reset and fixed phrases');
} finally {await Promise.allSettled([a.close(),b.close(),c?.close()]);room.close();server.closeAllConnections();server.close();}
