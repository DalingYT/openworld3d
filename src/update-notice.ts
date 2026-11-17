export function setupUpdateNotice() {
  const current = import.meta.env.VITE_BUILD_ID;
  if (!current) return;
  let shown = false, checking = false;
  async function check() {
    if (shown || checking || document.hidden) return;
    checking = true;
    try {
      const response = await fetch(import.meta.env.BASE_URL + 'version.json?t=' + Date.now(), {cache:'no-store'});
      if (!response.ok) return;
      const {version} = await response.json();
      if (typeof version !== 'string' || version === current) return;
      shown = true;
      const notice = document.createElement('aside'); notice.setAttribute('role','status');
      notice.style.cssText='position:fixed;bottom:12px;left:50%;transform:translateX(-50%);z-index:50;max-width:90vw;padding:12px;background:#162739;color:white;border:1px solid #9edaff;border-radius:8px;font:14px system-ui';
      const message=document.createElement('p');message.textContent='Hay una nueva actualización. Puedes seguir jugando o recargar; recargar reinicia tu sesión.';
      const reload=document.createElement('button');reload.textContent='Actualizar';reload.onclick=()=>location.reload();
      const later=document.createElement('button');later.textContent='Después';later.onclick=()=>notice.remove();
      notice.append(message,reload,later);document.body.append(notice);
    } catch {} finally { checking=false; }
  }
  void check();window.setInterval(()=>void check(),60000);
  document.addEventListener('visibilitychange',()=>void check());
}
