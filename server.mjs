import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import qrcode from 'qrcode-terminal';
import whatsapp from 'whatsapp-web.js';
import {MAX_INPUT_BYTES, toWhatsAppSticker} from './sticker.mjs';
import {getChatsCompat} from './chats.mjs';
import {downloadTikTokMedia} from './importer.mjs';
import {describeSendResult, describeSendException} from './send-result.mjs';

const {Client, LocalAuth, MessageMedia} = whatsapp;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 31777;
const HOST = '127.0.0.1';
const state = {ready: false, message: 'Démarrage…', sticker: null, revision: 0, busy: false, sending: false, lastDirectRevision: -1};

const wa = new Client({
  authStrategy: new LocalAuth({dataPath: path.join(__dirname, '.wwebjs_auth')}),
  puppeteer: {headless: process.env.TTWA_HEADLESS === '1', args: ['--no-sandbox', '--disable-setuid-sandbox']}
});
wa.on('qr', (qr) => {
  state.ready = false;
  state.message = 'Scanne le QR code affiché dans le terminal : WhatsApp > Appareils connectés.';
  console.log('\n📱 WhatsApp > Appareils connectés > Connecter un appareil :\n');
  qrcode.generate(qr, {small: true});
});
wa.on('authenticated', () => { state.message = 'Authentifié. Initialisation de WhatsApp…'; });
wa.on('ready', () => {
  state.ready = true;
  state.message = 'WhatsApp connecté.';
  console.log('✅ WhatsApp connecté et prêt.');
});
wa.on('disconnected', (reason) => {
  state.ready = false;
  state.message = `WhatsApp déconnecté : ${reason}`;
  console.warn(state.message);
});
wa.on('auth_failure', (reason) => {
  state.ready = false;
  state.message = `Échec d'authentification : ${reason}`;
  console.error(state.message);
});

