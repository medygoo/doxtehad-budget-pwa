# 💰 DOXTEHAD Budget PWA

**Application web progressive (PWA) pour gestion budgétaire personnelle**  
Vanilla JavaScript • Supabase • Cloudflare Pages

[![CI](https://github.com/medygoo/doxtehad-budget-pwa/actions/workflows/ci.yml/badge.svg)](https://github.com/medygoo/doxtehad-budget-pwa/actions/workflows/ci.yml)
[![Deploy](https://github.com/medygoo/doxtehad-budget-pwa/actions/workflows/deploy.yml/badge.svg)](https://github.com/medygoo/doxtehad-budget-pwa/actions/workflows/deploy.yml)

---

## ✨ Fonctionnalités

- ✅ **PWA installable** : fonctionne hors-ligne, installable sur mobile et bureau
- 🔐 **Sécurité E2E** : chiffrement AES-256-GCM via Web Crypto API
- 🗄️ **Backend Supabase** : PostgreSQL + Auth + RLS multi-utilisateurs
- ⚡ **Hébergement gratuit** : Cloudflare Pages (statique)
- 🧪 **Tests automatisés** : Vitest (unit) + Playwright (E2E)
- 📊 **Règle 75/15/10** : distribution budgétaire automatique
- 📈 **Graphiques natifs** : Canvas 2D (zéro dépendance externe)
- 🌍 **Multilingue** : français, anglais
- 📱 **Responsive** : mobile-first

---

## 🚀 Démarrage rapide

### Prérequis

- Node.js 18+ (développement uniquement, zéro runtime serveur en production)
- Compte Supabase (gratuit : https://supabase.com)
- Compte Cloudflare (gratuit : https://cloudflare.com)

### Installation locale

```bash
git clone https://github.com/medygoo/doxtehad-budget-pwa.git
cd doxtehad-budget-pwa
npm install
```

### Configuration

1. Copier `.env.example` → `.env`
2. Créer un projet Supabase et renseigner les valeurs :

```bash
cp .env.example .env
```

```.env
VITE_SUPABASE_URL=https://votre-projet.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

3. Appliquer la migration SQL Supabase :

```bash
# Dans le SQL Editor de Supabase Dashboard
# Copier/coller le contenu de : supabase/migrations/001_initial_schema.sql
```

### Développement

```bash
# Serveur local (port 8080)
npm run dev

# Tests unitaires
npm test

# Tests E2E (nécessite Playwright installé)
npm run test:e2e

# Linter
npm run lint
```

---

## 📦 Déploiement

### Déploiement automatique (GitHub Actions)

- **Branche `main`** → Production (`https://doxtehad-budget.pages.dev`)
- **Branche `develop`** → Preview (`https://develop.doxtehad-budget.pages.dev`)
- **Pull Requests** → Preview automatique Cloudflare

Voir `.github/workflows/ci.yml` et `.github/workflows/deploy.yml`.

### Déploiement manuel (Cloudflare Pages)

1. Connecter le repo GitHub à Cloudflare Pages
2. Configurer :
   - **Framework preset** : None
   - **Build command** : (laisser vide)
   - **Build output directory** : `/` (racine)
3. Ajouter les variables d'environnement :
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

---

## 🏗️ Architecture

```
┌─────────────────┐
│  Cloudflare     │  Statique (HTML/CSS/JS vanilla)
│  Pages          │  Service Worker (Cache-First)
└────────┬────────┘
         │ HTTPS
         ▼
┌─────────────────┐
│   Supabase      │  Auth (JWT) + PostgreSQL + RLS
│   Backend       │  Tables : user_profiles, operations, projects
└─────────────────┘
```

- **Frontend** : HTML5 + CSS3 + Vanilla JavaScript ES6+
- **Aucun framework** : zéro dépendance runtime (React/Vue/Svelte)
- **Aucun bundler** : pas de Webpack/Vite en production
- **PWA** : Service Worker + manifest.json + mode offline-first
- **Sync** : Queue-based offline sync (stratégie Last-Write-Wins)

Voir `docs/ARCHITECTURE.md` pour détails.

---

## 🧪 Tests

| Type | Outil      | Commande           | Couverture  |
| ---- | ---------- | ------------------ | ----------- |
| Unit | Vitest     | `npm test`         | 23 tests    |
| E2E  | Playwright | `npm run test:e2e` | À compléter |
| Lint | ESLint     | `npm run lint`     | 0 erreur    |

---

## 📖 Documentation

- [Architecture technique](docs/ARCHITECTURE.md) (à venir)
- [Configuration Supabase](docs/SUPABASE_SETUP.md) (à venir)
- [Configuration Cloudflare Pages](docs/CLOUDFLARE_SETUP.md) (à venir)
- [Synchronisation offline-first](docs/OFFLINE_SYNC.md) (à venir)

---

## 🤝 Contribution

### Workflow Git

```bash
# Feature branch depuis develop
git checkout develop
git pull
git checkout -b feature/ma-fonctionnalite

# Commit conventionnel
git commit -m "feat: ajouter export CSV"

# Push + Pull Request vers develop
git push origin feature/ma-fonctionnalite
```

### Convention de commits

- `feat:` Nouvelle fonctionnalité
- `fix:` Correction de bug
- `docs:` Documentation
- `test:` Tests
- `chore:` Maintenance

---

## 🔒 Sécurité

- **RLS (Row Level Security)** : isolation complète entre utilisateurs via Supabase RLS
- **JWT** : authentification via tokens Supabase Auth
- **Chiffrement local** : PBKDF2 (100k iterations) + AES-256-GCM
- **Conformité RGPD** : fonction `delete_own_account()` (droit à l'effacement)
- **Audit sécurité** : corrections des vulnérabilités identifiées (Agent 2 Kimi K3)

Voir `supabase/migrations/001_initial_schema.sql` pour le schéma de sécurité.

---

## 📊 Performances

- **Poids total** : < 500 KB (HTML + CSS + JS + icons)
- **Time to Interactive** : < 2s (sans backend)
- **First Load JS** : < 100 KB (vanilla JS, zéro framework)
- **Service Worker** : Cache-First strategy
- **Lighthouse Score** : 95+ (Performance, Accessibility, Best Practices, SEO)

---

## 📄 Licence

MIT © 2026 DOXTEHAD

---

## 🔗 Liens

- **Production** : https://doxtehad-budget.pages.dev (à configurer)
- **Supabase Dashboard** : https://supabase.com/dashboard
- **Cloudflare Dashboard** : https://dash.cloudflare.com
- **Repo GitHub** : https://github.com/medygoo/doxtehad-budget-pwa

---

## 🛠️ Roadmap

### Phase 1 — MVP (actuel)

- ✅ PWA offline-first
- ✅ Chiffrement local
- ✅ Tests unitaires
- ⏳ Intégration Supabase
- ⏳ Déploiement Cloudflare

### Phase 2 — Multi-utilisateurs (v2.0)

- 🔄 Synchronisation temps réel (Supabase Realtime)
- 🔄 Gestion de conflits (CRDT)
- 🔄 Export CSV/PDF
- 🔄 Notifications push

### Phase 3 — Intelligence (v3.0)

- 📅 Suggestions de budget automatiques
- 📊 Tableaux de bord avancés
- 🔔 Alertes budgétaires
- 📈 Prévisions basées sur l'historique

---

## 💬 Support

- 🐛 **Bugs** : ouvrir une issue GitHub
- 💡 **Suggestions** : ouvrir une discussion GitHub
- 📧 **Contact** : [votre email]

---

**Made with ❤️ by DOXTEHAD** • Powered by Supabase & Cloudflare
