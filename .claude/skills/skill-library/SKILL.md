---
name: skill-library
description: Router pour accéder aux skills LIBRARY (non chargés par défaut) — backend, mobile, API, recherche, vidéo. Utilisé sur demande sans polluer le contexte quotidien.
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: selective-loading
---

# Skill Library Router — DOXTEHAD Budget PWA

Ce router donne accès aux **skills LIBRARY** : utiles occasionnellement mais pas chargés par défaut pour préserver le contexte.

---

## 📦 DAILY vs LIBRARY

### ✅ DAILY (chargés automatiquement)

Ces 8 skills sont **toujours actifs** pour ce repo :

- `frontend-patterns` — Patterns CSS/JS/DOM vanilla
- `security-review` — Audit sécurité (auth, XSS, localStorage)
- `tdd-workflow` — Tests unitaires + E2E obligatoires
- `e2e-testing` — Playwright pour PWA
- `coding-standards` — Conventions code uniforme
- `verification-loop` — Gate de validation pré-déploiement
- `investigate-first` — Debugging Service Worker + localStorage
- `safe-refactor` — Refactoring sans casser l'état

### 📚 LIBRARY (accessibles sur demande)

Ces skills restent disponibles mais ne sont **pas chargés automatiquement** :

---

## 🔧 SKILLS BACKEND & API

**Trigger** : "backend", "API REST", "Node.js serveur", "Express", "endpoints"

| Skill                 | Usage                                            |
| --------------------- | ------------------------------------------------ |
| `backend-patterns`    | Patterns Node.js/Express pour API REST           |
| `api-design`          | Design REST (nommage, status codes, pagination)  |
| `nextjs-turbopack`    | Next.js 16+ avec Turbopack                       |
| `bun-runtime`         | Bun comme runtime/package manager                |
| `mcp-server-patterns` | Créer des serveurs MCP (tools/resources/prompts) |

**Exemple** : "Charge le skill backend-patterns pour créer une API REST Node.js"

---

## 📱 SKILLS MOBILE NATIF

**Trigger** : "iOS", "Android", "Swift", "Kotlin", "app native"

| Skill               | Usage                                   |
| ------------------- | --------------------------------------- |
| `ios-clean`         | Retirer DebugBridge d'une app iOS       |
| `ios-design-review` | Audit visuel iOS sur hardware réel      |
| `ios-fix`           | Fixer bugs iOS autonome                 |
| `ios-qa`            | QA live-device pour SwiftUI             |
| `ios-sync`          | Sync debug bridge avec templates gstack |

**Exemple** : "Charge ios-qa pour tester l'app sur iPhone"

---

## 🎨 SKILLS DESIGN AVANCÉ

**Trigger** : "design system", "redesign", "audit visuel", "UI premium"

| Skill                        | Usage                                               |
| ---------------------------- | --------------------------------------------------- |
| `hallmark`                   | Anti-AI-slop design (greenfield, audits, redesigns) |
| `impeccable`                 | Design/critique/polish UX/UI frontend               |
| `design-taste-frontend`      | Taste-skill v2 (landing pages, portfolios)          |
| `design-taste-frontend-v1`   | Taste-skill v1 (backward compat)                    |
| `gpt-taste`                  | Elite UX/UI avec GSAP motion                        |
| `high-end-visual-design`     | Standards haute gamme (fonts, spacing, shadows)     |
| `imagegen-frontend-web`      | Génération d'images design web premium              |
| `imagegen-frontend-mobile`   | Génération d'images design mobile premium           |
| `brandkit`                   | Brand-kit image generation (logos, identité)        |
| `minimalist-ui`              | Interfaces éditorial-style minimalistes             |
| `industrial-brutalist-ui`    | UI Swiss + terminal militaire                       |
| `redesign-existing-projects` | Upgrade design existant sans casser                 |

**Exemple** : "Charge hallmark pour redesigner la page d'accueil"

---

## 🔍 SKILLS RECHERCHE & ANALYSE

**Trigger** : "recherche web", "analyse marché", "competitive", "intelligence"

| Skill                           | Usage                                            |
| ------------------------------- | ------------------------------------------------ |
| `deep-research`                 | Recherche multi-sources (firecrawl + exa MCP)    |
| `market-research`               | Analyse marché, concurrence, due diligence       |
| `exa-search`                    | Recherche neuronale Exa (web, code, entreprises) |
| `competitive-platform-analysis` | Scope landscape concurrentiel                    |
| `benchmark-methodology`         | Score concurrents (9 dimensions pondérées)       |
| `competitive-report-structure`  | Rapport décision-grade final                     |

**Exemple** : "Charge deep-research pour analyser les apps budget concurrentes"

---

## 🎬 SKILLS MÉDIA

**Trigger** : "vidéo", "audio", "image génération", "TTS", "montage"

| Skill             | Usage                                         |
| ----------------- | --------------------------------------------- |
| `video-editing`   | Montage vidéo AI (FFmpeg + Remotion + fal.ai) |
| `fal-ai-media`    | Génération image/vidéo/audio via fal.ai       |
| `frontend-slides` | Présentations HTML animation-rich             |

