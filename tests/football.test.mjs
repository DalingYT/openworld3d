import assert from 'node:assert/strict';
import {createFootball} from '../server/football.mjs';
for(let size=1;size<=5;size++){
 let time=0;const players=new Map();for(let i=0;i<size*2+1;i++)players.set(i,{id:String(i),coins:0,needs:{energy:100,fun:0},state:{x:0,y:5.5,z:0,yaw:0}});
 const f=createFootball(players,()=>{},()=>{},()=>time);
 for(let i=0;i<size*2;i++)assert.equal(f.act(players.get(i),{action:'football_join',mode:size}),204);
 assert.equal(f.act(players.get(size*2),{action:'football_join',mode:size}),409);
 let game=f.snapshots().find(g=>g.id===size);assert.equal(game.phase,'playing');assert.equal(game.red.length,size);assert.equal(game.blue.length,size);
 const kicker=players.get(0);kicker.state.x=0;assert.equal(f.act(kicker,{action:'football_kick'}),403);
 for(let goal=0;goal<5;goal++){
  game=f.snapshots().find(g=>g.id===size);kicker.state={x:game.x,y:5.5,z:game.z,yaw:0};time+=400;
  assert.equal(f.act(kicker,{action:'football_kick'}),204);
  assert.equal(f.act(kicker,{action:'football_kick'}),429);
  for(let tick=0;tick<50;tick++){time+=100;f.tick(time);}
 }
 game=f.snapshots().find(g=>g.id===size);assert.equal(game.score[0],5);assert.equal(game.phase,'finished');assert.equal(kicker.coins,20);
 f.leave(kicker);assert.equal(f.snapshots().find(g=>g.id===size).phase,'waiting');
}
console.log('PASS: all five team sizes, capacity, kick proximity/cooldown, goals, winner reward and disconnect reset');
