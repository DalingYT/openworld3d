import catalog from '../shared/activities.json' with {type:'json'};
export function createFootball(players,send,changed,now=Date.now) {
  const games=catalog.fields.map(field=>({...field,red:[],blue:[],score:[0,0],phase:'waiting',until:0,ball:{x:field.x,z:field.z,vx:0,vz:0},last:now()}));
  let lastBroadcast=0;
  const gameOf=p=>games.find(g=>g.red.includes(p.id)||g.blue.includes(p.id));
  const resetBall=g=>Object.assign(g.ball,{x:g.x,z:g.z,vx:0,vz:0});
  function spawnTeams(g) {
    for(const [team,ids] of [g.red,g.blue].entries())for(const [i,id] of ids.entries()){
      const p=[...players.values()].find(p=>p.id===id);if(!p)continue;
      p.state={x:g.x+(i-(ids.length-1)/2)*3,y:g.height,z:g.z+(team===0?10:-10),yaw:team===0?0:Math.PI};send(p.response,'teleport',p.state);
    }
  }
  function snapshots(){return games.map(g=>({id:g.id,x:g.x,z:g.z,red:g.red,blue:g.blue,score:g.score,phase:g.phase,until:g.until,ball:{x:g.ball.x,z:g.ball.z}}));}
  function broadcast(){const data=snapshots();for(const p of players.values())send(p.response,'football',data);}
  function leave(p){const g=gameOf(p);if(!g)return;g.red=g.red.filter(id=>id!==p.id);g.blue=g.blue.filter(id=>id!==p.id);g.phase='waiting';g.score=[0,0];g.until=0;resetBall(g);broadcast();}
  function act(p,data){
    if(data.action==='football_leave'){leave(p);return 204;}
    if(data.action==='football_join'){
      const g=games.find(g=>g.id===Number(data.mode));if(!g)return 400;
      if(p.car || p.sleepUntil>now() || p.needs.energy<15)return 409;
      if(gameOf(p)===g)return 204;
      if(g.red.length>=g.id&&g.blue.length>=g.id)return 409;
      leave(p);(g.red.length<=g.blue.length?g.red:g.blue).push(p.id);spawnTeams(g);
      if(g.red.length===g.id&&g.blue.length===g.id){g.phase='playing';g.until=now()+180000;g.score=[0,0];resetBall(g);}
      broadcast();changed();return 204;
    }
    const g=gameOf(p);
    if(data.action!=='football_kick'||!g||g.phase!=='playing'||!p.state)return 409;
    if(now()<(p.nextKick??0))return 429;
    if(Math.hypot(p.state.x-g.ball.x,p.state.z-g.ball.z)>3.5)return 403;
    p.nextKick=now()+350;
    g.ball.vx=-Math.sin(p.state.yaw)*23;g.ball.vz=-Math.cos(p.state.yaw)*23;
    p.needs.fun=Math.min(100,p.needs.fun+2);broadcast();return 204;
  }
  function tick(time=now()) {
    for(const g of games){const dt=Math.min(.12,Math.max(0,(time-g.last)/1000));g.last=time;
      if(g.phase==='finished'){if(time>=g.until){g.phase='playing';g.score=[0,0];g.until=time+180000;resetBall(g);spawnTeams(g);}continue;}
      if(g.phase!=='playing')continue;
      const b=g.ball;b.x+=b.vx*dt;b.z+=b.vz*dt;b.vx*=Math.exp(-dt*.65);b.vz*=Math.exp(-dt*.65);
      if(Math.abs(b.x-g.x)>14.5){b.x=g.x+Math.sign(b.x-g.x)*14.5;b.vx*=-.65;}
      if(Math.abs(b.z-g.z)>24){
        if(Math.abs(b.x-g.x)<5){g.score[b.z<g.z?0:1]++;resetBall(g);spawnTeams(g);changed();}
        else {b.z=g.z+Math.sign(b.z-g.z)*24;b.vz*=-.65;}
      }
      if(time>=g.until||Math.max(...g.score)>=5){
        g.phase='finished';g.until=time+10000;
        for(const id of [...g.red,...g.blue]){const p=[...players.values()].find(p=>p.id===id);if(!p)continue;const team=g.red.includes(id)?0:1;p.coins+=g.score[team]>g.score[1-team]?20:5;p.needs.fun=Math.min(100,p.needs.fun+20);}
        changed();
      }
    }
    if(time-lastBroadcast>=100){lastBroadcast=time;broadcast();}
  }
  return {act,tick,leave,broadcast,gameOf,snapshots};
}
