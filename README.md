# Spotik — carte Mapbox + MongoDB

Application **Next.js 15** (App Router), mobile first : géolocalisation, carte avec clusters, liste, rayon de recherche, filtre **direction** (rose des vents + largeur de secteur). Les spots viennent de **MongoDB** (géo `2dsphere`).

## Prérequis

- Node 20+
- Compte [Mapbox](https://www.mapbox.com/) (token public `pk.`).
- Cluster [MongoDB Atlas](https://www.mongodb.com/atlas) (URI) avec une collection `spots` (documents géolocalisés compatibles avec l’API).

## Variables d’environnement

Voir [`.env.example`](.env.example). En local :

```bash
cp .env.example .env.local
# Éditer .env.local
```

Sur **Vercel** : Project → Settings → Environment Variables : `MONGODB_URI`, `NEXT_PUBLIC_MAPBOX_TOKEN`.

## Développement

```bash
npm install
npm run dev
```

Ouvre [http://localhost:3000](http://localhost:3000). Sans `MONGODB_URI`, l’API renvoie une erreur (503).

## Déploiement Vercel

1. Importer le repo : **Root Directory** laissé vide (racine du projet, plus de sous-dossier `web`).
2. Variables : `MONGODB_URI`, `NEXT_PUBLIC_MAPBOX_TOKEN`.
3. Après déploiement : vérifier que l’Atlas autorise l’IP `0.0.0.0/0` (ou les egress Vercel) sur la connexion.

## API

`GET /api/spots?lat=...&lng=...&radiusKm=100&limit=80`  
Optionnel : `bearingDeg=180&bearingHalfWidthDeg=45` (ex. sud ±45°).

Réponse : `{ spots: [...], count, center, ... }` avec distances en km et cap en degrés.
