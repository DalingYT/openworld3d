import assert from 'node:assert/strict';
import {filterChat} from '../server/chat-filter.mjs';
for(const text of ['PUTA','m13rd4','p u t o','s.e.x.o','pendejooo','cabrón','hola puta!'])assert.equal(filterChat(text),'[Mensaje filtrado]',text);
for(const text of ['hola amigos','computadora','disputar una carrera','Muerte','¿Vamos al barco?'])assert.equal(filterChat(text),text);
console.log('PASS: accents, case, leetspeak, punctuation, spacing, repeated letters and harmless words');
