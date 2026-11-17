import assert from 'node:assert/strict';
import {createChatModeration} from '../server/chat-moderation.mjs';
let now=1000;const mod=createChatModeration(()=>now);
assert.equal(mod.check('a','hola').until,0);
for(let i=0;i<2;i++){assert.equal(mod.check('a','puta').until,0);now+=2000;}
const banned=mod.check('a','p u t a');assert.equal(banned.until,now+600000);
assert.equal(mod.bannedUntil('a'),banned.until);assert.equal(mod.bannedUntil('b'),0);
now=banned.until;assert.equal(mod.bannedUntil('a'),0);
assert.equal(mod.check('a','puta').until,0);now+=120001;assert.equal(mod.check('a','puta').until,0);
console.log('PASS: three strikes, ten-minute expiry, separate identities, old strikes expire');
