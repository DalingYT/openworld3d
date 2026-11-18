import * as THREE from 'three';
const box=new THREE.BoxGeometry(1,1,1);
const mats=new Map<number,THREE.MeshLambertMaterial>();
const material=(color:number)=>{let m=mats.get(color);if(!m){m=new THREE.MeshLambertMaterial({color});mats.set(color,m);}return m;};
const worn=new WeakMap<THREE.Group,string>();
export function outfit(avatar:THREE.Group,id='none') {
  if(worn.get(avatar)===id)return;worn.set(avatar,id);avatar.getObjectByName('outfit')?.removeFromParent();
  if(id==='none')return;
  const group=new THREE.Group();group.name='outfit';
  const piece=(color:number,x:number,y:number,z:number,w:number,h:number,d:number)=>{const m=new THREE.Mesh(box,material(color));m.position.set(x,y,z);m.scale.set(w,h,d);group.add(m);};
  const color=id==='shirt'?0xf28c38:id==='stripes'?0xf2e5bb:id==='suit'?0x252c3b:0x9b7cce;
  piece(color,0,.5,0,1.025,.95,1.025);
  if(id==='stripes'||id==='pajamas')for(const y of [.2,.45,.7])piece(id==='stripes'?0x2b6a98:0xe1c7f3,0,y,-.519,1.03,.12,.02);
  if(id==='suit'){piece(0xf5f4df,0,.7,-.52,.25,.6,.02);piece(0xd44a60,0,.7,-.54,.08,.5,.02);}
  avatar.add(group);
}
const stickerMaterials=new Map<string,THREE.MeshBasicMaterial>();
function stickerMaterial(id:string){let mat=stickerMaterials.get(id);if(mat)return mat;const image=document.createElement('canvas');image.width=image.height=128;const ctx=image.getContext('2d')!;ctx.clearRect(0,0,128,128);ctx.fillStyle=id==='star'?'#ffe260':id==='bolt'?'#6de9ff':'#ff7b38';ctx.font='bold 104px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(id==='star'?'★':id==='bolt'?'ϟ':'♨',64,68);const map=new THREE.CanvasTexture(image);map.colorSpace=THREE.SRGBColorSpace;mat=new THREE.MeshBasicMaterial({map,transparent:true,depthWrite:false,side:THREE.DoubleSide});stickerMaterials.set(id,mat);return mat;}
const stickerPlane=new THREE.PlaneGeometry(.8,.6),customized=new WeakMap<THREE.Group,string>();
export function customizeCar(mesh:THREE.Group,spoiler=false,sticker='none',boat=false){
  const key=`${spoiler}:${sticker}:${boat}`;if(customized.get(mesh)===key)return;customized.set(mesh,key);mesh.getObjectByName('accessories')?.removeFromParent();const group=new THREE.Group();group.name='accessories';
  if(spoiler&&!boat){for(const x of [-.72,.72]){const post=new THREE.Mesh(box,material(0x252c3b));post.scale.set(.12,.55,.14);post.position.set(x,1.18,1.65);group.add(post);}const wing=new THREE.Mesh(box,material(0x252c3b));wing.scale.set(2.25,.13,.5);wing.position.set(0,1.48,1.65);group.add(wing);}
  if(['star','bolt','flame'].includes(sticker))for(const sign of [-1,1]){const plane=new THREE.Mesh(stickerPlane,stickerMaterial(sticker));plane.position.set(sign*1.105,boat?.55:.7,.3);plane.rotation.y=sign*Math.PI/2;group.add(plane);}
  mesh.add(group);
}
export function poseEmote(avatar:THREE.Group,id:string|null,time:number){
  if(!id){avatar.rotation.z=0;avatar.scale.set(1,1,1);return;}
  const phase=time/180;avatar.rotation.z=Math.sin(phase)*(id==='dance'?.18:id==='wave'?.1:.06);
  avatar.scale.y=1+Math.abs(Math.sin(phase))*(id==='celebrate'?.12:.04);
}
