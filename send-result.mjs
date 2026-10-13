// whatsapp-web.js 1.34.7 peut envoyer le message mais renvoyer undefined
// (incompatibilite _serialized/$1). Cela ne prouve PAS l'echec de l'envoi.
export function describeSendResult(sent) {
  const candidate = typeof sent?.id === 'string' ? sent.id
    : sent?.id?._serialized || sent?.id?.$1 || '';
  const id = typeof candidate === 'string' && candidate.trim() ? candidate : null;
  if (id) {
    return {
      ok: true,
      confirmed: true,
      status: 'accepted',
      message: '✅ WhatsApp a accepté le sticker. Vérifie la discussion pour confirmer sa réception.',
      id
    };
  }
  return {
    ok: true,
    confirmed: false,
    status: 'unconfirmed',
    message: '⚠️ Envoi lancé, mais WhatsApp ne retourne pas de confirmation technique. Vérifie la discussion avant de réessayer pour éviter un doublon.',
    id: null
  };
}

export function describeSendException() {
  return {
    ok: true,
    confirmed: false,
    status: 'unknown',
    message: '⚠️ Impossible de connaître le résultat de l’envoi. Il a peut-être déjà été effectué : vérifie la discussion avant de réessayer.',
    id: null
  };
}
