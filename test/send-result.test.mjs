import test from 'node:test';
import assert from 'node:assert/strict';
import {describeSendResult, describeSendException} from '../send-result.mjs';

test('undefined apres envoi ne doit jamais produire une fausse erreur', () => {
  const result = describeSendResult(undefined);
  assert.equal(result.ok, true);
  assert.equal(result.confirmed, false);
  assert.equal(result.status, 'unconfirmed');
  assert.match(result.message, /avant de réessayer/i);
});

test('ancien et nouvel identifiants WhatsApp sont pris en charge', () => {
  for (const id of [{_serialized:'abc@c.us'}, {$1:'abc@c.us'}, 'abc@c.us']) {
    const result = describeSendResult({id});
    assert.equal(result.confirmed, true);
    assert.equal(result.id, 'abc@c.us');
  }
});

test('objet sans ID ne constitue pas une preuve de confirmation', () => {
  assert.equal(describeSendResult({foo:'bar'}).confirmed, false);
});

test('exception apres l’appel signalee comme indeterminee', () => {
  const result = describeSendException();
  assert.equal(result.status, 'unknown');
  assert.equal(result.confirmed, false);
});