function respond(res, status, payload, type = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': type.startsWith('text/html') ? "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'" : "default-src 'none'"
  });
  res.end(typeof payload === 'string' || Buffer.isBuffer(payload) ? payload : JSON.stringify(payload));
}
function bad(res, code, message) { respond(res, code, {ok: false, error: message}); }
function body(req, maxSize) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxSize) { reject(new Error(`Taille maximale dépassée (${maxSize} octets).`)); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
function summarize() {
  return {
    ok: true, ready: state.ready, message: state.message, busy: state.busy, sending: state.sending,
    sticker: state.sticker ? {
      revision: state.revision,
      animated: state.sticker.animated, bytes: state.sticker.bytes,
      inputFrames: state.sticker.inputFrames, outputFrames: state.sticker.outputFrames,
      durationMs: state.sticker.durationMs, skippedFrames: state.sticker.skippedFrames
    } : null
  };
}
const page = await readFile(path.join(__dirname, 'dashboard.html'), 'utf8');
const clientJS = await readFile(path.join(__dirname, 'dashboard.js'), 'utf8');

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    if (req.headers.host !== `${HOST}:${PORT}` && req.headers.host !== `localhost:${PORT}`) {
      return bad(res, 403, 'Hôte non autorisé.');
    }
    if (url.pathname === '/' && req.method === 'GET') return respond(res, 200, page, 'text/html; charset=utf-8');
    if (url.pathname === '/dashboard.js' && req.method === 'GET') return respond(res, 200, clientJS, 'text/javascript; charset=utf-8');
    if (url.pathname === '/api/status' && req.method === 'GET') return respond(res, 200, summarize());
    if (url.pathname === '/api/preview' && req.method === 'GET') {
      if (!state.sticker) return bad(res, 404, 'Pas de sticker importé.');
      return respond(res, 200, state.sticker.buffer, 'image/webp');
    }
    if (url.pathname === '/api/chats' && req.method === 'GET') {
      if (!state.ready) return bad(res, 503, 'WhatsApp n’est pas encore connecté.');
      // Contournement compatible avec les identifiants _serialized / $1.
      // Ne pas utiliser wa.getChats() ici : r: r en 1.34.7 sur WA Web 2.3000.x.
      const chats = await getChatsCompat(wa);
      return respond(res, 200, {ok: true, chats});
    }
    if (['/api/import', '/api/import-url', '/api/send'].includes(url.pathname) && req.method === 'POST') {
      // Une page hostile ne doit pas pouvoir déclencher une action via un simple formulaire HTML.
      if (req.headers['x-ttwa-bridge'] !== '1') return bad(res, 403, 'En-tête de confirmation absent.');
      // Aucun CORS: les pages Web externes ne peuvent pas lire le service local.
      const origin = req.headers.origin || '';
      if (origin && origin !== 'null' && !origin.startsWith(`http://${HOST}:${PORT}`) && !origin.startsWith(`http://localhost:${PORT}`)
          && !/^https:\/\/(www\.|m\.)?tiktok\.com$/.test(origin)
          && !/^(chrome|moz)-extension:\/\//.test(origin)) {
        return bad(res, 403, 'Origine non autorisée.');
      }
    }
    if (url.pathname === '/api/import-url' && req.method === 'POST') {
      // Import URL depuis le dashboard seulement, sans CORS. Une page tierce ne peut
      // ni envoyer l'en-tête requis sans preflight ni lire la réponse.
      const origin = req.headers.origin || '';
      if (origin && ![ `http://${HOST}:${PORT}`, `http://localhost:${PORT}` ].includes(origin)) {
        return bad(res, 403, 'Import URL autorisé uniquement depuis le Bridge local.');
      }
      if (state.busy || state.sending) return bad(res, 409, 'Conversion ou envoi déjà en cours.');
      const params = JSON.parse((await body(req, 16384)).toString('utf8'));
      state.busy = true;
      try {
        const original = await downloadTikTokMedia(params.url);
        const processed = await toWhatsAppSticker(original);
        state.sticker = processed;
        state.revision++;
        return respond(res, 200, summarize());
      } finally { state.busy = false; }
    }
    if (url.pathname === '/api/import' && req.method === 'POST') {
      if (state.busy || state.sending) return bad(res, 409, 'Conversion ou envoi déjà en cours.');
      state.busy = true;
      try {
        const input = await body(req, MAX_INPUT_BYTES);
        const processed = await toWhatsAppSticker(input);
        state.sticker = processed;
        state.revision++;
        return respond(res, 200, {ok: true, ...summarize()});
      } finally { state.busy = false; }
    }
    if (url.pathname === '/api/send' && req.method === 'POST') {
      if (!state.ready) return bad(res, 503, 'WhatsApp n’est pas connecté.');
      if (!state.sticker) return bad(res, 400, 'Importe d’abord un sticker TikTok.');
      if (state.busy || state.sending) return bad(res, 409, 'Action déjà en cours.');
      const values = JSON.parse((await body(req, 8192)).toString('utf8'));
      const chatId = typeof values.chatId === 'string' ? values.chatId : '';
      const direct = values.direct === true;
      // Empêche qu'un second import remplace le sticker entre son aperçu et son envoi.
      if (!Number.isSafeInteger(values.revision) || values.revision !== state.revision) {
        return bad(res, 409, 'Le sticker a changé depuis son import. Aucun envoi effectué : réessaie depuis son aperçu.');
      }
      if (direct && state.lastDirectRevision === state.revision) {
        return bad(res, 409, 'Envoi direct déjà tenté pour ce sticker. Vérifie la discussion avant tout nouvel essai.');
      }
      // Ne jamais permettre un destinataire arbitraire. Il doit être dans les discussions visibles.
      const chats = await getChatsCompat(wa);
      if (!chats.some((chat) => chat.id === chatId)) {
        return bad(res, 400, 'Discussion introuvable ou non autorisée.');
      }
      state.sending = true;
      // Verrouille l'envoi direct AVANT d'appeler WhatsApp, même si le résultat est incertain.
      if (direct) state.lastDirectRevision = state.revision;
      try {
        const media = new MessageMedia('image/webp', state.sticker.buffer.toString('base64'), 'sticker.webp');
        let sent;
        try {
          sent = await wa.sendMessage(chatId, media, {sendMediaAsSticker: true, sendSeen: false, waitUntilMsgSent: true});
        } catch (error) {
          // Une erreur après l'appel peut survenir après l'envoi effectif.
          // Ne jamais annoncer un echec certain ni relancer automatiquement : doublon possible.
          console.error('[Envoi : resultat indetermine]', error);
          return respond(res, 202, describeSendException());
        }
        const result = describeSendResult(sent);
        if (result.confirmed) console.log('✅ Sticker accepté par WhatsApp :', chatId);
        else console.warn('⚠️ Envoi sans identifiant renvoyé par WhatsApp :', chatId);
        return respond(res, result.confirmed ? 200 : 202, result);
      } finally { state.sending = false; }
    }
    return bad(res, 404, 'Route inconnue.');
  } catch (error) {
    console.error('[Erreur]', error);
    if (!res.headersSent && !res.destroyed) bad(res, 500, error.message || 'Erreur interne.');
  }
});
server.listen(PORT, HOST, () => console.log(`\n🚀 Bridge : http://${HOST}:${PORT}\n   Installe le userscript TikTok puis ouvre cette URL.\n`));
wa.initialize().catch((err) => {
  state.ready = false;
  state.message = 'Erreur au démarrage de WhatsApp : ' + err.message;
  console.error('WhatsApp init:', err);
});
process.on('SIGINT', async () => {
  try { await wa.destroy(); } catch {}
  server.close();
  process.exit(0);
});
