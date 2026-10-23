# 🏆 Ballon d'Or – Application de vote

Application web où chaque participant compose son **top 10** parmi les **30 nommés au Ballon d'Or 2026**
(liste dévoilée par France Football le 8 septembre 2026). Les votes validés sont comptabilisés avec le
barème officiel du Ballon d'Or :

| Rang   | 1er | 2e | 3e | 4e | 5e | 6e | 7e | 8e | 9e | 10e |
|--------|-----|----|----|----|----|----|----|----|----|-----|
| Points | 15  | 12 | 10 | 8  | 7  | 5  | 4  | 3  | 2  | 1   |

En cas d'égalité de points, le joueur avec le plus de 1res places passe devant, puis de 2es places, etc.

## Fonctionnalités

- **Page de vote** (`/`) : recherche, filtre par poste, ajout en un clic, réordonnancement par glisser-déposer
  ou flèches, brouillon conservé dans le navigateur, adapté au mobile.
- **Résultats** (`/results`) : podium + classement complet (points, 1res places, nombre de citations),
  publics ou réservés à l'admin selon le réglage.
- **Administration** (`/admin`, protégée par mot de passe) :
  - validation / refus / suppression des votes ;
  - génération de **codes d'invitation à usage unique** ;
  - gestion de la banque de joueurs (ajout, modification, masquage) ;
  - ouverture/fermeture des votes, publication des résultats ;
  - export CSV des résultats.

## Comment on empêche les votes multiples

Plusieurs protections se cumulent :

1. **Validation par l'admin** : sans code, un vote arrive « en attente » et ne compte qu'une fois validé
   par l'administrateur (mot de passe).
2. **Codes d'invitation à usage unique** (méthode recommandée) : l'admin génère un code par personne
   (`ABCD-EFGH`) et le lui transmet. Un vote accompagné d'un code valide est validé automatiquement, et le
   code ne peut plus resservir. En mode « code obligatoire », il devient impossible de voter sans code :
   plus besoin de modérer à la main.
3. **Prénom unique** : un même prénom (accents et majuscules ignorés) ne peut pas voter deux fois ;
   un homonyme peut ajouter l'initiale de son nom (« Thomas B. »).
4. **Un vote par appareil** : un cookie identifie le navigateur ; un second vote depuis le même appareil est refusé.
5. **Alerte IP** : dans l'admin, un avertissement signale les votes provenant de la même adresse IP
   (stockée uniquement sous forme de hash) ou avec un prénom proche.
6. Une limite de débit protège le formulaire de vote et la connexion admin.

Trois modes sont réglables dans **Admin → Paramètres** :

| Mode          | Comportement                                                                          |
|---------------|---------------------------------------------------------------------------------------|
| Facultatif    | (par défaut) avec un code → validé automatiquement ; sans code → validation admin    |
| Obligatoire   | un code est requis pour voter                                                         |
| Désactivé     | pas de code, tous les votes passent par la validation admin                           |

## Déploiement avec Docker Compose

```bash
cp .env.example .env
# éditez .env : ADMIN_PASSWORD (obligatoire) et SESSION_SECRET (openssl rand -hex 32)
docker compose up -d --build
```

L'application est alors disponible sur `http://<serveur>:3000` (port modifiable via `PORT` dans `.env`).
La base SQLite est stockée dans le volume Docker `ballon-dor-data` : les votes survivent aux redémarrages
et aux mises à jour (`docker compose up -d --build`).

Variables d'environnement :

| Variable         | Rôle                                                                                   |
|------------------|----------------------------------------------------------------------------------------|
| `ADMIN_PASSWORD` | **Obligatoire.** Mot de passe de l'administration (8 caractères minimum).              |
| `SESSION_SECRET` | Clé de signature des sessions admin. Sans elle, une clé aléatoire est générée au démarrage. |
| `PORT`           | Port exposé sur l'hôte (défaut 3000).                                                  |
| `SECURE_COOKIES` | `true` si l'application est servie en HTTPS.                                           |
| `TRUST_PROXY`    | Nombre de reverse proxies devant l'app (ex. `1` derrière Nginx/Traefik/Caddy), pour récupérer la bonne IP. |

Sauvegarde de la base :

```bash
docker compose exec ballon-dor sh -c 'cat /data/ballon-dor.sqlite' > sauvegarde.sqlite
```

## Développement local

Prérequis : Node.js 22.5 ou plus récent (utilise le module SQLite intégré `node:sqlite`, aucune dépendance native).

```bash
cd app
npm install
ADMIN_PASSWORD=motdepasse123 npm run dev   # http://localhost:3000
npm test
```

## Banque de joueurs

Les 30 nommés 2026 sont chargés au premier démarrage depuis `app/src/players.js` (clubs au moment des
nominations). Ensuite, la liste se gère depuis **Admin → Joueurs** : vous pouvez corriger un club, ajouter
un joueur ou en masquer un. Les drapeaux sont chargés depuis flagcdn.com.

## Structure

```
docker-compose.yml
.env.example
app/
  Dockerfile
  src/
    server.js     démarrage du serveur
    app.js        API (vote, résultats, admin)
    db.js         schéma SQLite et paramètres
    players.js    nommés 2026 et barème
  public/         pages HTML/CSS/JS (vote, résultats, admin)
  test/           tests de l'API
```
