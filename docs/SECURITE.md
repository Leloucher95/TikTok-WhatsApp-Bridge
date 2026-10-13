# Sécurité et confidentialité

## Ne jamais committer les sessions

Le dossier `.wwebjs_auth/` contient une session liée WhatsApp et peut donner accès à des données du compte. `.wwebjs_cache/`, les journaux, dépendances et `.env*` sont également exclus de Git. Un dépôt **privé** réduit la visibilité, mais **ne rend pas sûre** la publication de secrets.

Avant de pousser :

```powershell
git status --short
git ls-files
git diff --cached --name-only
```

Vérifie qu'aucun dossier de session, cookie, export de discussion, numéro ou capture privée n'est suivi. N'enregistre pas de mot de passe/token dans les sources. Si tu as déjà publié des secrets, les retirer d'un dernier commit ne suffit pas : révoque l'appareil WhatsApp lié et nettoie l'historique concerné.

## Périmètre réseau

Le serveur écoute uniquement sur `127.0.0.1:31777`. Il n'est **pas destiné** à un VPS, à une adresse LAN, à un tunnel public ou à un reverse proxy. N'expose pas ses endpoints : le programme contrôle une session WhatsApp. Le contrôle d'en-têtes/origines limite certains appels depuis des sites externes, mais **ne remplace pas une authentification forte** face à des logiciels exécutés localement.

L'import d'URL est limité à des domaines de CDN TikTok/ByteDance identifiés, en HTTPS ; les redirections et les résolutions DNS sont contrôlées pour empêcher les téléchargements vers des adresses privées. Limites appliquées : **12 Mo**, **25 secondes**, **4 redirections**. Aucune transmission automatique de cookies TikTok au CDN par ce module.

## Automatisation et consentement

Le **mode manuel** impose une confirmation explicite de chaque envoi. En mode direct, l'utilisateur confirme une fois l'activation ; les envois suivants sont déclenchés par son clic sur un sticker TikTok et peuvent cibler automatiquement le dernier destinataire. **Ne pas activer ce mode sur un ordinateur partagé**, ni pour des groupes importants sans vérifier le destinataire.

Le Bridge n'effectue pas d'envoi massif et tente d'empêcher les doublons directs pour une révision donnée. Les réponses WhatsApp peuvent rester **indéterminées** : ne jamais lancer des répétitions automatiques dans ce cas.

## Données stockées

- Dernier sticker importé : **RAM du processus**, effacé au redémarrage/remplacement.
- Session WhatsApp : dossier local `.wwebjs_auth/`, hors Git.
- Préférences de destinataire et mode direct : `localStorage` du navigateur, lié au profil.
- Le serveur accède à la liste des discussions pour valider le choix du destinataire.

## Limites restantes

- `whatsapp-web.js`, Puppeteer, Sharp et Violentmonkey sont des composants tiers : vérifie leurs versions et leurs mises à jour.
- La dépendance à des objets internes WhatsApp (`WAWebCollections`) peut cesser de fonctionner.
- Le Bridge n'a pas d'identité multi-utilisateurs ni d'authentification locale forte. Il doit rester réservé à une seule session personnelle.
- Les images récupérées sur Internet peuvent être malformées. La taille d'entrée est bornée, mais la conversion peut employer des ressources importantes. Ne l'expose pas comme service public.
