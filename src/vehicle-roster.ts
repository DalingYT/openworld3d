import type {CarState} from './cars';
export function createVehicleRoster(eject:(id:string)=>Promise<boolean>) {
  const panel=document.createElement('details');panel.hidden=true;
  panel.style.cssText='background:#162739ed;color:white;border-radius:8px;padding:8px;max-width:240px;font:13px system-ui';
  const title=document.createElement('summary'),list=document.createElement('div'),status=document.createElement('p');
  title.textContent='Ocupantes';status.setAttribute('role','status');panel.append(title,list,status);document.querySelector('#car-controls')!.append(panel);
  let self='',selfName='',people=new Map<string,string>(),cars:CarState[]=[],signature='';
  function render() {
    const car=cars.find(c=>c.driver===self || c.passengers?.includes(self));
    const key=JSON.stringify([self,selfName,car?.id,car?.driver,car?.passengers,[...people]]);
    if(signature===key)return;signature=key;
    panel.hidden=!car;list.replaceChildren();status.textContent='';if(!car){panel.open=false;return;}
    const ids=[car.driver,...car.passengers??[]].filter((id):id is string=>Boolean(id));title.textContent=`Ocupantes (${ids.length})`;
    for(const id of ids) {
      const row=document.createElement('p');row.textContent=`${id===self?selfName:people.get(id)??'Jugador'}${id===car.driver?' · Conductor':''}${id===self?' (tú)':''} `;
      if(car.driver===self && id!==self){const button=document.createElement('button');button.type='button';button.textContent='Bajar';button.onclick=async()=>{button.disabled=true;const ok=await eject(id);if(!ok){button.disabled=false;status.textContent='No se pudo bajar al pasajero.';}};row.append(button);}
      list.append(row);
    }
  }
  return {setSelf(id:string,name:string){self=id;selfName=name;render();},setPlayers(value:{id:string;name:string}[]){people=new Map(value.map(p=>[p.id,p.name]));render();},setCars(value:CarState[]){cars=value;render();}};
}
