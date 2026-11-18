import catalog from '../shared/activities.json' with {type:'json'};
import homes from '../shared/houses.json' with {type:'json'};
import {createFootball} from './football.mjs';
export function createActivities(players,cars,send,leaveCar,changed,economy,now=Date.now) {
  const football=createFootball(players,send,()=>{changed();economy();},now);
  function start(p){p.needs={hunger:100,energy:100,fun:100};p.sleepUntil=0;p.lastNeeds=now();p.outfit='none';p.outfits=new Set(['none']);p.stickers=new Set(['none']);p.sticker='none';p.spoiler=false;p.hasSpoiler=false;}
  const profile=p=>({needs:p.needs,sleepUntil:p.sleepUntil,coins:p.coins,outfit:p.outfit,sticker:p.sticker,spoiler:p.spoiler,match:football.gameOf(p)?.id??null});
  function sync(p){send(p.response,'activities',profile(p));}
  let lastSync=0;
  function tick(time=now()){
    for(const p of players.values()){
      const minutes=Math.min(1,(time-p.lastNeeds)/60000);p.lastNeeds=time;
      if(p.sleepUntil){if(time>=p.sleepUntil){p.sleepUntil=0;p.needs.energy=100;sync(p);}continue;}
      p.needs.hunger=Math.max(0,p.needs.hunger-4*minutes);p.needs.energy=Math.max(0,p.needs.energy-(p.needs.hunger<15?7:5)*minutes);p.needs.fun=Math.max(0,p.needs.fun-3*minutes);
      if(p.needs.energy<15 && p.car)leaveCar(p);
    }
    football.tick(time);
    if(time-lastSync>2000){lastSync=time;for(const p of players.values())sync(p);}
  }
  function action(p,data,response){
    if(!data||typeof data!=='object'||!p.state)return response.writeHead(400).end();
    const {action,id}=data;
    if(p.sleepUntil>now())return response.writeHead(409).end();
    if(typeof action!=='string')return response.writeHead(400).end();
    if(action.startsWith('football_')){const status=football.act(p,data);sync(p);return response.writeHead(status).end();}
    if(action==='rest_visit'){
      if(p.car||football.gameOf(p))return response.writeHead(409).end();
      p.state={x:-8,y:5.5,z:-35,yaw:0};send(p.response,'teleport',p.state);changed();
    }else if(action==='sleep'){
      const h=homes.find(h=>h.id===p.house),at=(x,z)=>Math.hypot(p.state.x-x,p.state.z-z)<6;
      if(p.car||football.gameOf(p)||(!at(-8,-35)&&!(h&&at(h.x,h.z))))return response.writeHead(409).end();
      p.sleepUntil=now()+60000;p.emote=null;changed();
    }else if(action==='food'){
      if(!Object.hasOwn(catalog.food,id))return response.writeHead(400).end();
      const item=catalog.food[id];if(p.coins<item.price)return response.writeHead(402).end();p.coins-=item.price;p.needs.hunger=Math.min(100,p.needs.hunger+item.hunger);p.needs.fun=Math.min(100,p.needs.fun+5);economy();
    }else if(action==='outfit'||action==='sticker'){
      const list=action==='outfit'?catalog.outfits:catalog.stickers,owned=action==='outfit'?p.outfits:p.stickers;
      if(!Object.hasOwn(list,id))return response.writeHead(400).end();
      if(!owned.has(id)){if(p.coins<list[id].price)return response.writeHead(402).end();p.coins-=list[id].price;owned.add(id);}
      p[action]=id;const car=cars.get(p.ownedCar);if(car&&action==='sticker')car.sticker=id;changed();economy();
    }else if(action==='spoiler'){
      if(typeof data.enabled!=='boolean')return response.writeHead(400).end();
      if(data.enabled&&!p.hasSpoiler){if(p.coins<10)return response.writeHead(402).end();p.coins-=10;p.hasSpoiler=true;}
      p.spoiler=data.enabled;const car=cars.get(p.ownedCar);if(car)car.spoiler=p.spoiler;changed();economy();
    }else if(action==='emote'){
      if(!Object.hasOwn(catalog.emotes,id)||p.car)return response.writeHead(400).end();
      if(now()<(p.nextEmote??0))return response.writeHead(429).end();p.nextEmote=now()+2000;p.emote={id,until:now()+4000};p.needs.fun=Math.min(100,p.needs.fun+3);changed();
      for(const q of players.values())send(q.response,'emote',{id:p.id,emote:id,duration:4000});
    }else return response.writeHead(400).end();
    sync(p);response.writeHead(204).end();
  }
  return {start,tick,action,sync,football,remove:p=>football.leave(p)};
}
