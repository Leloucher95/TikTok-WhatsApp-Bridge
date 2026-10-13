# Dépannage Windows

Commence par ouvrir PowerShell à la racine du projet et lance :

```powershell
node --version
pnpm run check
pnpm start
```

Ouvre ensuite `http://127.0.0.1:31777/api/status` et vérifie les logs PowerShell. **`node --check` sans aucune sortie signifie que la syntaxe est valide.**

## Le Bridge s'affiche, mais WhatsApp n'est jamais prêt

- Ne réinitialise **pas** automatiquement ton appareil lié.
- Vérifie si Chromium s'est ouvert. Sur ce prototype, `headless: false` est le comportement par défaut ; n'active pas `TTWA_HEADLESS=1` pour diagnostiquer ce problème.
- Ferme d'abord les autres instances du Bridge, puis relance avec `pnpm start` : plusieurs processus simultanés peuvent se disputer la même session.
- Lis les erreurs dans PowerShell (`WhatsApp init`, `auth_failure`, etc.).
- Si aucun QR code n'apparaît et que la fenêtre reste figée, consulte les logs avant de toucher à `.wwebjs_auth`.

## Le navigateur indique connecté, mais `/api/chats` renvoie HTTP 500 / `r: r`

Les versions de WhatsApp Web peuvent casser `wa.getChats()`. Le fichier `chats.mjs` contient un contournement qui lit des champs minimaux sans sérialisation complète (`_serialized`, `$1`). Si ce contournement échoue à nouveau après une mise à jour WhatsApp, vérifie les erreurs Puppeteer et la structure `WAWebCollections.Chat` avant de changer la session ou de supprimer le dossier d'authentification.

## Le userscript affiche un bouton qui bouge ou des boutons multiples

Assure-toi d'utiliser le fichier `tiktok-to-whatsapp.user.js` **v0.6**. Désactive les scripts Violentmonkey anciens ou dupliqués, puis `Ctrl+F5` sur TikTok Web. La v0.6 positionne le bouton sur l'image, sans recalculer sa place quand le pointeur reste sur le même élément.

## Erreur `GM_xmlhttpRequest.onerror` / statut 0

Ce message provient des anciennes versions. La v0.6 **ne demande aucun droit `GM_xmlhttpRequest`** : elle ouvre simplement une nouvelle page Bridge préremplie. Si la nouvelle fenêtre ne s'ouvre pas, autorise les popups pour TikTok Web.

## URL inaccessible ou sticker devenu statique

- Vérifie que tu colles une **URL directe HTTPS** du média, et non l'adresse d'une page TikTok.
- Certains CDN signent les URL ; elles expirent. Un `HTTP 403/404` peut être normal.
- Si la source est une image de prévisualisation, la sortie ne pourra pas recréer une animation absente.
- Utilise **Sélectionner un fichier** avec le WebP/GIF animé d'origine comme solution de repli.
- L'importateur bloque volontairement les hôtes inconnus, les adresses internes et les fichiers de plus de 12 Mo.

## Le sticker est reçu, mais le Bridge affiche une confirmation absente

Un envoi WhatsApp peut avoir effectivement réussi même si `sendMessage()` renvoie `undefined` ou génère une erreur après l'appel. Le Bridge n'essaie pas automatiquement de renvoyer ce sticker. **Regarde dans le chat WhatsApp avant de cliquer une deuxième fois**, sous peine de doublon.

## Envoi direct qui ne part pas

- Le dernier destinataire doit toujours exister parmi les discussions disponibles.
- Vérifie que le mode direct est activé dans **le même profil de navigateur** que celui qui affiche le Bridge.
- L'ouverture depuis TikTok peut être bloquée par le navigateur : autorise la fenêtre ou repasse par le formulaire prérempli, puis clique sur **Importer le sticker**.
- Ouvrir un lien `#sticker=` à la main ne déclenche pas d'envoi direct : il faut un clic TikTok et le `postMessage` validé.
- Une nouvelle tentative automatique pour la même `revision` est volontairement refusée ; importe à nouveau si nécessaire, uniquement après avoir vérifié qu'aucun sticker n'a été envoyé.

## `pnpm install` / Sharp / Puppeteer

- Installe Node.js LTS **64 bits**.
- Si `sharp` a été ignoré lors d'une installation, autorise les scripts de build requis (`pnpm approve-builds`, selon la version de pnpm), puis réinstalle.
- Si le navigateur Puppeteer n'existe pas : `pnpm exec puppeteer browsers install chrome`.
- Le client WhatsApp est non officiel et reste sensible aux changements côté service.

## Sauvegarde / migration de PC

Le dépôt Git doit contenir **seulement le code source**. `.wwebjs_auth/` conserve une session WhatsApp sensible ; elle doit rester sur la machine, hors Git et hors toute archive partagée. Pour installer ailleurs, privilégie une **nouvelle association QR** plutôt que de copier ce dossier.
