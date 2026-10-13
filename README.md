# TikTok → WhatsApp Sticker Bridge

**Pont local pour importer des stickers TikTok dans WhatsApp comme de vrais stickers (WebP), avec conservation de l'animation lorsque c'est possible.**

**Version 0.6.0** · **Node.js ≥ 20** · **Windows 10/11** · **Prototype local**

> **Projet personnel / prototype non officiel.** Il n'est affilié ni à TikTok, ni à WhatsApp/Meta. L'intégration WhatsApp repose sur `whatsapp-web.js` et peut cesser de fonctionner après des changements de WhatsApp Web. L'automatisation d'un compte peut également entraîner des restrictions : pas d'envoi en masse.

## Ce que fait le projet

- **TikTok Web** : ajoute un bouton **↗ WhatsApp** au survol d'une image/sticker dans les messages privés (userscript Violentmonkey).
- **Récupération** : transmet l'URL directe du média au Bridge local. Pas de capture d'écran si le fichier original est disponible.
- **Conversion** : télécharge le média CDN TikTok depuis Node.js et produit un **WebP 512 × 512**. Tente de préserver les images d'une animation WebP/GIF.
- **WhatsApp** : affiche les discussions du compte lié et envoie le résultat avec l'option `sendMediaAsSticker: true`.
- **Mémorisation** : garde le dernier contact/groupe choisi dans le stockage local du navigateur.
- **Envoi direct (optionnel)** : après confirmation unique d'activation, un clic sur TikTok peut importer puis envoyer le sticker au dernier destinataire **sans nouvelle confirmation**. Ce mode est **désactivé par défaut**.
- **Solutions de repli** : saisie manuelle de l'URL et import d'un fichier image/animation depuis le disque.

**État connu :** l'envoi classique a été observé comme fonctionnel lors de l'utilisation du prototype. Le chemin d'envoi direct ajouté en v0.6 a été testé automatiquement mais n'a pas été vérifié de bout en bout sur un compte réel dans cet environnement.

## Schéma de fonctionnement

```text
TikTok mobile (envoie le sticker dans une conversation)
                     |
                     v
            TikTok Web (Edge/Chrome)
                     |
          Userscript Violentmonkey
              bouton ↗ WhatsApp
                     |
            URL HTTPS du média
                     |
                     v
         Bridge Node.js local :31777
      téléchargement + conversion Sharp
                     |
           WebP 512 x 512 pixels
                     |
         interface locale du Bridge
             sélection destinataire
                     |
             whatsapp-web.js
                     |
     Session WhatsApp liée (QR code)
                     |
              Sticker WhatsApp
```

Le Bridge se lance sur **`http://127.0.0.1:31777`** (boucle locale seulement). Le navigateur Chromium contrôlé par Puppeteer correspond à **un appareil WhatsApp lié supplémentaire**, distinct d'un onglet WhatsApp Web déjà ouvert.

## Prérequis

| Composant | Prérequis |
|---|---|
| Système | Windows 10/11 (projet développé et utilisé sous Windows) |
| Runtime | Node.js LTS, version 20 minimum, recommandé : Node 22 LTS |
| Gestionnaire de paquets | pnpm (installation ci-dessous) |
| Navigateur | Edge ou Chrome avec Violentmonkey |
| Comptes | TikTok Web connecté et WhatsApp mobile disponible pour associer la session |
| Connexion Internet | Accès aux CDN TikTok et à WhatsApp Web |

## Installation depuis le dépôt

### 1. Récupérer les fichiers

Télécharge le ZIP du dépôt privé et extrais-le, **ou** clone ton dépôt Git :

```powershell
git clone https://github.com/TON-COMPTE/tiktok-whatsapp-sticker-bridge.git
cd .\tiktok-whatsapp-sticker-bridge
```

> Remplace `TON-COMPTE` par ton identifiant GitHub. Si tu installes depuis un ZIP qui contient le répertoire `tiktok-whatsapp-stickers`, ouvre celui-ci dans PowerShell.

### 2. Installer les dépendances

Depuis PowerShell, à la racine du projet (là où se trouve `package.json`) :

```powershell
node --version
npm install --global pnpm
pnpm install
pnpm run check
pnpm test
```

Si Puppeteer ne parvient pas à installer ou trouver Chromium :

```powershell
pnpm exec puppeteer browsers install chrome
```

**Remarque :** `pnpm-lock.yaml` n'est pas fourni dans cette archive source. Après la première installation réussie, conserve et versionne le `pnpm-lock.yaml` généré pour rendre les installations suivantes reproductibles.

### 3. Démarrer le Bridge et lier WhatsApp

```powershell
pnpm start
```

Ouvre **http://127.0.0.1:31777/**. Au premier lancement, un QR code apparaît dans PowerShell :