**Exemple** : "Charge video-editing pour créer un trailer promo"

---

## 📝 SKILLS CONTENU & SOCIAL

**Trigger** : "X", "Twitter", "LinkedIn", "contenu social", "article", "newsletter"

| Skill             | Usage                                                 |
| ----------------- | ----------------------------------------------------- |
| `x-api`           | Intégration X/Twitter (posts, threads, analytics)     |
| `crosspost`       | Distribution multi-plateformes (X, LinkedIn, Bluesky) |
| `content-engine`  | Créer contenu natif par plateforme                    |
| `article-writing` | Articles, guides, blog posts, tutorials               |
| `brand-voice`     | Profil de voix brand depuis posts réels               |
| `brand-discovery` | Identité brand via interviews structurées             |

**Exemple** : "Charge content-engine pour créer un thread X sur DOXTEHAD"

---

## 💼 SKILLS INVESTISSEURS & BUSINESS

**Trigger** : "pitch deck", "fundraising", "investisseurs", "one-pager"

| Skill                | Usage                                              |
| -------------------- | -------------------------------------------------- |
| `investor-materials` | Pitch decks, one-pagers, memos, modèles financiers |
| `investor-outreach`  | Cold emails, intros, follow-ups investors          |
| `office-hours`       | YC Office Hours (deux modes)                       |
| `plan-ceo-review`    | Review CEO/founder-mode de plans                   |

**Exemple** : "Charge investor-materials pour créer un pitch deck"

---

## 🛠️ SKILLS ORCHESTRATION & DEBUGGING

**Trigger** : "orchestration", "multi-agents", "debugging", "investigation"

| Skill                           | Usage                                               |
| ------------------------------- | --------------------------------------------------- |
| `cavecrew`                      | Délégation à cavecrew-investigator/builder/reviewer |
| `caveman-explore`               | Explorer repo (cold-start, localization)            |
| `dmux-workflows`                | Orchestration multi-agents avec dmux                |
| `investigate`                   | Debugging systématique avec root cause              |
| `agent-introspection-debugging` | Self-debugging workflow pour agents                 |

**Exemple** : "Charge investigate pour debugger un crash Service Worker"

---

## 📊 SKILLS TESTS & QA

**Trigger** : "Playwright", "tests composants", "trace", "QA"

| Skill                          | Usage                              |
| ------------------------------ | ---------------------------------- |
| `playwright-cli`               | Automatiser browser, tester pages  |
| `playwright-component-testing` | Tester composants React/Vue isolés |
| `playwright-trace`             | Inspecter traces Playwright CLI    |

**Exemple** : "Charge playwright-trace pour analyser l'échec E2E"

---

## 🚀 SKILLS DÉPLOIEMENT & CI/CD

**Trigger** : "deploy", "CI/CD", "canary", "landing", "ship"

| Skill             | Usage                                           |
| ----------------- | ----------------------------------------------- |
| `land-and-deploy` | Workflow land + deploy                          |
| `ship`            | Ship workflow complet (tests, review, bump, PR) |
| `canary`          | Monitoring canary post-deploy                   |
| `landing-report`  | Dashboard queue workspace-aware                 |
| `retro`           | Rétrospective hebdomadaire ingénierie           |

**Exemple** : "Charge ship pour créer une release taggée"

---

## 🔐 SKILLS SÉCURITÉ & COMPLIANCE

**Trigger** : "sécurité", "audit", "CISO", "vulnerabilities"

| Skill | Usage                                           |
| ----- | ----------------------------------------------- |
| `cso` | Audit sécurité statique + reproduction + repair |

**Exemple** : "Charge cso pour auditer les vulnérabilités"

---

## 🧠 SKILLS DOCUMENTATION & LEARNING

**Trigger** : "docs", "documentation", "apprendre", "lookup"

| Skill                  | Usage                                                 |
| ---------------------- | ----------------------------------------------------- |
| `documentation-lookup` | Docs à jour via Context7 MCP (React, Next.js, Prisma) |
| `document-generate`    | Générer docs manquantes (features, modules, projets)  |
| `document-release`     | Audit docs de release                                 |
| `learn`                | Gérer learnings projet                                |

**Exemple** : "Charge documentation-lookup pour voir les docs Next.js 16"

---

## 🎯 UTILISATION

### Syntaxe

```
Charge le skill <nom> pour <tâche>
```

### Exemples

- "Charge backend-patterns pour créer une API REST"
- "Charge hallmark pour redesigner la page login"
- "Charge deep-research pour analyser les apps budget en 2026"
- "Charge investor-materials pour créer un pitch deck"

---

## 📌 NOTE

Les skills LIBRARY **ne sont jamais chargés automatiquement**. Ils restent accessibles via ce router mais ne polluent pas le contexte quotidien.

Pour charger un skill :

1. Identifie le skill dans la catégorie appropriée ci-dessus
2. Demande explicitement : "Charge le skill <nom>"
3. Le skill se charge **uniquement pour cette session**

---

**Dernière mise à jour** : 2026-11-02  
**Repo** : carnet-budget-pwa  
**Stack** : HTML/CSS/JS vanilla PWA + localStorage
