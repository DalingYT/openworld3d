import * as THREE from 'three';
import catalog from '../shared/activities.json';
import {makeNameTag} from './name-tag';
import './phone.css';
type Profile={needs:{hunger:number;energy:number;fun:number};sleepUntil:number;coins:number;outfit:string;sticker:string;spoiler:boolean;match:number|null};
type Match={id:number;x:number;z:number;red:string[];blue:string[];score:number[];phase:string;until:number;ball:{x:number;z:number}};
export function createPhone(scene:THREE.Scene,send:(data:Record<string,unknown>)=>Promise<number>) {
  let self='',connected=false,profile:Profile={needs:{hunger:100,energy:100,fun:100},sleepUntil:0,coins:0,outfit:'none',sticker:'none',spoiler:false,match:null},matches:Match[]=[];
  const trigger=document.createElement('button');trigger.type='button';trigger.textContent='Teléfono';trigger.hidden=true;document.querySelector('#game-tools')!.append(trigger);
  const dialog=document.createElement('dialog');dialog.id='phone';dialog.setAttribute('aria-label','GuboPhone');
  const statusBar=document.createElement('div');statusBar.className='phone-status';
  const clock=document.createElement('time'),brand=document.createElement('span');brand.textContent='GuboPhone • ▰';statusBar.append(clock,brand);
  const header=document.createElement('header'),heading=document.createElement('h2');heading.textContent='Inicio';
  const back=document.createElement('button');back.type='button';back.textContent='‹ Inicio';back.onclick=()=>open();header.append(back,heading);
  const balance=document.createElement('p');balance.className='phone-wallet';
  const notice=document.createElement('p');notice.setAttribute('role','status');notice.className='phone-notice';
  const tabs=document.createElement('nav');tabs.setAttribute('aria-label','Aplicaciones');
  dialog.append(statusBar,header,balance,tabs);const sections=new Map<string,HTMLElement>();
  function open(tab='Inicio'){if(document.pointerLockElement)document.exitPointerLock();for(const [name,section]of sections)section.hidden=name!==tab;tabs.hidden=tab!=='Inicio';back.hidden=tab==='Inicio';heading.textContent=tab;notice.textContent='';if(!dialog.open)dialog.showModal();}
  const icons:Record<string,string>={Vida:'♥',Comida:'🍎',Ropa:'👕',Taller:'🔧',Emotes:'😄','Fútbol':'⚽',Explorar:'🧭'};
  function section(name:string){const el=document.createElement('section');el.hidden=true;sections.set(name,el);dialog.append(el);const b=document.createElement('button');b.type='button';b.className='phone-app';const icon=document.createElement('span');icon.className='phone-app-icon';icon.textContent=icons[name];icon.setAttribute('aria-hidden','true');const label=document.createElement('span');label.textContent=name;b.append(icon,label);b.onclick=()=>open(name);tabs.append(b);return el;}
  async function act(data:Record<string,unknown>){const status=await send(data);notice.textContent=status===204?'Listo.':status===402?'Te faltan GuboCoins.':status===429?'Espera un momento antes de repetir.':status===403?'Acércate al balón para patear.':'No disponible: baja del vehículo, revisa tus energías o acércate a una cama.';return status;}
  function button(parent:HTMLElement,text:string,data:Record<string,unknown>,close=false){const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=async()=>{b.disabled=true;try{const status=await act(data);if(close&&status===204)dialog.close();}finally{b.disabled=false;}};parent.append(b);return b;}
  const life=section('Vida');const explanation=document.createElement('p');explanation.textContent='Con menos de 15% de energía necesitas dormir 60 segundos. Solo puedes dormir dentro de tu propia casa. Compra una en Casas y amigos. Comida, ropa y accesorios se pagan con GuboCoins de esta sesión.';life.append(explanation);
  button(life,'Dormir en mi casa · 1 minuto',{action:'sleep'},true);
  const friends=document.createElement('button');friends.type='button';friends.textContent='Casas y amigos';friends.onclick=()=>{dialog.close();Array.from(document.querySelectorAll<HTMLButtonElement>('#game-tools button')).find(b=>b.textContent==='Vida')?.click();};life.append(friends);
  const food=section('Comida');for(const [id,item]of Object.entries(catalog.food))button(food,`${item.name} · ${item.price} GC (+${item.hunger} hambre)`,{action:'food',id});
  const clothes=section('Ropa');for(const [id,item]of Object.entries(catalog.outfits))button(clothes,`${item.name} · ${item.price} GC`,{action:'outfit',id});
  const workshop=section('Taller');button(workshop,'Alerón · 10 GC',{action:'spoiler',enabled:true});button(workshop,'Quitar alerón',{action:'spoiler',enabled:false});for(const [id,item]of Object.entries(catalog.stickers))button(workshop,`${item.name} · ${item.price} GC`,{action:'sticker',id});
  const emotes=section('Emotes');for(const [id,name]of Object.entries(catalog.emotes))button(emotes,name,{action:'emote',id},true);
  const football=section('Fútbol'),matchList=document.createElement('div');const rules=document.createElement('p');rules.textContent='Equipos automáticos. Empieza al llenarse: 3 minutos o 5 goles. Acércate al balón y pulsa F o Patear. El equipo ganador recibe 20 GC; los demás, 5 GC.';football.append(rules,matchList);for(let n=1;n<=5;n++)button(football,`${n}v${n} · Entrar`,{action:'football_join',mode:n},true);
  const guide=section('Explorar');const info=document.createElement('p');info.textContent='Ciudad: NPCs y tiendas. Oeste (X < −400): bosque. Este (X > 750): dunas. Norte (Z < −650): tundra. Hay animales cerca de los caminos naturales.';guide.append(info);
  const close=document.createElement('button');close.type='button';close.textContent='Cerrar teléfono';close.onclick=()=>dialog.close();const dock=document.createElement('footer');dock.className='phone-dock';const home=document.createElement('button');home.type='button';home.textContent='⌂ Inicio';home.onclick=()=>open();dock.append(home,close);dialog.append(notice,dock);document.body.append(dialog);trigger.onclick=()=>open();
  const shopSection=document.createElement('section');const shopHeading=document.createElement('h3');shopHeading.textContent='Comida, ropa y taller';shopSection.append(shopHeading);for(const tab of ['Comida','Ropa','Taller']){const b=document.createElement('button');b.type='button';b.textContent=tab;b.onclick=()=>{(document.querySelector('#hat-shop') as HTMLDialogElement).close();open(tab);};shopSection.append(b);}document.querySelector('#hat-catalog')!.after(shopSection);
  const hud=document.createElement('details');hud.id='needs';hud.hidden=true;const summary=document.createElement('summary');summary.textContent='Estado';hud.append(summary);const meters=new Map<string,{bar:HTMLProgressElement;text:HTMLElement}>();for(const [key,name]of [['hunger','Hambre'],['energy','Energía'],['fun','Diversión']]){const row=document.createElement('label'),text=document.createElement('span'),bar=document.createElement('progress');bar.max=100;bar.value=100;bar.setAttribute('aria-label',name);row.append(text,bar);hud.append(row);meters.set(key,{bar,text});}document.querySelector('#game-status')!.append(hud);
  const sleepStatus=document.createElement('p');sleepStatus.id='sleep-status';sleepStatus.hidden=true;document.querySelector('#game-status')!.append(sleepStatus);
  const footballStatus=document.createElement('p');footballStatus.hidden=true;document.querySelector('#game-status')!.append(footballStatus);
  const kick=document.createElement('button');kick.type='button';kick.id='football-kick';kick.textContent='Patear (F)';kick.hidden=true;kick.onclick=()=>void act({action:'football_kick'});document.querySelector('#car-controls')!.append(kick);
  const leave=button(document.querySelector('#car-controls')!,'Salir del fútbol',{action:'football_leave'});leave.id='football-leave';leave.hidden=true;
  window.addEventListener('keydown',event=>{if(event.code==='KeyF'&&!event.repeat&&!document.querySelector('dialog[open]')&&!(event.target instanceof HTMLInputElement)&&profile.match){event.preventDefault();void act({action:'football_kick'});}});
  const ballGeometry=new THREE.IcosahedronGeometry(.45,1),ballMaterial=new THREE.MeshLambertMaterial({color:0xf7f3e7}),balls=new Map<number,THREE.Mesh>();
  for(const f of catalog.fields){
    const turf=new THREE.Mesh(new THREE.PlaneGeometry(30,48),new THREE.MeshLambertMaterial({color:0x3e9b56}));turf.rotation.x=-Math.PI/2;turf.position.set(f.x,f.height+.03,f.z);scene.add(turf);
    const points:number[]=[];const line=(x1:number,z1:number,x2:number,z2:number)=>points.push(f.x+x1,f.height+.07,f.z+z1,f.x+x2,f.height+.07,f.z+z2);
    line(-15,-24,15,-24);line(-15,24,15,24);line(-15,-24,-15,24);line(15,-24,15,24);line(-15,0,15,0);for(let i=0;i<24;i++)line(Math.cos(i*Math.PI/12)*4,Math.sin(i*Math.PI/12)*4,Math.cos((i+1)*Math.PI/12)*4,Math.sin((i+1)*Math.PI/12)*4);
    scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(points,3)),new THREE.LineBasicMaterial({color:0xffffff})));
    for(const end of [-1,1]){const goal=new THREE.Group();for(const x of [-5,5]){const post=new THREE.Mesh(new THREE.BoxGeometry(.15,2.8,.15),ballMaterial);post.position.set(x,1.4,0);goal.add(post);}const beam=new THREE.Mesh(new THREE.BoxGeometry(10,.15,.15),ballMaterial);beam.position.y=2.8;goal.add(beam);goal.position.set(f.x,f.height,f.z+end*24);scene.add(goal);}
    const label=makeNameTag(`Fútbol ${f.id}v${f.id}`);label.position.set(f.x,f.height+3,f.z+27);scene.add(label);const ball=new THREE.Mesh(ballGeometry,ballMaterial);ball.position.set(f.x,f.height+.5,f.z);scene.add(ball);balls.set(f.id,ball);
  }
  let lastHud=0;
  return {
    get open(){return dialog.open;},get sleeping(){return profile.sleepUntil>Date.now();},get canRun(){return profile.needs.energy>=15;},get outfit(){return profile.outfit;},
    get field(){return matches.find(m=>m.id===profile.match);},
    setConnected(id:string){self=id;connected=Boolean(id);trigger.hidden=hud.hidden=!connected;if(!connected){dialog.close();profile.match=null;profile.sleepUntil=0;leave.hidden=kick.hidden=footballStatus.hidden=sleepStatus.hidden=true;}},
    receiveProfile(data:Profile){profile=data;balance.textContent=`${data.coins} GuboCoins · Ropa: ${catalog.outfits[data.outfit as keyof typeof catalog.outfits]?.name??'Sin ropa'} · Alerón: ${data.spoiler?'sí':'no'} · Sticker: ${catalog.stickers[data.sticker as keyof typeof catalog.stickers]?.name??'Sin sticker'}`;},
    receiveFootball(data:Match[]){matches=data;profile.match=data.find(m=>m.red.includes(self)||m.blue.includes(self))?.id??null;},
    update(time:number,delta:number){
      for(const m of matches){const ball=balls.get(m.id);if(ball){ball.position.x=THREE.MathUtils.lerp(ball.position.x,m.ball.x,1-Math.exp(-delta*20));ball.position.z=THREE.MathUtils.lerp(ball.position.z,m.ball.z,1-Math.exp(-delta*20));}}
      if(time-lastHud<250)return;lastHud=time;
      for(const [key,label]of [['hunger','Hambre'],['energy','Energía'],['fun','Diversión']] as const){const m=meters.get(key)!;m.bar.value=profile.needs[key];m.text.textContent=`${label}: ${Math.ceil(profile.needs[key])}%`;}
      summary.textContent=profile.needs.energy<15?'Estado · Necesitas dormir':'Estado';
      sleepStatus.hidden=!connected||profile.sleepUntil<=Date.now();sleepStatus.textContent=`Durmiendo… ${Math.max(0,Math.ceil((profile.sleepUntil-Date.now())/1000))} s`;
      clock.textContent=new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
      const match=matches.find(m=>m.id===profile.match);leave.hidden=!connected||!match;footballStatus.hidden=!connected||!match;kick.hidden=!connected||match?.phase!=='playing';
      if(match)footballStatus.textContent=`${match.id}v${match.id} · ${match.red.includes(self)?'Rojo':'Azul'} · ${match.score[0]} – ${match.score[1]} · ${match.phase==='waiting'?`Esperando ${2*match.id-match.red.length-match.blue.length} jugadores`:match.phase==='finished'?'Fin del partido':Math.max(0,Math.ceil((match.until-Date.now())/1000))+' s'}`;
      matchList.textContent=matches.map(m=>`${m.id}v${m.id}: ${m.red.length+m.blue.length}/${m.id*2} · ${m.score[0]}-${m.score[1]}`).join(' | ');
    }
  };
}
