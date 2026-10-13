/**
 * Compatibilite WhatsApp Web 2.3000.x / whatsapp-web.js 1.34.7.
 * Cette fonction est executee DANS la page WhatsApp par Puppeteer.
 * Elle n'appelle ni getChatModel() ni chat.serialize() : ces operations
 * provoquent parfois "r: r" sur les versions recentes de WhatsApp Web.
 *
 * L'API WAWebCollections est interne/non officielle et peut evoluer.
 */
export function readMinimalChatsInPage() {
  if (typeof window.require !== 'function') {
    throw new Error('WhatsApp Web ne fournit pas window.require. Actualise la session puis reessaie.');
  }
  const chatStore = window.require('WAWebCollections')?.Chat;
  if (!chatStore || typeof chatStore.getModelsArray !== 'function') {
    throw new Error('Collection de discussions WhatsApp indisponible (WAWebCollections.Chat).');
  }
  const models = chatStore.getModelsArray();
  if (!Array.isArray(models)) {
    throw new Error('La collection WhatsApp ne retourne pas une liste de discussions.');
  }

  const found = new Map();
  for (const chat of models) {
    if (!chat) continue;
    try {
      const wid = chat.id;
      if (!wid) continue;
      // WhatsApp Web 2026 a remplace certains id._serialized par id.$1.
      let id = wid._serialized || wid.$1;
      if (!id && typeof wid.user === 'string' && typeof wid.server === 'string') {
        id = `${wid.user}@${wid.server}`;
      }
      if (typeof id !== 'string' || !/^[^\s@]+@(c\.us|g\.us|lid)$/.test(id)) continue;
      if (chat.isReadOnly === true) continue;

      let name = '';
      for (const candidate of [chat.name, chat.formattedTitle, chat.contact?.name, chat.contact?.pushname]) {
        if (typeof candidate === 'string' && candidate.trim()) {
          name = candidate.trim();
          break;
        }
      }
      if (!name) name = wid.user || id.split('@')[0];
      const timestamp = Number(chat.t ?? chat.timestamp ?? 0);
      found.set(id, {
        id,
        name: String(name).slice(0, 150),
        group: id.endsWith('@g.us'),
        timestamp: Number.isFinite(timestamp) ? timestamp : 0
      });
    } catch {
      // Une discussion obsolete ne doit pas bloquer toute la liste.
    }
  }
  return [...found.values()].sort((a, b) => b.timestamp - a.timestamp).slice(0, 2000);
}

export async function getChatsCompat(client) {
  if (!client.pupPage?.evaluate) {
    throw new Error('La page WhatsApp n\'est pas initialisee. Attends le statut Connecte.');
  }
  return client.pupPage.evaluate(readMinimalChatsInPage);
}
