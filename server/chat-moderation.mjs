import {filterChat} from './chat-filter.mjs';
export function createChatModeration(now = Date.now) {
  const entries = new Map();
  function status(key) {
    const time=now(), entry=entries.get(key);
    if(entry && entry.until<=time && !entry.hits.some(t=>time-t<120000)){entries.delete(key);return null;}
    return entry ?? null;
  }
  return {
    bannedUntil(key) { const e=status(key); return e && e.until>now() ? e.until : 0; },
    check(key,text) {
      const filtered=filterChat(text), time=now();
      if(filtered===text)return {text,until:0};
      const entry=status(key) ?? {hits:[],until:0};
      entry.hits=entry.hits.filter(t=>time-t<120000);entry.hits.push(time);
      if(entry.hits.length>=3)entry.until=time+600000;
      entries.set(key,entry);
      return {text:filtered,until:entry.until,strikes:entry.hits.length};
    },
    prune() { for(const key of entries.keys())status(key); }
  };
}