1. Sur WhatsApp mobile, ouvre **Appareils connectés**.
2. Choisis **Connecter un appareil**.
3. Scanne le QR code affiché dans le terminal.
4. Attends l'indication `WhatsApp connecté et prêt.` puis actualise le Bridge.

**N'efface pas `.wwebjs_auth/` quand tu redémarres** : ce dossier contient la session liée. Chromium est **visible par défaut** (`headless: false`), car le mode invisible a posé des problèmes d'initialisation sur la configuration de développement.

### 4. Installer le userscript Violentmonkey

1. Ouvre le tableau de bord Violentmonkey dans Edge ou Chrome.
2. Crée un nouveau userscript.
3. Copie le contenu complet de **`tiktok-to-whatsapp.user.js`** dans l'éditeur et enregistre.
4. Désactive les anciennes versions éventuelles pour éviter les boutons en double.
5. Recharge **https://www.tiktok.com/messages**.

## Utilisation

### Envoi manuel (conseillé pour le premier essai)

1. Envoie le sticker depuis l'application TikTok sur ton téléphone dans une discussion, puis ouvre cette discussion sur TikTok Web.
2. Survole le sticker et clique sur **↗ WhatsApp**. Le Bridge s'ouvre avec son URL préremplie. Alternative : **Maj + clic droit** sur le sticker.
3. Dans le Bridge, clique sur **Importer le sticker**. Vérifie l'aperçu animé ou statique.
4. Sélectionne un contact ou groupe WhatsApp, puis clique sur **Envoyer comme sticker** et confirme.
5. Vérifie l'arrivée du sticker **dans la conversation** WhatsApp.

Le bouton peut s'afficher sur d'autres images TikTok, notamment des avatars : vérifie l'image sélectionnée. Si TikTok affiche une simple miniature, son URL peut produire une image statique ; récupère le WebP animé d'origine si possible.

### Envoi direct au dernier contact (v0.6)

1. Dans le Bridge, sélectionne d'abord le **contact ou groupe** de destination.
2. Coche **Envoi direct au dernier contact** et valide le message de confirmation.
3. Reviens sur TikTok Web : clique sur **↗ WhatsApp** sur le sticker voulu.
4. Le Bridge s'ouvre et **tente automatiquement l'import, la conversion et l'envoi** au dernier destinataire mémorisé.

**Attention :** quand cette option est activée, un clic sur TikTok peut déclencher un **vrai envoi sans confirmation supplémentaire**. Vérifie bien le nom du destinataire avant de cliquer. Pour arrêter, **décoche la case** dans le Bridge.

La mémorisation repose sur `localStorage` : elle est propre au **profil de navigateur**. Elle peut disparaître si tu effaces les données du site ou utilises un autre profil. Si le passage automatique entre onglets est bloqué, le lien reste prérempli : clique sur **Importer le sticker** pour reprendre le flux. Une protection de révision limite les doubles tentatives automatiques pour un même import.

### Import manuel par URL ou fichier

Tu peux utiliser le Bridge **sans cliquer sur le userscript**, si tu possèdes déjà l'URL **directe HTTPS du média** : colle-la dans le champ d'import. Une URL de profil, de vidéo TikTok, ou une URL `blob:` ne suffit pas.

Si le CDN refuse le lien (`HTTP 403`/`404`) ou si tu possèdes le sticker comme fichier, utilise le sélecteur **WebP / AWebP / GIF / PNG / JPEG / AVIF**. La conversion doit conserver l'animation seulement si **le fichier source** possède réellement plusieurs images.

## Limites de conversion et d'envoi

| Propriété | Cible |
|---|---|
| Format | WebP (`sendMediaAsSticker`) |
| Dimensions | 512 × 512 px |
| Taille statique | 100 Ko maximum |
| Taille animée | 500 Ko maximum |
| Durée animée | Jusqu'à 10 secondes |
| Taille de fichier source | 12 Mo maximum |

Le traitement par `sharp` peut réduire la qualité ou la cadence pour rester sous ces limites. Il n'est **pas garanti** que toute animation TikTok soit récupérable ou préservée. Les données du sticker sont stockées **en mémoire** du serveur : elles disparaissent quand le processus s'arrête.

**Cas important :** `whatsapp-web.js` peut déclencher un envoi réel sans retourner de confirmation technique exploitable. Dans ce cas, le Bridge affiche un résultat **indéterminé**, pas un échec certain. **Vérifie la discussion avant de réessayer** pour ne pas envoyer le même sticker deux fois.

## Commandes de développement

```powershell
pnpm start       # Démarre le serveur, la page locale et la session WhatsApp
pnpm run check   # Vérification de syntaxe de l'entrée serveur et du userscript
pnpm test        # Tests Node.js (sécurité des URL, conversion, chats, interface...)
```

