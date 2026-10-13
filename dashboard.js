const el = (id) => document.getElementById(id);
const PREF_CHAT = 'ttwa.v06.last-chat';
const PREF_DIRECT = 'ttwa.v06.direct';
const TRUSTED_TIKTOK = new Set(['https://www.tiktok.com', 'https://m.tiktok.com']);
let chats = [];
let lastStickerFingerprint = '';
let ready = false;
let hasSticker = false;
let stickerRevision = null;
let sending = false;
let importing = false;
let importFeedbackTimer = null;
let lastChatId = getStored(PREF_CHAT) || '';
let directMode = getStored(PREF_DIRECT) === 'yes';
let handoffAccepted = false;

function getStored(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function store(key, value) {
  try { localStorage.setItem(key, value); } catch { /* navigation privee : preferences non persistantes */ }
}
function importNote(message, error = false, autoClearMs = 0) {
  clearTimeout(importFeedbackTimer);
  el('import-feedback').textContent = message;
  el('import-feedback').style.color = error ? '#ffacb5' : '#cdb2ff';
  if (autoClearMs > 0) {
    importFeedbackTimer = setTimeout(() => {
      el('import-feedback').textContent = '';
      importFeedbackTimer = null;
    }, autoClearMs);
  }
}
function note(message, error = false) {
  el('feedback').textContent = message;
  el('feedback').style.color = error === 'warning' ? '#ffc77d' : error ? '#ffacb5' : '#cdb2ff';
}
async function request(url, options = {}) {
  const res = await fetch(url, {cache:'no-store', ...options});
  const content = await res.json();
  if (!res.ok || content.ok === false) throw new Error(content.error || `Erreur HTTP ${res.status}`);
  return content;
}
function selectedRecipient() {
  return chats.find(chat => chat.id === lastChatId) || null;
}
function renderDirectHint() {
  const recipient = selectedRecipient();
  el('direct-mode').checked = directMode;
  el('direct-hint').textContent = directMode
    ? recipient ? `🟢 Envoi direct actif → ${recipient.name}. Décoche pour revenir au mode manuel.`
      : '⚠️ Envoi direct en attente : destinataire mémorisé introuvable. Choisis une discussion.'
    : recipient ? `Dernier destinataire : ${recipient.name}. Mode manuel actif.`
      : 'Choisis une discussion pour mémoriser ton destinataire.';
}
function renderChats() {
  const search = el('filter').value.trim().toLocaleLowerCase('fr');
  const select = el('chat');
  select.replaceChildren();
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = chats.length ? '— Sélectionne une discussion —' : 'Aucune discussion disponible';
  select.append(placeholder);
  for (const chat of chats) {
    // Le dernier contact doit rester selectionnable meme quand le filtre change.
    if (search && chat.id !== lastChatId && !chat.name.toLocaleLowerCase('fr').includes(search)) continue;
    const option = document.createElement('option');
    option.value = chat.id;
    option.textContent = `${chat.group ? '👥' : '👤'} ${chat.name}`;
    select.append(option);
  }
  select.value = selectedRecipient() ? lastChatId : '';
  renderDirectHint();
  updateButton();
}
function updateButton() {
  el('send').disabled = !ready || !hasSticker || !selectedRecipient() || sending || importing;
}
async function updateChats() {
  if (!ready) return;
  try {
    chats = (await request('/api/chats')).chats;
    renderChats();
  } catch(err) { note(`Discussions indisponibles : ${err.message}`, true); }
}
async function refresh() {
  try {
    const state = await request('/api/status');
    const previouslyReady = ready;
    ready = state.ready;
    hasSticker = !!state.sticker;
    el('status').textContent = `${ready ? '● Connecté' : '◌ Non connecté'} — ${state.message}`;
    el('status').style.borderColor = ready ? '#435a4b' : '#373048';
    const s = state.sticker;
    stickerRevision = s ? s.revision : null;
    const fingerprint = s ? s.revision : '';
    if (fingerprint !== lastStickerFingerprint) {
      lastStickerFingerprint = fingerprint;
      el('preview').hidden = !s;
      el('placeholder').hidden = !!s;
      el('preview').src = s ? `/api/preview?rev=${Date.now()}` : '';
      el('metadata').textContent = s
        ? `${s.animated ? '✨ Animé' : '🖼 Statique'} · ${s.outputFrames} image(s) · ${(s.bytes / 1024).toFixed(1)} Ko · 512 × 512 px${s.animated ? ` · ${(s.durationMs / 1000).toFixed(1)} s` : ''}${s.skippedFrames ? ' · cadence adaptée' : ''}`
        : 'En attente d’un sticker…';
      el('save').disabled = !s;
    }
    if (ready && !previouslyReady) await updateChats();
    if (!ready && previouslyReady) { chats = []; renderChats(); }
    updateButton();
  } catch(err) { el('status').textContent = `Service indisponible : ${err.message}`; }
}

async function sendSticker({direct = false, revision = stickerRevision} = {}) {
  if (sending || importing) return;
  if (!ready) { note('WhatsApp n’est pas connecté. Le sticker reste importé : aucun envoi effectué.', true); return; }
  if (!hasSticker || !Number.isSafeInteger(revision)) { note('Aucun sticker prêt à envoyer.', true); return; }
  let recipient = selectedRecipient();
  if (!recipient) {
    await updateChats();
    recipient = selectedRecipient();
  }
  if (!recipient) { note('Dernier destinataire indisponible. Choisis une discussion avant de réessayer.', true); return; }
  if (!direct && !confirm(`Envoyer ce sticker à « ${recipient.name} » ?`)) return;
  sending = true;
  updateButton();
  note(`⏳ ${direct ? 'Envoi direct' : 'Envoi'} à « ${recipient.name} » en cours…`);
  try {
    const result = await request('/api/send', {
      method:'POST',
      headers:{'Content-Type':'application/json', 'X-TTWA-Bridge':'1'},
      body: JSON.stringify({chatId: recipient.id, revision, direct})
    });
    note(`${direct ? `À « ${recipient.name} » : ` : ''}${result.message}`, result.confirmed ? false : 'warning');
  } catch(err) { note(`❌ Aucun nouvel essai automatique : ${err.message}`, true); }
  finally { sending = false; updateButton(); }
}
async function afterImport(result, allowDirect) {
  importNote(`✅ Sticker importé : ${result.sticker.animated ? 'animé' : 'statique'} · ${(result.sticker.bytes / 1024).toFixed(1)} Ko`, false, 2200);
  await refresh();
  // Le mode direct n'est lance qu'apres l'action du bouton import ou un postMessage
  // valide de TikTok, jamais a partir d'un simple lien #sticker= ouvert par un tiers.
  if (allowDirect && directMode) {
    if (ready && !selectedRecipient()) await updateChats();
    return result.sticker.revision;
  }
  return null;
}
async function importUrl(url, allowDirect = false) {
  if (importing || sending) return;
  if (!url || !url.trim()) return;
  importing = true;
  el('import-url').disabled = true;
  updateButton();
  importNote('⏳ Téléchargement du sticker par le serveur local puis conversion…');
  let revisionForDirect = null;
  try {
    const result = await request('/api/import-url', {
      method:'POST',
      headers:{'Content-Type':'application/json', 'X-TTWA-Bridge':'1'},
      body: JSON.stringify({url: url.trim()})
    });
    revisionForDirect = await afterImport(result, allowDirect);
  } catch(err) { importNote(`❌ ${err.message}`, true); }
  finally { importing = false; el('import-url').disabled = false; updateButton(); }
  if (revisionForDirect !== null) await sendSticker({direct:true, revision:revisionForDirect});
}

el('import-form').addEventListener('submit', async event => {
  event.preventDefault();
  await importUrl(el('sticker-url').value, true);
});
el('sticker-file').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file || importing || sending) return;
  importing = true;
  el('import-url').disabled = true;
  updateButton();
  importNote(`⏳ Conversion du fichier ${file.name}…`);
  let revisionForDirect = null;
  try {
    if (file.size > 12 * 1024 * 1024) throw new Error('Fichier supérieur à 12 Mo.');
    const result = await request('/api/import', {
      method:'POST',
      headers:{'Content-Type':'application/octet-stream', 'X-TTWA-Bridge':'1'},
      body: file
    });
    revisionForDirect = await afterImport(result, true);
  } catch(err) { importNote(`❌ ${err.message}`, true); }
  finally { importing = false; el('import-url').disabled = false; event.target.value = ''; updateButton(); }
  if (revisionForDirect !== null) await sendSticker({direct:true, revision:revisionForDirect});
});
el('refresh').addEventListener('click', refresh);
el('refresh-chats').addEventListener('click', updateChats);
el('filter').addEventListener('input', renderChats);
el('chat').addEventListener('change', () => {
  const newId = el('chat').value;
  const recipient = chats.find(chat => chat.id === newId);
  if (recipient && directMode && newId !== lastChatId && !confirm(`L’envoi direct sera désormais destiné à « ${recipient.name} ». Confirmer ?`)) {
    renderChats(); return;
  }
  lastChatId = recipient?.id || '';
  store(PREF_CHAT, lastChatId);
  renderChats();
});
el('direct-mode').addEventListener('change', () => {
  const enabled = el('direct-mode').checked;
  if (enabled) {
    const recipient = selectedRecipient();
    if (!recipient || !ready) {
      el('direct-mode').checked = false;
      note('Choisis d’abord une discussion WhatsApp disponible.', true);
      return;
    }
    if (!confirm(`Activer l’envoi DIRECT à « ${recipient.name} » ?\n\nChaque clic sur ↗ WhatsApp dans TikTok importera puis enverra automatiquement le sticker sans autre confirmation. Tu pourras désactiver cette option ici.`)) {
      el('direct-mode').checked = false;
      return;
    }
  }
  directMode = enabled;
  store(PREF_DIRECT, directMode ? 'yes' : 'no');
  renderDirectHint();
  note(directMode ? '✅ Envoi direct activé. Destinataire mémorisé.' : 'Mode manuel réactivé.');
});
el('save').addEventListener('click', () => {
  const anchor = document.createElement('a');
  anchor.href = '/api/preview';
  anchor.download = 'sticker-tiktok-whatsapp.webp';
  anchor.click();
});
el('send').addEventListener('click', () => sendSticker({direct:false}));

