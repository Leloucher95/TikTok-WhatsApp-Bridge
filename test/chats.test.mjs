import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getChatsCompat, readMinimalChatsInPage} from '../chats.mjs';

function runWithModels(models) {
  const old = globalThis.window;
  globalThis.window = {require: (name) => {
    assert.equal(name, 'WAWebCollections');
    return {Chat: {getModelsArray: () => models}};
  }};
  try {return readMinimalChatsInPage();}
  finally {if (old === undefined) delete globalThis.window; else globalThis.window = old;}
}

test('charge les discussions avec id.$1 si _serialized manque', () => {
  const got = runWithModels([
    {id: {$1: '123@c.us', user: '123'}, name: 'A', t: 10},
    {id: {_serialized: '999@g.us'}, formattedTitle: 'Groupe', timestamp: 30},
    {id: {$1: '1234@lid', user: '1234'}, contact: {pushname: 'Contact LID'}, t: 20}
  ]);
  assert.deepEqual(got.map(x => x.id), ['999@g.us', '1234@lid', '123@c.us']);
  assert.deepEqual(got.map(x => x.group), [true, false, false]);
  assert.equal(got[1].name, 'Contact LID');
});

test('ignore les discussions invalides, readonly et une entree dont un getter plante', () => {
  const bad = {id: {$1: 'willnotread@c.us'}};
  Object.defineProperty(bad, 'isReadOnly', {get() {throw new Error('r');}});
  const got = runWithModels([
    bad,
    {id: {$1: '124@c.us'}, name: 'bloquee', isReadOnly: true},
    {id: {$1: 'n@newsletter'}, name: 'canal'},
    {id: {$1: '555@c.us'}, name: 'OK'},
    {id: {$1: '555@c.us'}, name: 'OK'},
    null
  ]);
  assert.equal(got.length, 1);
  assert.equal(got[0].id, '555@c.us');
});

test('signale une erreur explicite si WhatsApp Web change', () => {
  const old = globalThis.window;
  globalThis.window = {require: () => ({})};
  try {assert.throws(() => readMinimalChatsInPage(), /WAWebCollections.Chat/);}
  finally {if (old === undefined) delete globalThis.window; else globalThis.window = old;}
});

test('execute la lecture dans la page du client', async () => {
  const client = {pupPage: {evaluate: async (fn) => {assert.equal(fn, readMinimalChatsInPage); return [{id:'1@c.us'}];}}};
  assert.deepEqual(await getChatsCompat(client), [{id:'1@c.us'}]);
});
