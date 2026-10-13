/**
 * Télécharge uniquement les images de CDN TikTok/ByteDance autorisés.
 * Protections : HTTPS, allowlist, contrôle DNS avant connexion, redirections validées,
 * limite de taille, timeout. Jamais de cookies/jetons TikTok transférés.
 */
import https from 'node:https';
import dns from 'node:dns';
import {isIP} from 'node:net';
const MAX_INPUT_BYTES = 12 * 1024 * 1024; // Identique à sticker.mjs

const ALLOWED_ROOTS = [
  'tiktokcdn.com', 'tiktokcdn-us.com', 'tiktokcdn-eu.com', 'tiktokcdn-in.com',
  'tiktokcdn-etc.com', 'tiktokv.com', 'ibyteimg.com', 'byteimg.com',
  'ibytedtos.com', 'ttwstatic.com', 'bytedance.net', 'muscdn.com',
  'byteoversea.com'
];

export function validateStickerUrl(value) {
  if (typeof value !== 'string' || value.length > 8192) {
    throw new Error('URL vide ou trop longue (8 192 caractères maximum).');
  }
  let parsed;
  try { parsed = new URL(value.trim()); }
  catch { throw new Error('URL invalide : colle l’adresse directe du média TikTok.'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || (parsed.port && parsed.port !== '443')) {
    throw new Error('Seules les adresses HTTPS sans identifiants ni port personnalisé sont autorisées.');
  }
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (!ALLOWED_ROOTS.some(root => host === root || host.endsWith('.' + root))) {
    throw new Error(`Domaine non autorisé : ${host}. Utilise une URL directe d’un CDN TikTok (pas l’URL d’une vidéo ou d’un profil).`);
  }
  return parsed;
}

export function isPublicIp(address) {
  const family = isIP(address);
  if (family === 4) {
    const n = address.split('.').map(Number);
    if (n[0] === 0 || n[0] === 10 || n[0] === 127 || n[0] >= 224 ||
      (n[0] === 100 && n[1] >= 64 && n[1] <= 127) ||
      (n[0] === 169 && n[1] === 254) ||
      (n[0] === 172 && n[1] >= 16 && n[1] <= 31) ||
      (n[0] === 192 && (n[1] === 168 || n[1] === 0)) ||
      (n[0] === 198 && (n[1] === 18 || n[1] === 19)) ||
      (n[0] === 192 && n[1] === 0 && n[2] === 2) ||
      (n[0] === 198 && n[1] === 51 && n[2] === 100) ||
      (n[0] === 203 && n[1] === 0 && n[2] === 113)) return false;
    return true;
  }
  if (family === 6) {
    const lower = address.toLowerCase();
    if (lower.includes('.') || lower.includes('::ffff:')) return false; // IPv4-mapped
    if (lower.startsWith('2001:db8:') || lower === '2001:db8::' || lower.startsWith('2001:0:')) return false;
    const prefix = Number.parseInt(lower.split(':')[0], 16);
    return prefix >= 0x2000 && prefix <= 0x3fff; // Global unicast 2000::/3
  }
  return false;
}

function publicLookup(host, options, callback) {
  dns.lookup(host, options, (err, address, family) => {
    if (err) return callback(err);
    const candidates = Array.isArray(address) ? address.map(a => a.address) : [address];
    if (!candidates.length || !candidates.every(isPublicIp)) {
      return callback(new Error('Résolution DNS refusée : adresse non publique.'));
    }
    callback(null, address, family);
  });
}

async function requestOnce(url, remainingMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let overallTimer;
    const done = (result) => { if (!settled) {settled = true; clearTimeout(overallTimer); resolve(result);} };
    const fail = (err) => { if (!settled) {settled = true; clearTimeout(overallTimer); reject(err);} };
    const req = https.get(url, {
      lookup: publicLookup,
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/gif,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.4',
        'User-Agent': 'Mozilla/5.0 (compatible; TikTokStickerBridge/0.4)',
        Referer: 'https://www.tiktok.com/'
      }
    }, res => {
      const code = res.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(code)) {
        const location = res.headers.location;
        res.resume();
        if (!location) return fail(new Error('Redirection sans URL.'));
        try {return done({redirect: new URL(location, url).href});}
        catch {return fail(new Error('Redirection invalide.'));}
      }
      if (code !== 200) {
        res.resume();
        return fail(new Error(`CDN TikTok : HTTP ${code}${[401, 403, 404].includes(code) ? ' (lien potentiellement expiré ou accès protégé)' : ''}.`));
      }
      const length = Number(res.headers['content-length'] || 0);
      if (length > MAX_INPUT_BYTES) {
        res.destroy();
        return fail(new Error('Média trop volumineux (12 Mo maximum).'));
      }
      const chunks = [];
      let size = 0;
      res.on('data', chunk => {
        size += chunk.length;
        if (size > MAX_INPUT_BYTES) {
          res.destroy();
          fail(new Error('Média trop volumineux (12 Mo maximum).'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('error', fail);
      res.on('end', () => {
        if (settled) return;
        if (!size) return fail(new Error('Le CDN a renvoyé un média vide.'));
        done({buffer: Buffer.concat(chunks, size)});
      });
    });
    req.setTimeout(Math.max(1000, remainingMs), () => req.destroy(new Error('Délai dépassé lors du téléchargement CDN.')));
    overallTimer = setTimeout(() => req.destroy(new Error('Délai total de téléchargement dépassé.')), Math.max(1000, remainingMs));
    overallTimer.unref?.();
    req.on('error', fail);
  });
}

export async function downloadTikTokMedia(candidate) {
  const deadline = Date.now() + 25000;
  let current = validateStickerUrl(candidate);
  for (let redirect = 0; redirect <= 4; redirect++) {
    const remaining = deadline - Date.now();
    if (remaining < 1000) throw new Error('Délai total de téléchargement dépassé (25 s).');
    const result = await requestOnce(current, remaining);
    if (result.buffer) return result.buffer;
    current = validateStickerUrl(result.redirect); // Vérifie chaque redirection
  }
  throw new Error('Trop de redirections du CDN TikTok.');
}
