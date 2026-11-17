import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRoom} from '../server/room.mjs';
const room=createRoom({adminCode:'12345678'}); const server=createServer((req,res)=>req.url.startsWith('/lan/join')?room.join(req,res):req.url==='/lan/admin'?room.admin(req,res):room.move(req,res));
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
async function join(name){const r=await fetch(url+'/lan/join?name='+name);const reader=r.body.pipeThrough(new TextDecoderStream()).getReader();let buf='';return {close:()=>reader.cancel(),async read(event,predicate=()=>true){for(;;){const i=buf.indexOf('\n\n');if(i<0){const n=await reader.read();if(n.done)throw Error('closed');buf+=n.value;continue;}const block=buf.slice(0,i);buf=buf.slice(i+2);if(block.startsWith('event: '+event+'\n')){const d=JSON.parse(block.split('\ndata: ')[1]);if(predicate(d))return d;}}}}}


const bad=await join('p3nd3jo'),good=await join('Computadora');
try {
 assert.match((await bad.read('kicked')).reason,/apodo/);const p=await good.read('ready');
 const send=async data=>(await fetch(url+'/lan/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:p.token,...data})})).status;
 assert.equal(await send({code:'12345678'}),204);
 console.log('PASS: bad nickname rejected with explanation, harmless nickname accepted');
}finally{await Promise.allSettled([bad.close(),good.close()]);room.close();server.closeAllConnections();server.close();}
