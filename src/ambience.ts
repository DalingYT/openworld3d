import * as THREE from 'three';
import {makeNameTag} from './name-tag';
import {World} from './world';
export function createAmbience(scene:THREE.Scene,world:World,makeAvatar:(color:number)=>THREE.Group) {
  const people=[{name:'Luna · Guía',x:-7,z:-54,color:0xf3b34f,text:'¡Bienvenido! En el Teléfono encontrarás ropa, comida, emotes y fútbol. Las casas están a ambos lados de la ciudad.'},{name:'Nico · Entrenador',x:7,z:-85,color:0x6ac1d4,text:'En Fútbol elige de 1v1 a 5v5. Se necesitan todos los jugadores para empezar. Acércate al balón, mira hacia donde quieres tirar y pulsa F.'},{name:'Sol · Vecina',x:-43,z:-116,color:0xbd83d7,text:'Si tu energía baja de 15%, descansa un minuto. Hay camas públicas en X −8, Z −35 y una cama en tu casa.'}].map(p=>{const mesh=makeAvatar(p.color);const tag=makeNameTag(p.name);mesh.add(tag);scene.add(mesh);return {...p,mesh};});
  const talk=document.createElement('button');talk.type='button';talk.textContent='Hablar';talk.hidden=true;document.querySelector('#car-controls')!.append(talk);
  const bubble=document.createElement('p');bubble.hidden=true;bubble.style.cssText='position:fixed;left:50%;bottom:140px;transform:translateX(-50%);max-width:min(420px,80vw);background:#162739ed;color:white;padding:12px;border-radius:10px;font:14px system-ui;pointer-events:none;z-index:15';document.body.append(bubble);
  let nearest:typeof people[number]|undefined,until=0;
  talk.onclick=()=>{if(nearest){bubble.textContent=nearest.text;bubble.hidden=false;until=performance.now()+8000;}};
  const box=new THREE.BoxGeometry(1,1,1),cream=new THREE.MeshLambertMaterial({color:0xe5cda8}),dark=new THREE.MeshLambertMaterial({color:0x604835}),black=new THREE.MeshLambertMaterial({color:0x22282e});
  const parts=[{mat:cream,offset:[0,.55,0],size:[.6,.45,1]},{mat:cream,offset:[0,.8,-.55],size:[.46,.4,.45]},{mat:dark,offset:[-.18,1.1,-.55],size:[.13,.5,.13]},{mat:dark,offset:[.18,1.1,-.55],size:[.13,.5,.13]},{mat:dark,offset:[-.22,.22,.25],size:[.15,.4,.55]},{mat:dark,offset:[.22,.22,.25],size:[.15,.4,.55]},{mat:black,offset:[0,.8,-.79],size:[.25,.08,.03]}];
  const instances=parts.map(part=>{const mesh=new THREE.InstancedMesh(box,part.mat,9);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;scene.add(mesh);return mesh;});
  const root=new THREE.Object3D(),piece=new THREE.Object3D(),matrix=new THREE.Matrix4();
  const rest=new THREE.Group();rest.position.set(-8,5.5,-35);for(const x of [-2,2]){const mattress=new THREE.Mesh(box,cream);mattress.scale.set(1.6,.45,2.5);mattress.position.set(x,.3,0);rest.add(mattress);const pillow=new THREE.Mesh(box,new THREE.MeshLambertMaterial({color:0xf5f4e8}));pillow.scale.set(1.5,.18,.5);pillow.position.set(x,.62,-.8);rest.add(pillow);}const tag=makeNameTag('Descanso público · Teléfono → Vida');tag.position.set(0,2,0);rest.add(tag);scene.add(rest);
  const particlePositions=new Float32Array(96*3),particleGeometry=new THREE.BufferGeometry();particleGeometry.setAttribute('position',new THREE.BufferAttribute(particlePositions,3));const particleMaterial=new THREE.PointsMaterial({size:.18,color:0xe8f4fa,transparent:true,opacity:.65,depthWrite:false});const particles=new THREE.Points(particleGeometry,particleMaterial);particles.frustumCulled=false;scene.add(particles);
  let last=0;
  return {update(time:number,position:THREE.Vector3,available:boolean){
    if(time-last<90)return;last=time;const seconds=time/1000;
    nearest=undefined;
    for(const [i,p]of people.entries()){const z=p.z+Math.sin(seconds*.16+i)*2;p.mesh.position.set(p.x,world.groundHeight(p.x,z),z);p.mesh.rotation.y=Math.cos(seconds*.16+i)>0?Math.PI:0;p.mesh.visible=p.mesh.position.distanceToSquared(position)<130**2;if(available&&p.mesh.position.distanceToSquared(position)<16)nearest=p;}
    talk.hidden=!nearest;if(nearest)talk.textContent='Hablar con '+nearest.name.split(' · ')[0];if(performance.now()>until)bubble.hidden=true;
    const cx=Math.floor(position.x/80),cz=Math.floor(position.z/80);
    for(let i=0;i<9;i++){
      const tx=cx+i%3-1,tz=cz+Math.floor(i/3)-1,seed=Math.abs(Math.sin(tx*37+tz*61))*1000;
      const angle=seconds*.12+seed,x=tx*80+35+Math.cos(angle)*4,z=tz*80+35+Math.sin(angle)*4,y=world.groundHeight(x,z);
      const safe=y>2&&!(x>-90&&x<95&&z<0&&z> -180)&&!(x>120&&x<530&&z< -45&&z> -125);
      root.position.set(x,y+Math.max(0,Math.sin(seconds*3+seed))*.12,z);root.rotation.set(0,-angle,0);root.scale.setScalar(safe?(i%2?.8:1.1):0);root.updateMatrix();
      for(const [j,part]of parts.entries()){piece.position.fromArray(part.offset);piece.scale.fromArray(part.size);if(i%2&&j>=2&&j<=3)piece.scale.y=.18;piece.updateMatrix();matrix.multiplyMatrices(root.matrix,piece.matrix);instances[j].setMatrixAt(i,matrix);}
    }
    instances.forEach(mesh=>mesh.instanceMatrix.needsUpdate=true);
    const snow=position.z< -650,dust=position.x>750,leaves=position.x< -400;particles.visible=snow||dust||leaves;
    if(particles.visible){particleMaterial.color.set(snow?0xeaf5ff:dust?0xd5b477:0xa1c871);for(let i=0;i<96;i++){particlePositions[i*3]=position.x+Math.sin(i*78.3)*35+Math.sin(seconds+i)*2;particlePositions[i*3+1]=position.y+((i*.7-seconds*(snow?1:0.5))%16+16)%16;particlePositions[i*3+2]=position.z+Math.cos(i*43.7)*35;}particleGeometry.attributes.position.needsUpdate=true;}
  }};
}
