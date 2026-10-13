// ==UserScript==
// @name         TikTok → WhatsApp Sticker Bridge
// @namespace    https://local.ttwa-bridge.example/
// @version      0.6.0
// @description  Transmet l'URL du sticker au Bridge local via une nouvelle page ; transfert direct par postMessage sécurisé.
// @match        https://www.tiktok.com/*
// @match        https://m.tiktok.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';
  const BRIDGE = 'http://127.0.0.1:31777/';
  const LOG = '[TTWA v0.6]';
  const style = document.createElement('style');
  style.textContent = `
    #ttwa-toolbar{position:fixed;z-index:2147483647;top:16px;right:18px;background:#231b35;
      border:1px solid #ab86ff;color:#fff;border-radius:10px;padding:9px 12px;font:600 12px system-ui;
      box-shadow:0 8px 30px #0007;cursor:pointer}
    #ttwa-floating{position:fixed;z-index:2147483647;display:none;background:#8658ed;color:white;
      border:0;border-radius:9px;padding:12px 14px;min-height:44px;font:700 13px system-ui;cursor:pointer;
      box-shadow:0 4px 20px #0008;white-space:nowrap;touch-action:manipulation}
    #ttwa-toast{position:fixed;z-index:2147483647;right:18px;bottom:22px;display:none;
      max-width:min(400px,calc(100vw - 36px));padding:15px 36px 15px 15px;border-radius:12px;
      background:#211b31;color:#fff;border:1px solid #9878d4;font:13px/1.5 system-ui;
      box-shadow:0 8px 30px #0009;overflow-wrap:anywhere}
    #ttwa-toast a{color:#d6b7ff;text-decoration:underline}
    #ttwa-toast button{position:absolute;top:5px;right:6px;border:0;background:transparent;color:white;
      font:700 19px system-ui;cursor:pointer;padding:3px 7px}
  `;
  (document.head || document.documentElement).appendChild(style);
  const toolbar = document.createElement('button');
  toolbar.id = 'ttwa-toolbar'; toolbar.type = 'button';
  toolbar.textContent = '🎭 TikTok → WA';
  toolbar.title = 'Colle une URL de sticker ou ouvre le Bridge';
  const hover = document.createElement('button');
  hover.id = 'ttwa-floating'; hover.type = 'button';
  hover.textContent = '↗ WhatsApp';
  const toast = document.createElement('div'); toast.id = 'ttwa-toast';
  document.body.append(toolbar, hover, toast);

  let selected = null;
  let toastTimer = null;
  const pendingBridgeTabs = new Map();
  const BRIDGE_ORIGIN = new URL(BRIDGE).origin;
  window.addEventListener('message', event => {
    if (event.origin !== BRIDGE_ORIGIN || event.data?.type !== 'ttwa:ready') return;
    const pending = pendingBridgeTabs.get(event.source);
    if (!pending || typeof event.data.nonce !== 'string' || pending.used) return;
    pending.used = true;
    pendingBridgeTabs.delete(event.source);
    event.source.postMessage({type:'ttwa:handoff', nonce:event.data.nonce, url:pending.url}, BRIDGE_ORIGIN);
  });
  function notice(message, url = '', durationMs = 2400) {
    clearTimeout(toastTimer);
    toast.replaceChildren();
    const p = document.createElement('div'); p.textContent = message;
    toast.appendChild(p);
    if (url) {
      const link = document.createElement('a');
      link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.textContent = 'Ouvrir le Bridge avec ce lien →';
      toast.appendChild(link);
    }
    const close = document.createElement('button');
    close.type = 'button'; close.textContent = '×'; close.title = 'Fermer';
    close.addEventListener('click', () => {clearTimeout(toastTimer); toast.style.display = 'none';});
    toast.appendChild(close);
    toast.style.display = 'block';
    if (durationMs > 0) toastTimer = setTimeout(() => {toast.style.display = 'none';}, durationMs);
  }
  function resolveURL(value) {
    if (!value) return null;
    try {
      const u = new URL(String(value).trim(), location.href);
      return ['https:', 'blob:', 'data:'].includes(u.protocol) ? u.href : null;
    } catch { return null; }
  }
  function mediaURLs(img) {
    const list = [];
    const add = s => {const u = resolveURL(s); if (u && !list.includes(u)) list.push(u);};
    add(img.currentSrc);
    for (const attribute of ['src','data-src','data-original','data-url','data-image']) add(img.getAttribute(attribute));
    if (img.srcset) for (const item of img.srcset.split(/,\s*(?=https?:|\/)/)) add(item.replace(/\s+\d+(?:\.\d+)?[wx]\s*$/, '').trim());
    const animated = list.filter(u => /(?:awebp|\.gif)(?:[/?#]|$)/i.test(u));
    return [...animated, ...list.filter(u => !animated.includes(u))];
  }
  function mediaAt(target) {
    if (!(target instanceof Element)) return null;
    const img = target.closest('img') || target.querySelector('img');
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    if (rect.width < 30 || rect.height < 30) return null;
    const urls = mediaURLs(img);
    return urls.length ? {img, urls} : null;
  }
  function reveal(media) {
    // Le bouton est ANCRE dans l'image choisie (sans espace entre les deux).
    // Aucun mouvement lors des nouveaux pointerover sur le MEME sticker :
    // le curseur peut traverser l'image et atteindre le bouton sans qu'il s'enfuie.
    if (selected?.img === media.img && hover.style.display === 'block') return;
    selected = media;
    const rect = media.img.getBoundingClientRect();
    const buttonWidth = 128; // largeur reservee, stable meme si l'image est petite
    const left = Math.max(5, Math.min(innerWidth - buttonWidth - 5, rect.left + 4));
    const top = Math.max(5, Math.min(innerHeight - 52, rect.top + 4));
    hover.style.left = `${left}px`;
    hover.style.top = `${top}px`;
    hover.style.display = 'block';
  }
  document.addEventListener('pointerover', e => {
    if (e.target.closest?.('#ttwa-toolbar,#ttwa-floating,#ttwa-toast')) return;
    const media = mediaAt(e.target);
    if (media) reveal(media);
  }, true);
  document.addEventListener('scroll', () => {hover.style.display = 'none'; selected = null;}, true);

  function bridgeUrl(stickerUrl) {
    return BRIDGE + '#sticker=' + encodeURIComponent(stickerUrl);
  }
  function openSticker(stickerUrl) {
    const valid = resolveURL(stickerUrl);
    if (!valid) return notice('❌ URL invalide. Sélectionne un sticker ou colle son URL CDN HTTPS.', '', 5500);
    if (!valid.startsWith('https://')) {
      return notice('Ce sticker utilise une URL temporaire blob:/data:. Le Bridge ne peut pas la lire depuis une autre page. Télécharge le fichier puis utilise « Sélectionner un fichier » dans le Bridge.', BRIDGE, 9000);
    }
    const dest = bridgeUrl(valid);
    // Le fragment conserve le mode manuel de secours. La communication authentifiée
    // postMessage permet l'envoi direct, uniquement depuis l'origine TikTok.
    const popup = window.open(dest, '_blank');
    if (popup) {
      pendingBridgeTabs.set(popup, {url:valid, used:false});
      setTimeout(() => pendingBridgeTabs.delete(popup), 120000);
    } else {
      notice('Fenêtre bloquée. Autorise les fenêtres contextuelles de TikTok pour ouvrir le Bridge.', dest, 8500);
      return;
    }
    notice('✅ Lien transmis au Bridge.', dest, 2500);
    console.info(LOG, 'Lien transmis au Bridge (mode manuel + handoff postMessage).');
  }
  hover.addEventListener('click', e => {
    e.preventDefault(); e.stopPropagation();
    if (selected) openSticker(selected.urls[0]);
  });
  document.addEventListener('contextmenu', e => {
    if (!e.shiftKey) return;
    const media = mediaAt(e.target);
    if (!media) return;
    e.preventDefault();
    reveal(media);
    openSticker(media.urls[0]);
  }, true);
  toolbar.addEventListener('click', () => {
    const value = prompt('Colle l’URL directe d’un sticker TikTok. Annuler = ouvrir le Bridge :');
    if (value === null) {window.open(BRIDGE, '_blank', 'noopener,noreferrer'); return;}
    openSticker(value);
  });
  console.info(LOG, 'Actif : ↗ WhatsApp pour préremplir ou envoyer directement si activé dans le Bridge.');
})();
