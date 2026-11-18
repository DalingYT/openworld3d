import changelog from '../CHANGELOG.md?raw';
import './changelog.css';

export function createChangelog() {
  const dialog = document.createElement('dialog');
  dialog.id = 'changelog-panel';
  dialog.setAttribute('aria-labelledby', 'changelog-title');
  const header = document.createElement('header');
  const title = document.createElement('h2');
  title.id = 'changelog-title'; title.textContent = 'Novedades';
  const close = document.createElement('button');
  close.type = 'button'; close.textContent = 'Cerrar';
  close.onclick = () => dialog.close();
  header.append(title, close);
  const content = document.createElement('article');
  // Render the small Markdown subset used in the changelog as safe DOM nodes.
  function inline(element: HTMLElement, text: string) {
    for (const [index, part] of text.split('**').entries()) {
      if (index % 2) { const strong = document.createElement('strong'); strong.textContent = part; element.append(strong); }
      else element.append(document.createTextNode(part));
    }
  }
  let list: HTMLUListElement | undefined;
  for (const line of changelog.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('# ')) { list = undefined; continue; }
    if (line.startsWith('- ')) {
      if (!list) { list = document.createElement('ul'); content.append(list); }
      const item = document.createElement('li'); inline(item, line.slice(2)); list.append(item); continue;
    }
    list = undefined;
    const heading = /^(#{2,3}) (.+)$/.exec(line);
    const element = document.createElement(heading ? (heading[1].length === 2 ? 'h3' : 'h4') : 'p');
    inline(element, heading ? heading[2] : line); content.append(element);
  }
  dialog.append(header, content); document.body.append(dialog);
  const trigger = document.createElement('button');
  trigger.type = 'button'; trigger.textContent = 'Novedades';
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.onclick = () => { if (document.pointerLockElement) document.exitPointerLock(); if (!dialog.open) dialog.showModal(); };
  document.querySelector('#game-tools')!.append(trigger);
  return { get open() { return dialog.open; } };
}
