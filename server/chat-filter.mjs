// Whole-word matching avoids censoring harmless words such as “computadora”.
const words = ['puta','puto','putas','putos','mierda','cabron','cabrones','pendejo','pendeja','pendejos','pendejas','verga','chinga','chingada','chingado','joder','gilipollas','coño','sexo','porno','pornografia','pene','vagina','fuck','fucking','shit','bitch'];
const normalize = text => text.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[013457@$]/g,c=>({'0':'o','1':'i','3':'e','4':'a','5':'s','7':'t','@':'a','$':'s'}[c]));
const patterns = words.map(word => new RegExp('(?:^|[^a-z0-9])'+[...normalize(word)].map(c=>c+'+').join('[^a-z0-9]*')+'(?:$|[^a-z0-9])','u'));
export function filterChat(text) {
  const normalized=normalize(text);
  return patterns.some(pattern=>pattern.test(normalized)) ? '[Mensaje filtrado]' : text;
}