// Navigation #sticker= = simple préremplissage, jamais un envoi automatique.
try {
  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  const incoming = params.get('sticker');
  if (incoming) {
    el('sticker-url').value = incoming;
    importNote('URL reçue depuis TikTok. Clique sur « Importer le sticker » si le mode direct ne démarre pas.');
    history.replaceState(null, '', location.pathname + location.search);
  }
} catch(err) { importNote(`Impossible de lire le lien transmis : ${err.message}`, true); }

// Handoff explicite entre le userscript TikTok et ce Bridge. Cette preuve d'origine
// empêche les pages tierces d'ouvrir /#sticker= pour provoquer un envoi automatique.
if (window.opener && window.crypto?.randomUUID) {
  const nonce = window.crypto.randomUUID();
  const expiresAt = Date.now() + 120000;
  window.addEventListener('message', async (event) => {
    if (handoffAccepted || Date.now() > expiresAt || !TRUSTED_TIKTOK.has(event.origin)
        || event.source !== window.opener || event.data?.type !== 'ttwa:handoff'
        || event.data?.nonce !== nonce || typeof event.data?.url !== 'string') return;
    handoffAccepted = true;
    const stickerUrl = event.data.url;
    window.opener = null;
    el('sticker-url').value = stickerUrl;
    if (directMode) await importUrl(stickerUrl, true);
    else importNote('Lien reçu depuis TikTok. Clique sur « Importer le sticker ».');
  });
  window.opener.postMessage({type:'ttwa:ready', nonce}, '*');
}

el('direct-mode').checked = directMode;
renderDirectHint();
refresh();
setInterval(refresh, 2500);