Il n'y a **ni build frontend, ni base de données, ni déploiement cloud**. Le projet utilise les modules JavaScript natifs (`.mjs`) et une page HTML/CSS/JS statique. Un workflow GitHub Actions lance les vérifications et les tests à chaque push ou pull request, **sans connexion à WhatsApp**.

## Structure du dépôt

```text
.
├── README.md                    # Présentation, installation, utilisation
├── .gitignore                   # Exclusion des sessions et dépendances
├── .gitattributes               # Fins de ligne Git
├── .editorconfig                # Conventions d'édition
├── package.json                 # Dépendances et commandes
├── pnpm-workspace.yaml          # Autorisation des builds natifs nécessaires
├── server.mjs                   # Serveur HTTP local / session WhatsApp
├── chats.mjs                    # Contournement de compatibilité getChats()
├── sticker.mjs                  # Conversion et compression WebP
├── importer.mjs                 # Téléchargement sécurisé des URL CDN TikTok
├── send-result.mjs              # États de confirmation WhatsApp
├── dashboard.html               # Interface utilisateur
├── dashboard.js                 # Import, sélection, envoi, préférences
├── tiktok-to-whatsapp.user.js   # Userscript Violentmonkey
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DEPANNAGE.md
│   └── SECURITE.md
└── test/                        # Tests automatisés
```

## Confidentialité avant publication Git

**Même dans un dépôt privé, ne publie jamais les données de session WhatsApp** : une personne disposant des fichiers d'authentification pourrait potentiellement accéder à une session liée. Le `.gitignore` exclut notamment `.wwebjs_auth/`, `.wwebjs_cache/`, `node_modules/`, `.env*` et les journaux. Vérifie quand même le statut Git avant chaque `push`.

```powershell
git status --short
git ls-files
```

Le Bridge est lié à `127.0.0.1` et ne doit pas être publié derrière un tunnel, un proxy ou un port exposé à Internet. La communication avec WhatsApp et le CDN TikTok dépend, elle, de leurs services externes. Voir **[docs/SECURITE.md](docs/SECURITE.md)**.

## Créer un dépôt GitHub privé

À la racine des fichiers (ne versionne pas le ZIP lui-même, sauf si tu en as besoin) :

```powershell
git init
git add .
git status --short
git commit -m "Initial commit: TikTok WhatsApp Sticker Bridge v0.6"
```

Sur GitHub, crée un **nouveau dépôt privé vide** nommé par exemple `tiktok-whatsapp-sticker-bridge`. Puis :

```powershell
git branch -M main
git remote add origin https://github.com/TON-COMPTE/tiktok-whatsapp-sticker-bridge.git
git push -u origin main
```

Alternative avec GitHub CLI connecté : `gh repo create tiktok-whatsapp-sticker-bridge --private --source=. --remote=origin --push`.

## Problèmes fréquents

- **« Connecté » mais aucune discussion / HTTP 500 `r: r`** : l'API interne WhatsApp Web a changé ; ce projet emploie `getChatsCompat()` dans `chats.mjs` plutôt que `wa.getChats()`. Voir **[docs/DEPANNAGE.md](docs/DEPANNAGE.md)**.
- **`node --check` n'affiche rien** : c'est le comportement normal si la syntaxe est correcte.
- **Serveur ouvert, mais WhatsApp jamais « prêt »** : conserve Chromium visible, lis les erreurs PowerShell et vérifie que la session liée est encore valide.
- **Erreur Violentmonkey `GM_xmlhttpRequest` statut 0** : la version 0.6 n'a **pas besoin** de cette API ; elle ouvre le Bridge avec l'URL, puis s'appuie sur un échange sécurisé entre onglets pour le mode direct.
- **CDN HTTP 403/404** : lien expiré ou protégé ; essaie le fichier source ou une URL WebP actualisée.
- **Envoi indiqué comme indéterminé alors que le sticker est arrivé** : ne clique pas une deuxième fois sans vérifier le chat.

**Guide détaillé :** [docs/DEPANNAGE.md](docs/DEPANNAGE.md).

## Technologies et documentation

- [Node.js](https://nodejs.org/), serveur HTTP intégré
- [pnpm](https://pnpm.io/)
- [Violentmonkey](https://violentmonkey.github.io/)
- [Sharp](https://sharp.pixelplumbing.com/)
- [whatsapp-web.js](https://docs.wwebjs.dev/)
- [Puppeteer](https://pptr.dev/) (dépendance de `whatsapp-web.js`)

**Version :** 0.6.0 • **Langue du projet :** français • **Usage :** local, personnel, expérimental.
