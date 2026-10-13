# Architecture technique

## Composants

| Fichier | Rôle |
|---|---|
| `tiktok-to-whatsapp.user.js` | Détecte une image/sticker visible sur TikTok Web ; transmet son URL via un nouvel onglet et `postMessage`. |
| `dashboard.html` | Interface locale HTML/CSS, sans framework ni bundler. |
| `dashboard.js` | État du dashboard, import, liste des discussions, envoi, mémorisation locale et mode direct. |
| `server.mjs` | Serveur HTTP lié à `127.0.0.1:31777`, état RAM, intégration WhatsApp et endpoints. |
| `importer.mjs` | Validation URL CDN TikTok, résolution DNS publique, redirections et limites de téléchargement. |
| `sticker.mjs` | Convertisseur `sharp` en WebP compatible sticker, statique ou animé selon la source. |
| `chats.mjs` | Lecture minimale des discussions directement dans la page WhatsApp Web via Puppeteer. |
| `send-result.mjs` | Normalise les résultats d'envoi confirmés ou incertains. |
| `test/` | Tests unitaires de plusieurs chemins critiques. |

## API locale

| Méthode | Endpoint | Fonction |
|---|---|---|
| GET | `/` | Interface |
| GET | `/dashboard.js` | Script client du dashboard |
| GET | `/api/status` | État de la connexion / du dernier sticker |
| GET | `/api/preview` | Fichier WebP du dernier sticker importé |
| GET | `/api/chats` | Discussions proposées par WhatsApp |
| POST | `/api/import-url` | Télécharger une URL de CDN autorisé et convertir |
| POST | `/api/import` | Convertir un fichier transmis par le navigateur |
| POST | `/api/send` | Envoyer le WebP au chat choisi, après vérifications |

Les POST exigent l'en-tête `X-TTWA-Bridge: 1`, avec vérifications d'origine. **Ce n'est pas un système d'authentification complet** contre un processus malveillant exécuté sur la même machine : ne jamais exposer le port en dehors de la boucle locale.

## États et concurrence

- L'état principal (`ready`, `sticker`, `revision`, `busy`, `sending`) vit en RAM ; un redémarrage supprime le sticker courant.
- Le serveur incrémente `revision` à chaque import. L'envoi doit fournir cette même révision, pour empêcher l'envoi accidentel d'un sticker précédent ou remplacé.
- `lastDirectRevision` bloque une répétition directe d'une même révision pendant la vie du processus.
- Le `chatId` est vérifié contre la liste des discussions récupérées dans la session courante ; l'interface ne permet pas un identifiant destinataire arbitraire.
- Le dernier destinataire et l'option directe sont stockés dans `localStorage` sous `ttwa.v06.last-chat` et `ttwa.v06.direct`.
- L'envoi direct est déclenché après un échange `postMessage` entre TikTok et la nouvelle fenêtre Bridge, avec contrôle d'origine, fenêtre source, nonce et délai. Un lien contenant seulement `#sticker=` ne lance jamais seul un envoi automatique.

## Dépendances sensibles aux mises à jour

`whatsapp-web.js` utilise les structures internes de WhatsApp Web. Les changements peuvent affecter les chats ou l'envoi. `chats.mjs` contourne un problème observé avec `getChats()` et les identifiants `_serialized` / `$1`, mais reste lui-même dépendant de `WAWebCollections`.

TikTok peut également changer la structure DOM des messages ou ses URL de CDN. Pour diagnostiquer l'extraction, commencer par vérifier l'URL et la présence d'un fichier `.awebp` ou `.webp` animé.

## Cycle typique

1. TikTok Web : sélection visuelle d'un sticker.
2. Userscript : ouvre `http://127.0.0.1:31777/#sticker=<URL encodée>`.
3. Dashboard : préremplit le formulaire ; le mode direct nécessite en plus le `postMessage` valide.
4. Serveur : `downloadTikTokMedia` puis `toWhatsAppSticker`.
5. Dashboard : aperçu et sélection du destinataire (ou récupération du dernier).
6. Serveur : validation du `chatId` et de `revision`, puis `wa.sendMessage(..., {sendMediaAsSticker: true})`.
7. Dashboard : message de confirmation technique, d'incertitude ou d'erreur.

## Environnement / configuration

La version 0.6 n'exige pas de fichier `.env`. Le port et l'adresse sont codés pour un usage **strictement local** (`127.0.0.1:31777`). L'option `TTWA_HEADLESS=1` active un navigateur Puppeteer invisible ; par défaut, la fenêtre Chromium reste visible, conformément à la configuration testée sous Windows.
