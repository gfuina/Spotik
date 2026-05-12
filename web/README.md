# Spotik — carte Mapbox + MongoDB

Application **Next.js 15** (App Router), mobile first : géolocalisation, carte avec clusters, liste, rayon de recherche, filtre **direction** (rose des vents + largeur de secteur). Les spots viennent de **MongoDB** (géo `2dsphere`). Les images peuvent être miroitées sur **Vercel Blob** via un script.

## Prérequis

- Node 20+
- Fichier `../spots_france.json` à la racine du repo (déjà présent après le scrape Python).
- Compte [Mapbox](https://www.mapbox.com/) (token public `pk.`).
- Cluster [MongoDB Atlas](https://www.mongodb.com/atlas) (URI).
- Optionnel : [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) pour héberger les photos.

## Variables d’environnement

Voir [`.env.example`](.env.example). En local :

```bash
cd web
cp .env.example .env.local
# Éditer .env.local
```

Sur **Vercel** : Project → Settings → Environment Variables : `MONGODB_URI`, `NEXT_PUBLIC_MAPBOX_TOKEN`. Ne pas ajouter `BLOB_READ_WRITE_TOKEN` au runtime de l’app (réservé aux scripts).

## Remplir MongoDB

```bash
cd web
npm install
export MONGODB_URI="mongodb+srv://..."
npm run seed
# option : chemin du JSON
npx tsx scripts/seed-spots.ts --file /chemin/vers/spots_france.json
```

Le script crée la collection `spots`, index **unique** `sourceId` et index **2dsphere** sur `location`. Les champs `imageUrls` / miniatures **Blob** existants ne sont pas écrasés lors d’un re-seed (reprise safe après mirror).

## Miroir des photos vers Vercel Blob

À lancer **en local** (ou CI) avec le token Blob — peut être long (milliers d’images).

```bash
cd web
export MONGODB_URI=...
export BLOB_READ_WRITE_TOKEN=...
npm run mirror-photos -- --max-spots 20 --delay-ms 500
# tout traiter : npm run mirror-photos
# refaire : npm run mirror-photos -- --force
```

## Développement

```bash
cd web
npm run dev
```

Ouvre [http://localhost:3000](http://localhost:3000). Sans `MONGODB_URI`, l’API renvoie une erreur (503).

## Déploiement Vercel

1. Repo Git → importer le projet, **Root Directory** : `web`.
2. Variables : `MONGODB_URI`, `NEXT_PUBLIC_MAPBOX_TOKEN`.
3. Après déploiement : vérifier que l’Atlas autorise l’IP `0.0.0.0/0` (ou les egress Vercel) sur la connexion.
4. Seed / mirror : exécutés depuis ta machine ou une action GitHub, pas depuis une route serverless (durée / quotas).

## API

`GET /api/spots?lat=...&lng=...&radiusKm=100&limit=80`  
Optionnel : `bearingDeg=180&bearingHalfWidthDeg=45` (ex. sud ±45°).

Réponse : `{ spots: [...], count, center, ... }` avec distances en km et cap en degrés.
