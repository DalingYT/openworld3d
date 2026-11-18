import * as THREE from 'three';
import plots from '../shared/houses.json';
import { World } from './world';
import {makeNameTag,disposeNameTag} from './name-tag';
import './life.css';
type Home = {id:string;x:number;z:number;owner:string|null;name:string;price:number};
type Profile = {coins:number;house:string|null;flying:boolean;friends:string[];incoming:string[];outgoing:string[]};
type Person = {id:string;name:string};
const accessible = new Set<string>();
export function hitsHouse(x:number,z:number,radius:number,car=false,fromX=x,fromZ=z) {
  radius/=1.4;
  return plots.some(h=>{
    const dx=Math.abs(x-h.x)/1.4,dz=(z-h.z)/1.4;
    if(dx>4.2+radius||Math.abs(dz)>5.2+radius)return false;
    if(car)return true; // Cars cannot occupy any part of a house, including its interior.
    if(dx>3.8-radius||dz< -4.8+radius)return true;
    const leaving = Math.abs(fromX-h.x)/1.4<3.8 && (fromZ-h.z)/1.4> -4.8 && (fromZ-h.z)/1.4<5.7 && z>=fromZ;
    return dz>4.8-radius && (car||(!accessible.has(h.id)&&!leaving)||dx>1.2-radius);
  });
}
export function createLife(scene:THREE.Scene,world:World,send:(data:Record<string,string>)=>Promise<number>,visit:(x:number,z:number)=>void) {
  let profile:Profile={coins:0,house:null,flying:false,friends:[],incoming:[],outgoing:[]};
  let homes:Home[]=[],people:Person[]=[],self='',signature='';
  const structures=new Map<string,{label:THREE.Sprite;door:THREE.Mesh;group:THREE.Group;name:string}>();
  const box=new THREE.BoxGeometry(1,1,1),wall=new THREE.MeshLambertMaterial({color:0xe3c9a1}),roof=new THREE.MeshLambertMaterial({color:0x934f58}),wood=new THREE.MeshLambertMaterial({color:0x684b35});
  for(const h of plots){
    const group=new THREE.Group();group.scale.set(1.4,1,1.4);group.position.set(h.x,world.groundHeight(h.x,h.z),h.z);
    const piece=(mat:THREE.Material,x:number,y:number,z:number,w:number,hh:number,d:number)=>{const m=new THREE.Mesh(box,mat);m.position.set(x,y,z);m.scale.set(w,hh,d);group.add(m);return m;};
    piece(wood,0,.05,0,8,.1,10);piece(wall,-4,1.6,0,.3,3.2,10);piece(wall,4,1.6,0,.3,3.2,10);piece(wall,0,1.6,-5,8,3.2,.3);
    piece(wall,-2.65,1.6,5,2.7,3.2,.3);piece(wall,2.65,1.6,5,2.7,3.2,.3);piece(wall,0,3,5,2.6,.4,.3);
    piece(roof,0,3.4,0,8.7,.35,10.7);
    piece(wood,1,.5,2,2,.8,1);piece(wall,1,.95,2.4,2,.5,.2);
    piece(wall,3,1,-3,.3,2,2);
    piece(roof,-2,.35,-2,2,.6,3);piece(wall,-2,.7,-3,2,.15,1);piece(wood,2,.7,-1,1.6,1.4,1.4);
    const door=piece(wood,0,1.4,5,2.6,2.8,.2),label=makeNameTag('Casa disponible');label.position.set(0,4.4,3);group.add(label);scene.add(group);structures.set(h.id,{label,door,group,name:''});
  }
  const trigger=document.createElement('button');trigger.type='button';trigger.textContent='Vida';trigger.hidden=true;document.querySelector('#game-tools')!.append(trigger);
  const coins=document.createElement('p');coins.hidden=true;document.querySelector('#game-status')!.append(coins);
  const dialog=document.createElement('dialog');dialog.id='life-panel';
  const title=document.createElement('h2');title.textContent='GuboCoins · Casa · Amigos';
  const description=document.createElement('p');description.textContent='100 GuboCoins de bienvenida y 5 cada minuto conectado. Todo dura solo esta sesión.';
  const balance=document.createElement('p'),friends=document.createElement('div'),houses=document.createElement('div'),notice=document.createElement('p');notice.setAttribute('role','status');
  const close=document.createElement('button');close.type='button';close.textContent='Cerrar';close.addEventListener('click',()=>dialog.close());
  dialog.append(title,description,balance,friends,houses,notice,close);document.body.append(dialog);
  trigger.addEventListener('click',()=>{if(document.pointerLockElement)document.exitPointerLock();dialog.showModal();});
  function button(label:string,data:Record<string,string>){const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',async()=>{b.disabled=true;const status=await send(data);notice.textContent=status===204?'Listo.':status===402?'No tienes suficientes GuboCoins.':status===403?'Necesitas permiso o una solicitud pendiente.':status===409?'Baja del carro o revisa si la casa ya está ocupada.':'No se pudo completar. Inténtalo de nuevo.';b.disabled=false;});return b;}
  function render(){
    coins.textContent=`GuboCoins: ${profile.coins}`;balance.textContent=`Saldo: ${profile.coins} · ${profile.house?'Tienes tu propia casa':'Casa: 80 GuboCoins'}`;
    accessible.clear();for(const h of homes)if(h.owner===self||h.owner&&profile.friends.includes(h.owner))accessible.add(h.id);
    for(const h of homes){const structure=structures.get(h.id);if(!structure)continue;structure.door.visible=!accessible.has(h.id);const name=h.owner?'Casa de '+h.name:'Disponible · 80 GC';if(structure.name!==name){disposeNameTag(structure.label);structure.label=makeNameTag(name);structure.label.position.set(0,4.4,3);structure.group.add(structure.label);structure.name=name;}}
    friends.replaceChildren();const fh=document.createElement('h3');fh.textContent='Amigos temporales';friends.append(fh);
    for(const p of people){const row=document.createElement('p');row.append(p.name+' ');if(profile.friends.includes(p.id))row.append(button('Eliminar amigo',{action:'friend_remove',targetId:p.id}));else if(profile.incoming.includes(p.id))row.append(button('Aceptar',{action:'friend_accept',targetId:p.id}),button('Rechazar',{action:'friend_decline',targetId:p.id}));else if(profile.outgoing.includes(p.id))row.append('Solicitud enviada');else row.append(button('Agregar',{action:'friend_request',targetId:p.id}));friends.append(row);}
    if(!people.length)friends.append('No hay otros jugadores conectados.');
    houses.replaceChildren();const hh=document.createElement('h3');hh.textContent='Casas';houses.append(hh);
    for(const [i,h] of homes.entries()){const row=document.createElement('p');row.append(`Casa ${i+1} · ${h.owner?h.name:'Disponible'} · X ${h.x}, Z ${h.z} `);if(accessible.has(h.id))row.append(button('Visitar',{action:'enter_house',houseId:h.id}));else if(!h.owner&&!profile.house)row.append(button('Comprar · 80 GC',{action:'buy_house',houseId:h.id}));houses.append(row);}
  }
  return {
    get open(){return dialog.open},
    setPlayers(value:Person[]){const next=JSON.stringify(value);if(next!==signature){people=value.filter(p=>p.id!==self);signature=next;render();}},
    setConnected(id:string,enabled:boolean){self=id;trigger.hidden=coins.hidden=!enabled;profile={coins:0,house:null,flying:false,friends:[],incoming:[],outgoing:[]};homes=[];accessible.clear();for(const s of structures.values())s.door.visible=true;dialog.close();render();},
    receiveProfile(value:Profile){profile=value;render();},
    receiveHomes(value:Home[]){homes=value;render();},
    visit(id:string){const h=plots.find(h=>h.id===id);if(h){dialog.close();visit(h.x,h.z+2);}}
  };
}
