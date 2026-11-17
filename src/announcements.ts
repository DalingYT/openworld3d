import './announcements.css';
export function createAnnouncements() {
  const banner = document.createElement('aside'); banner.id = 'global-announcement'; banner.hidden = true;
  banner.setAttribute('role', 'status');
  const title = document.createElement('strong'), text = document.createElement('p'), close = document.createElement('button');
  close.type = 'button'; close.textContent = 'Cerrar'; close.addEventListener('click', clear);
  banner.append(title, text, close); document.body.append(banner);
  let timer = 0;
  function clear() { window.clearTimeout(timer); banner.hidden = true; }
  return {
    clear,
    show(name: string, message: string) {
      clear(); title.textContent = `Anuncio · ${name}`; text.textContent = message; banner.hidden = false;
      timer = window.setTimeout(clear, 10000);
    }
  };
}
