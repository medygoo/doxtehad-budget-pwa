# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Individus et ménages (contexte africain/francophone, devise XOF en tête) qui veulent tenir un budget personnel sans compétence technique. Usage réel sur téléphone Android/iOS via PWA installée, souvent avec connexion instable ou intermittente. Job : suivre revenus/dépenses, respecter la règle 75/15/10, financer des projets SMART (épargne cible + échéance).

## Product Purpose

Carnet de Budget DOXTEHAD v2.0 : application web progressive de gestion budgétaire personnelle. Elle remplace le carnet papier par un suivi structuré : opérations (Revenu/Dépense/Projet/Épargne), projets SMART avec objectif et date limite, tableaux de bord et rapports automatiques fondés sur la règle 75/15/10. Succès = discipline budgétaire tenue dans la durée, sur plusieurs appareils, sans perdre les données hors-ligne.

## Positioning

Double garantie rare pour un outil grand public : (1) offline-first réel — toute la saisie fonctionne sans réseau via cache local ; (2) chiffrement local — le mot de passe de déverrouillage est la seule clé de déchiffrement, même l'opérateur cloud ne lit pas les données ; synchronisé quand même entre appareils via Supabase + RLS.

## Operating Context

- Installation PWA sur téléphone (bouton Installer) et usage navigateur sur machine.
- Données hébergées Supabase (auth email + PostgreSQL RLS), frontend servi sur Cloudflare Pages (doxtehad-budget-pwa.pages.dev).
- Flux : ouverture → écran verrouillé (logo + slogan) → mot de passe de déverrouillage → tableau de bord (onglets Tableau de Bord / Opérations / Projets SMART / Rapports / Paramètres).
- Sauvegarde/restauration JSON et export CSV disponibles dans Paramètres.

## Capabilities and Constraints

- Vanilla JS ES modules, CSS compilé local (aucun CDN pour l'app elle-même), service worker offline.
- Auth Supabase (email/mot de passe) + mot de passe de déverrouillage PBKDF2 stocké localement (non réinitialisable côté serveur).
- Comptes créés aussi via dashboard admin Supabase (quota emails plan gratuit limité).
- Contrainte forte : aucune dépendance runtime lourde ; bundle statique uniquement au déploiement.
- Le mot de passe de déverrouillage n'est PAS récupérable : l'écran d'accueil doit expliquer ce risque sans effrayer.

## Brand Commitments

- Nom : « Carnet de Budget DOXTEHAD » (v2.0). Logo actuel : icône portefeuille SVG blanche sur dégradé bleu, navy #0A2540 comme couleur primaire.
- Ton francophone, direct, rassurant, orienté discipline financière (« Discipline Budgétaire DOXTEHAD »).
- Palette existante à faire évoluer avec cohérence : navy profond, blue-600, emerald (positif), rose (dépassement/alerte), amber (avertissement/épargne).
- Slogan à confirmer par l'utilisateur (proposition actuelle en cours de design : « Maîtrisez chaque franc. 75 vivre · 15 bâtir · 10 épargner. »).

## Evidence on Hand

- Application fonctionnelle déployée : https://doxtehad-budget-pwa.pages.dev
- Base Supabase réelle avec opérations d'exemple ; tests unitaires 23/23, E2E verts ; CI GitHub Actions medygoo/doxtehad-budget-pwa.
- Icônes PWA existantes dans /icons (favicon, apple-touch, 192, 512, maskable).
- Aucun témoignage client, aucun utilisateur publié : NE PAS inventer de preuve sociale.

## Product Principles

1. La donnée appartient à l'utilisateur : chiffrement local, export facile, suppression RGPD.
2. Hors-ligne d'abord : l'app reste utilisable sans réseau, la synchro est une amélioration, jamais une condition.
3. Une règle simple vaut mieux qu'un tableau complexe : la 75/15/10 guide chaque écran.
4. Rassurer sans cacher le risque : dire ce qui se passe si on perd le mot de passe.
5. Léger et rapide sur téléphone modeste : pas de framework lourd, animations GPU-friendly.

## Accessibility & Inclusion

- Écrans utilisés sur mobile petit écran, plein soleil possible : contrastes élevés requis.
- Zones tactiles ≥ 36px déjà appliquées ; respect de prefers-reduced-motion pour les animations.
- Langue : français.
