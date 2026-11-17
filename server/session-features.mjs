import plots from '../shared/houses.json' with { type: 'json' };
const PRICE = 80;
export function createSessionFeatures(players, send) {
  const owners = new Map();
  function profile(p) {
    return { coins:p.coins, house:p.house, flying:Boolean(p.flying), friends:[...p.friends], incoming:[...p.requests], outgoing:[...players.values()].filter(q=>q.requests.has(p.id)).map(q=>q.id) };
  }
  function houses() { return plots.map(plot=>{const p=[...players.values()].find(q=>q.id===owners.get(plot.id));return {...plot, owner:p?.id??null,name:p?.name??'',price:PRICE};}); }
  function broadcast() { const homes=houses();for(const p of players.values()){send(p.response,'profile',profile(p));send(p.response,'houses',homes);} }
  function start(p, now=Date.now()) { p.coins=100;p.house=null;p.flying=false;p.friends=new Set();p.requests=new Set();p.rewardAt=now+60000; }
  function remove(p) {if(p.house)owners.delete(p.house);for(const q of players.values()){q.friends.delete(p.id);q.requests.delete(p.id);} }
  function tick(now=Date.now()) {for(const p of players.values())if(now>=p.rewardAt){p.coins+=5;p.rewardAt=now+60000;send(p.response,'profile',profile(p));} }
  function action(p, data, response) {
    if(!data||typeof data!=='object')return response.writeHead(400).end();
    const {action,targetId,houseId}=data;
    if(action==='buy_house') {
      if(!plots.some(h=>h.id===houseId))return response.writeHead(400).end();
      if(p.house||owners.has(houseId))return response.writeHead(409).end();
      if(p.coins<PRICE)return response.writeHead(402).end();
      p.coins-=PRICE;p.house=houseId;owners.set(houseId,p.id);
    } else if(action==='enter_house') {
      const owner=[...players.values()].find(q=>q.id===owners.get(houseId));
      if(!owner)return response.writeHead(404).end();
      if(p.car)return response.writeHead(409).end();
      if(owner!==p&&!owner.friends.has(p.id))return response.writeHead(403).end();
      send(p.response,'home_visit',{houseId});
    } else {
      const target=[...players.values()].find(q=>q.id===targetId&&q!==p);
      if(!target)return response.writeHead(404).end();
      if(action==='friend_request') {
        if(target.friends.has(p.id)||target.requests.has(p.id))return response.writeHead(409).end();
        target.requests.add(p.id);
      } else if(action==='friend_accept') {
        if(!p.requests.has(target.id))return response.writeHead(403).end();
        p.requests.delete(target.id);target.requests.delete(p.id);p.friends.add(target.id);target.friends.add(p.id);
      } else if(action==='friend_decline') p.requests.delete(target.id);
      else if(action==='friend_remove') {p.friends.delete(target.id);target.friends.delete(p.id);}
      else return response.writeHead(400).end();
    }
    broadcast();response.writeHead(204).end();
  }
  return {start,remove,tick,broadcast,action};
}
