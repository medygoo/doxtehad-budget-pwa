/* ============================================================
APPLICATION LOGIQUE — Carnet de Budget DOXTEHAD v2.0
Architecture modulaire avec corrections critiques :
 - Crypto sécurisée (DoxtehadCrypto)
 - Stockage cloud (db.js — Supabase + cache offline)
 - PWA ready avec installation et hors-ligne
 - Auth Supabase
 - Toast notifications non-bloquantes
 - Protection contre le tri mutatif
 - Canvas HiDPI
 ============================================================ */

// ============================================================
// IMPORTS MODULES EXTERNES (ES Modules)
// ============================================================
import { supabase, getCurrentUser as getSupabaseUser } from './supabase-client.js';
import * as doxtehadDB from './db.js';
import auth from './auth.js';
import DoxtehadCrypto from './crypto.js';

let appState = null;
let isAuthenticated = false;
let deferredInstallPrompt = null;
let autoLockTimer = null;
let currentUserId = null;
let supabaseSession = null;

const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000;
const STORAGE_KEY = 'DOXTEHAD_BUDGET_APP_DATA'; // clé localStorage legacy (migration)
const OFFLINE_CACHE_KEY = 'doxtehad_offline_cache';

/**
 * État par défaut de l'application (remplace DoxtehadStorage.defaultState).
 */
function defaultAppState() {
  return {
    _version: 2,
    operations: [],
    projects: [],
    adminPasswordHash: null,
    passwordSetDate: null,
    settings: {
      currency: 'XOF',
      currencySymbol: 'Fr',
      locale: 'fr-FR',
      autoLockMinutes: 30,
      budgetRules: {
        depensesMax: 75,
        projetsMax: 15,
        epargneMin: 10,
      },
    },
  };
}

/**
 * Déconnexion (Supabase Auth + clearing local state).
 */
async function handleLogout() {
  try {
    await auth.signOut();
    showToast('Déconnexion réussie', 'info');
  } catch (err) {
    showToast('Erreur de déconnexion : ' + err.message, 'error');
  }
}

/**
 * Réinitialisation du mot de passe (Supabase Auth).
 */
async function resetPassword(email) {
  const targetEmail = email || document.getElementById('forgot-email')?.value;
  const { error } = await auth.resetPassword(targetEmail);
  if (error) {
    showToast("Erreur d'envoi : " + error, 'error');
    return;
  }
  showToast('Email de réinitialisation envoyé. Vérifiez votre boîte mail.', 'success');
}

// ============================================================
// INITIALISATION
// ============================================================
window.addEventListener('DOMContentLoaded', async () => {
  console.log('[App] DOMContentLoaded trigger');
  // 1. Enregistrer le Service Worker
  registerServiceWorker();

  // 2. Gérer l'événement d'installation PWA
  setupPWAInstall();

  // 3. Détecter l'état de connexion réseau
  setupNetworkListeners();

  // 4. Configurer l'auto-lock
  setupAutoLock();

  // 5. Charger l'état local (migration legacy)
  loadLocalLegacyState();

  // 6. Initialiser l'authentification Supabase
  initializeAuth();

  // 7. Si authentifié, faire le rendu complet
  if (isAuthenticated && currentUserId) {
    await syncDataFromCloud();
    renderAll();
  }
});

/**
 * Charge l'état legacy (localStorage) en vue de migration.
 */
function loadLocalLegacyState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      appState = parsed;
      console.log(
        '[App] État local legacy chargé (migration en attente)',
        appState.operations.length,
        'opérations,',
        appState.projects.length,
        'projets'
      );
    }
  } catch (err) {
    console.error('[App] Erreur lecture état local:', err);
    appState = { operations: [], projects: [], settings: {} };
  }
}

// ============================================================
// SERVICE WORKER & PWA INSTALL
// ============================================================
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {
        console.log('[App] Service Worker enregistré:', reg.scope);

        // Détecter mise à jour en attente
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showToast('Nouvelle version disponible ! Rechargez pour appliquer.', 'info', 8000);
            }
          });
        });
      })
      .catch((err) => {
        console.warn('[App] Échec enregistrement SW:', err.message);
      });

    // Écouter les messages du SW
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'SW_UPDATED') {
        showToast(`Application mise à jour (version ${event.data.version})`, 'success');
      }
    });
  }
}

function setupPWAInstall() {
  const installBtn = document.getElementById('btn-pwa-install');
  if (!installBtn) return;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    installBtn.classList.remove('hidden');
  });

  installBtn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    console.log('[PWA] Choix utilisateur:', outcome);
    deferredInstallPrompt = null;
    installBtn.classList.add('hidden');
  });

  window.addEventListener('appinstalled', () => {
    console.log('[PWA] Application installée avec succès');
    installBtn.classList.add('hidden');
    deferredInstallPrompt = null;
    showToast('Carnet de Budget installé sur votre appareil !', 'success');
  });
}

// ============================================================
// AUTHENTIFICATION SUPABASE
// ============================================================
async function initializeAuth() {
  try {
    await auth.hasSession();
  } catch (err) {
    console.warn('[Auth] Erreur vérification session:', err);
  }
  // L'authentification est gérée via onAuthStateChange dans auth.js
  // Ici, on s'assure que si une session existe déjà, on initialise l'UI
  const session = await getSupabaseSession();
  if (session) {
    currentUserId = session.user.id;
    isAuthenticated = true;
    appState = { ...defaultAppState(), user_id: currentUserId };
  } else {
    await showAuthModal();
  }
}

async function getSupabaseSession() {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    console.log('[App] getSupabaseSession:', session ? 'SESSION present' : 'NO session');
    return session || null;
  } catch (err) {
    console.warn('[App] Session non disponible:', err.message);
    return null;
  }
}

async function showAuthModal() {
  const authModal = document.getElementById('modal-auth-supabase');
  if (!authModal) return;
  authModal.classList.remove('hidden');
  const loginForm = document.getElementById('form-auth-login');
  const signupForm = document.getElementById('form-auth-signup');
  const forgotForm = document.getElementById('form-auth-forgot');
  if (loginForm) loginForm.classList.remove('hidden');
  if (signupForm) signupForm.classList.add('hidden');
  if (forgotForm) forgotForm.classList.add('hidden');
}

async function closeAuthModal() {
  const authModal = document.getElementById('modal-auth-supabase');
  if (!authModal) return;
  authModal.classList.add('hidden');
  const loginForm = document.getElementById('form-auth-login');
  const signupForm = document.getElementById('form-auth-signup');
  const forgotForm = document.getElementById('form-auth-forgot');
  if (loginForm) loginForm.classList.add('hidden');
  if (signupForm) signupForm.classList.add('hidden');
  if (forgotForm) forgotForm.classList.add('hidden');
}

/**
 * Inscription avec email + mot de passe (Supabase Auth).
 */
async function handleSignUp(e) {
  e.preventDefault();
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const confirmPassword = document.getElementById('signup-password-confirm').value;

  const validation = DoxtehadCrypto.validatePasswordStrength(password);
  if (!validation.valid) {
    showToast(validation.errors[0], 'error');
    return;
  }

  if (password !== confirmPassword) {
    showToast('Les mots de passe ne correspondent pas.', 'error');
    return;
  }

  if (!email || !email.includes('@')) {
    showToast('Veuillez entrer une adresse email valide.', 'error');
    return;
  }

  try {
    const { user, error } = await auth.signup(email, password);
    if (error) {
      showToast("Erreur d'inscription : " + error, 'error');
      return;
    }
    if (user) {
      currentUserId = user.id;
      isAuthenticated = true;
      showToast(
        'Compte créé ! Déverrouillez votre carnet avec le mot de passe de chiffrement.',
        'success'
      );
      await showPasswordSetupModal();
    }
  } catch (err) {
    showToast('Erreur : ' + err.message, 'error');
  }
}

/**
 * Connexion avec email + mot de passe (Supabase Auth).
 */
async function handleSignIn(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  try {
    const { session, error } = await auth.signIn(email, password);
    if (error) {
      showToast('Email ou mot de passe incorrect.', 'error');
      return;
    }
    if (session) {
      await onAuthSuccess(session);
    }
  } catch (err) {
    showToast('Erreur : ' + err.message, 'error');
  }
}

async function onAuthSuccess(session) {
  supabaseSession = session;
  currentUserId = session.user.id;

  // Charger l'état local legacy si présent (migration depuis localStorage)
  loadLocalLegacyState();

  // Étape intermédiaire : création / vérification du mot de passe de déverrouillage.
  // Les données sont chiffrées localement ; sans ce mot de passe, impossible d'accéder au carnet.
  if (!appState || !appState.adminPasswordHash) {
    isAuthenticated = false;
    showToast('Créez votre mot de passe de déverrouillage', 'info');
    await showPasswordSetupModal();
    return;
  }

  // Hash existant → demander la saisie pour déverrouiller
  isAuthenticated = false;
  await showUnlockModal();
}

/**
 * Affiche le formulaire de déverrouillage (mot de passe déjà défini).
 */
async function showUnlockModal() {
  const modal = document.getElementById('modal-auth-supabase');
  const form = document.getElementById('form-auth-setup-pwd');
  if (modal) modal.classList.remove('hidden');
  if (form) form.classList.remove('hidden');
  const heading = document.getElementById('auth-setup-heading');
  const subtext = document.getElementById('auth-setup-subtext');
  if (heading) heading.innerText = 'Déverrouiller le Carnet';
  if (subtext) subtext.innerText = 'Entrez votre mot de passe de déverrouillage.';
}

/**
 * Affiche le formulaire de déverrouillage / création du mot de passe de chiffrement.
 */
async function showPasswordSetupModal() {
  const modal = document.getElementById('modal-auth-supabase');
  const form = document.getElementById('form-auth-setup-pwd');
  if (modal) modal.classList.remove('hidden');
  if (form) form.classList.remove('hidden');
  document.getElementById('auth-setup-heading').innerText = 'Déverrouiller le Carnet';
  document.getElementById('auth-setup-subtext').innerText =
    'Votre carnet est chiffré. Créez le mot de passe de déverrouillage.';
}

/**
 * Création du mot de passe de chiffrement local (lié à la session Supabase).
 */
async function handleSetupPassword(e) {
  e.preventDefault();
  const password = document.getElementById('auth-setup-pwd').value;
  const confirmPassword = document.getElementById('auth-setup-pwd-confirm').value;

  const validation = DoxtehadCrypto.validatePasswordStrength(password);
  if (!validation.valid) {
    showToast(validation.errors[0], 'error');
    return;
  }

  if (password !== confirmPassword) {
    showToast('Les mots de passe ne correspondent pas.', 'error');
    return;
  }

  try {
    const hash = await DoxtehadCrypto.createHash(password);
    appState = appState || defaultAppState();
    appState.adminPasswordHash = hash;
    appState.passwordSetDate = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
    isAuthenticated = true;
    closeAuthModal();
    showToast('Mot de passe de déverrouillage créé !', 'success');
    renderAuthStatus();
    await syncDataFromCloud();
    renderAll();
  } catch (err) {
    showToast('Erreur : ' + err.message, 'error');
  }
}

/**
 * Déverrouillage du carnet avec le mot de passe de chiffrement.
 */
async function handleUnlockPassword(e) {
  e.preventDefault();
  const password = document.getElementById('auth-setup-pwd').value;
  const result = await DoxtehadCrypto.verifyHash(password, appState.adminPasswordHash);
  if (!result.valid) {
    showToast('Mot de passe incorrect.', 'error');
    return;
  }
  DoxtehadCrypto.resetRateLimit();
  isAuthenticated = true;
  closeAuthModal();
  showToast('Déverrouillage réussi !', 'success');
  renderAuthStatus();
  await syncDataFromCloud();
  renderAll();
}

function setupNetworkListeners() {
  const banner = document.getElementById('offline-banner');
  function updateOnlineStatus() {
    if (!banner) return;
    if (navigator.onLine) {
      banner.classList.remove('visible');
    } else {
      banner.classList.add('visible');
      showToast('Mode hors-ligne actif. Vos données restent accessibles.', 'warning');
    }
  }
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  updateOnlineStatus();
}

/**
 * Met à jour l'indicateur d'authentification dans l'UI.
 */
function renderAuthStatus() {
  const badge = document.getElementById('auth-user-badge');
  const emailEl = document.getElementById('auth-user-email');
  const statusEl = document.getElementById('auth-sync-status');

  if (badge) {
    if (isAuthenticated && currentUserId) {
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }
  if (emailEl) {
    if (supabaseSession?.user?.email) {
      emailEl.textContent = supabaseSession.user.email;
      emailEl.classList.add('text-emerald-600', 'font-semibold');
    } else {
      emailEl.textContent = 'Non connecté';
      emailEl.classList.remove('text-emerald-600', 'font-semibold');
    }
  }
  if (statusEl) {
    statusEl.textContent = doxtehadDB.isOnline() ? 'Synchronisé' : 'Hors-ligne';
  }
}

function setupAutoLock() {
  let lastActivityAt = Date.now();

  function resetTimer() {
    lastActivityAt = Date.now();
    if (autoLockTimer) clearTimeout(autoLockTimer);
    if (!isAuthenticated) return;

    const minutes = (appState.settings && appState.settings.autoLockMinutes) || 30;
    if (minutes <= 0) return; // 0 = désactivé

    autoLockTimer = setTimeout(
      () => {
        if (isAuthenticated) {
          lockApp();
          showToast('Session verrouillée pour inactivité.', 'info');
        }
      },
      minutes * 60 * 1000
    );
  }

  ['mousedown', 'keydown', 'touchstart', 'scroll'].forEach((evt) => {
    window.addEventListener(evt, resetTimer, { passive: true });
  });

  // Retour d'onglet : verrouiller si le délai est dépassé pendant l'absence
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !isAuthenticated) return;
    const minutes = (appState.settings && appState.settings.autoLockMinutes) || 30;
    if (minutes <= 0) return;
    if (Date.now() - lastActivityAt > minutes * 60 * 1000) {
      lockApp();
      showToast('Session verrouillée pendant votre absence.', 'info');
      return;
    }
    resetTimer();
  });

  resetTimer();
}

// ============================================================
// TOAST NOTIFICATIONS (remplace alert())
// ============================================================
function showToast(message, type = 'info', duration = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ',
  };

  toast.innerHTML = `<span>${icons[type] || '•'}</span><span>${escapeHTML(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(1rem)';
    toast.style.transition = 'all 200ms ease-out';
    setTimeout(() => toast.remove(), 200);
  }, duration);
}

// ============================================================
// AUTHENTIFICATION SÉCURISÉE — OBSOLÈTE (compatibilité)
// Déplacée vers auth.js (Supabase Auth) + gestion du chiffrement local
// ============================================================
async function checkAdminAuth() {
  // Compatibilité : l'authentification est gérée par initializeAuth()
  console.warn('[App] checkAdminAuth() est obsolète — utilisez auth.js');
}

async function handleInitPassword(e) {
  // Redirige vers l'inscription Supabase
  e.preventDefault();
  await showAuthModal();
}

async function handleLogin(e) {
  // Redirige vers la connexion Supabase
  e.preventDefault();
  await handleSignIn(e);
}

async function handleExpiredPasswordChange(e) {
  // Redirige vers la récupération de mot de passe Supabase
  e.preventDefault();
  showToast('Utilisez "Mot de passe oublié" pour réinitialiser votre compte Supabase.', 'info');
  const forgotForm = document.getElementById('form-auth-forgot');
  if (forgotForm) forgotForm.classList.remove('hidden');
}

async function handlePasswordChange(e) {
  // Gestion des paramètres de compte Supabase
  e.preventDefault();
  showToast(
    'Pour modifier votre mot de passe, utilisez les paramètres de votre compte Supabase.',
    'info'
  );
}

function lockApp() {
  isAuthenticated = false;
  currentUserId = null;
  supabaseSession = null;
  checkAuthModal();
}

async function checkAuthModal() {
  // Réaffiche le modal d'authentification si nécessaire
  if (!isAuthenticated) {
    await showAuthModal();
  }
}

function simulateExpiration() {
  // Désactivé : l'authentification est gérée par Supabase Auth (pas d'expiration forcée)
  showToast("L'expiration automatique du mot de passe n'est plus requise (Supabase Auth).", 'info');
}

// ============================================================
// SAUVEGARDE DE L'ÉTAT — OBSOLÈTE (compatibilité)
// Remplacée par db.js (cloud + cache offline)
// ============================================================
function saveCurrentState() {
  // Compatibilité : ne fait plus rien, la sauvegarde est gérée par db.js
  console.warn('[App] saveCurrentState() est obsolète — utilisez db.js');
  return true;
}

/**
 * Synchronise les données depuis le cloud Supabase et fusionne avec le cache local.
 */
async function syncDataFromCloud() {
  if (!currentUserId) return;

  try {
    // Charger les opérations du cloud
    const ops = await doxtehadDB.getOperations({ forceCloud: true });
    const projects = await doxtehadDB.getProjects({ forceCloud: true });

    // Fusionner avec les données locales legacy si présentes
    if (appState && appState.operations && appState.operations.length > 0) {
      const existingIds = new Set(ops.map((op) => op.id));
      const legacyOps = appState.operations.filter((op) => !existingIds.has(op.id));
      legacyOps.forEach((op) => ops.push({ ...op, synced: false }));
    }

    if (appState && appState.projects && appState.projects.length > 0) {
      const existingIds = new Set(projects.map((p) => p.id));
      const legacyProjects = appState.projects.filter((p) => !existingIds.has(p.id));
      legacyProjects.forEach((p) => projects.push({ ...p, synced: false }));
    }

    appState = {
      ...appState,
      operations: ops,
      projects: projects,
      lastSyncAt: new Date().toISOString(),
    };

    // Sauvegarder le cache offline
    doxtehadDB.saveOfflineCache({
      operations: ops.filter((op) => !op.snapshot),
      projects: projects.filter((p) => !p.snapshot),
      updatedAt: Date.now(),
    });

    console.log(
      '[App] Synchronisation cloud terminée:',
      ops.length,
      'opérations,',
      projects.length,
      'projets'
    );
    showToast('Données synchronisées avec le cloud', 'success');
  } catch (err) {
    console.error('[App] Erreur synchronisation cloud:', err);
    showToast('Échec de synchronisation avec le cloud. Mode hors-ligne.', 'warning');
  }
}

/**
 * Sauvegarde locale d'urgence (backup JSON) — conservée pour compatibilité.
 */
function backupCurrentState() {
  try {
    const json = JSON.stringify({
      operations: appState?.operations || [],
      projects: appState?.projects || [],
      exportedAt: new Date().toISOString(),
    });
    downloadFile(
      json,
      `DOXTEHAD_BACKUP_${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
      'application/json'
    );
    showToast('Sauvegarde téléchargée', 'success');
  } catch (err) {
    console.error('[App] Erreur sauvegarde:', err);
  }
}

// ============================================================
// MOTEUR DE RENDU PRINCIPAL
// ============================================================
function renderAll() {
  if (!isAuthenticated) return;

  // Calculs globaux
  const totalRevenus = appState.operations
    .filter((o) => o.type === 'Revenu')
    .reduce((s, o) => s + parseFloat(o.amount || 0), 0);

  const totalDepenses = appState.operations
    .filter((o) => o.type === 'Dépense')
    .reduce((s, o) => s + parseFloat(o.amount || 0), 0);

  const totalProjetsOps = appState.operations
    .filter((o) => o.type === 'Projet')
    .reduce((s, o) => s + parseFloat(o.amount || 0), 0);

  const totalEpargneOps = appState.operations
    .filter((o) => o.type === 'Épargne')
    .reduce((s, o) => s + parseFloat(o.amount || 0), 0);

  // Dashboard KPIs
  setElementText('kpi-revenus', formatCurrency(totalRevenus));
  setElementText('kpi-depenses', formatCurrency(totalDepenses));
  setElementText('kpi-projets', formatCurrency(totalProjetsOps));
  setElementText('kpi-epargne', formatCurrency(totalEpargneOps));

  // Pourcentages relatifs aux revenus
  const depPct = totalRevenus > 0 ? (totalDepenses / totalRevenus) * 100 : 0;
  const projPct = totalRevenus > 0 ? (totalProjetsOps / totalRevenus) * 100 : 0;
  const eparPct = totalRevenus > 0 ? (totalEpargneOps / totalRevenus) * 100 : 0;

  setElementStyleWidth('bar-depenses', Math.min(depPct, 100) + '%');
  setElementStyleWidth('bar-projets', Math.min(projPct, 100) + '%');
  setElementStyleWidth('bar-epargne', Math.min(eparPct, 100) + '%');

  setElementText('pct-depenses', depPct.toFixed(1) + '%');
  setElementText('pct-projets', projPct.toFixed(1) + '%');
  setElementText('pct-epargne', eparPct.toFixed(1) + '%');

  // Règle 75/15/10
  const rules = (appState.settings && appState.settings.budgetRules) || {
    depensesMax: 75,
    projetsMax: 15,
    epargneMin: 10,
  };

  const valMaxDepenses = totalRevenus * (rules.depensesMax / 100);
  const valMaxProjets = totalRevenus * (rules.projetsMax / 100);
  const valMinEpargne = totalRevenus * (rules.epargneMin / 100);

  setElementText('val-max-depenses', formatCurrency(valMaxDepenses));
  setElementText('val-max-projets', formatCurrency(valMaxProjets));
  setElementText('val-min-epargne', formatCurrency(valMinEpargne));

  setElementText('actual-depenses-text', formatCurrency(totalDepenses));
  setElementText('actual-projets-text', formatCurrency(totalProjetsOps));
  setElementText('actual-epargne-text', formatCurrency(totalEpargneOps));

  // Alertes de seuils
  toggleElementClass(
    'alert-depenses-box',
    'hidden',
    totalDepenses <= valMaxDepenses || totalRevenus === 0
  );
  toggleElementClass(
    'alert-projets-box',
    'hidden',
    totalProjetsOps <= valMaxProjets || totalRevenus === 0
  );
  toggleElementClass(
    'alert-epargne-box',
    'hidden',
    totalEpargneOps >= valMinEpargne || totalRevenus === 0
  );

  // Vues spécifiques
  renderRecentOperations();
  renderOperationsTable();
  renderProjectsGrid();
  renderReports(
    totalRevenus,
    totalDepenses,
    totalProjetsOps,
    totalEpargneOps,
    depPct,
    projPct,
    eparPct
  );
  renderSettingsInfo();
}

function formatCurrency(val) {
  const currency = (appState.settings && appState.settings.currency) || '$US';
  const locale = (appState.settings && appState.settings.locale) || 'fr-FR';
  return (
    (val || 0).toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) +
    ' ' +
    currency
  );
}

function setElementText(id, text) {
  const el = document.getElementById(id);
  if (el) el.innerText = text;
}

function setElementStyleWidth(id, width) {
  const el = document.getElementById(id);
  if (el) el.style.width = width;
}

function toggleElementClass(id, className, condition) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle(className, condition);
}

// ============================================================
// GESTION DES OPÉRATIONS (correction tri mutatif)
// ============================================================
function renderRecentOperations() {
  const tbody = document.getElementById('recent-ops-tbody');
  if (!tbody) return;

  // CORRECTION : .slice() avant sort pour éviter de muter l'original
  const recent = appState.operations
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);

  if (recent.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400">Aucune opération enregistrée pour le moment.</td></tr>`;
    return;
  }

  tbody.innerHTML = recent
    .map(
      (o) => `
     <tr class="hover:bg-slate-50">
       <td class="p-3">${o.date}</td>
       <td class="p-3">${getTypeBadge(o.type)}</td>
       <td class="p-3 font-medium">${escapeHTML(o.category)}</td>
       <td class="p-3 text-slate-500">${escapeHTML(o.description || '-')}</td>
       <td class="p-3 text-right font-bold ${
         o.type === 'Revenu' ? 'text-emerald-600' : 'text-slate-800'
       }">${o.type === 'Revenu' ? '+' : '-'}${formatCurrency(o.amount)}</td>
     </tr>
   `
    )
    .join('');
}

function renderOperationsTable() {
  const tbody = document.getElementById('full-ops-tbody');
  if (!tbody) return;

  const filterType = document.getElementById('filter-type')?.value || 'ALL';

  let filtered = appState.operations;
  if (filterType !== 'ALL') {
    filtered = filtered.filter((o) => o.type === filterType);
  }

  setElementText('ops-count', filtered.length);

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-slate-400">Aucune opération trouvée.</td></tr>`;
    return;
  }

  // CORRECTION : .slice() avant sort
  tbody.innerHTML = filtered
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map(
      (o) => `
     <tr class="hover:bg-slate-50">
       <td class="p-3">${o.date}</td>
       <td class="p-3">${getTypeBadge(o.type)}</td>
       <td class="p-3 font-semibold text-slate-800">${escapeHTML(o.category)}</td>
       <td class="p-3 text-slate-500">${escapeHTML(o.description || '-')}</td>
       <td class="p-3 text-right font-bold ${
         o.type === 'Revenu' ? 'text-emerald-600' : 'text-slate-800'
       }">${o.type === 'Revenu' ? '+' : '-'}${formatCurrency(o.amount)}</td>
       <td class="p-3 text-center space-x-1">
         <button onclick="DoxtehadApp.openOperationModal('${o.id}')" title="Modifier" class="p-1 text-blue-600 hover:text-blue-800 rounded">
           <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
             <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
           </svg>
         </button>
         <button onclick="DoxtehadApp.deleteOperation('${o.id}')" title="Supprimer" class="p-1 text-rose-600 hover:text-rose-800 rounded">
           <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
             <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
           </svg>
         </button>
       </td>
     </tr>
   `
    )
    .join('');
}

function getTypeBadge(type) {
  const map = {
    Revenu: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    Dépense: 'bg-rose-100 text-rose-800 border-rose-200',
    Projet: 'bg-blue-100 text-blue-800 border-blue-200',
    Épargne: 'bg-amber-100 text-amber-800 border-amber-200',
  };
  return `<span class="px-2 py-0.5 rounded text-[10px] font-bold border ${
    map[type] || 'bg-slate-100'
  }">${type}</span>`;
}

function openOperationModal(id = null) {
  const modal = document.getElementById('modal-operation');
  const form = document.getElementById('form-operation');
  form.reset();

  if (id) {
    const op = appState.operations.find((o) => o.id === id);
    if (op) {
      setElementText('modal-op-title', "Modifier l'Opération");
      document.getElementById('op-id').value = op.id;
      document.getElementById('op-type').value = op.type;
      document.getElementById('op-category').value = op.category;
      document.getElementById('op-desc').value = op.description || '';
      document.getElementById('op-amount').value = op.amount;
      document.getElementById('op-date').value = op.date;
    }
  } else {
    setElementText('modal-op-title', 'Nouvelle Opération');
    document.getElementById('op-id').value = '';
    document.getElementById('op-date').value = new Date().toISOString().split('T')[0];
  }

  modal.classList.remove('hidden');
}

async function saveOperation(e) {
  e.preventDefault();
  const id = document.getElementById('op-id').value;
  const amount = parseFloat(document.getElementById('op-amount').value);

  if (isNaN(amount) || amount <= 0) {
    showToast('Le montant doit être un nombre positif.', 'error');
    return;
  }

  const opData = {
    type: document.getElementById('op-type').value,
    category: document.getElementById('op-category').value.trim(),
    description: document.getElementById('op-desc').value.trim(),
    amount: amount,
    date: document.getElementById('op-date').value,
  };

  try {
    if (id) {
      // Mise à jour cloud + local
      await doxtehadDB.updateOperation(id, opData);
      const idx = appState.operations.findIndex((o) => o.id === id);
      if (idx !== -1) appState.operations[idx] = { ...appState.operations[idx], ...opData };
      showToast('Opération modifiée.', 'success');
    } else {
      // Création cloud (avec cache offline automatique si hors-ligne)
      const created = await doxtehadDB.createOperation(opData);
      appState.operations.unshift(created);
      showToast('Nouvelle opération enregistrée.', 'success');
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
    closeModal('modal-operation');
    renderAll();
  } catch (err) {
    showToast('Erreur enregistrement : ' + err.message, 'error');
  }
}

async function deleteOperation(id) {
  if (confirm('Voulez-vous vraiment supprimer cette opération ?')) {
    try {
      await doxtehadDB.deleteOperation(id);
      appState.operations = appState.operations.filter((o) => o.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
      renderAll();
      showToast('Opération supprimée.', 'info');
    } catch (err) {
      showToast('Erreur suppression : ' + err.message, 'error');
    }
  }
}

// ============================================================
// GESTION DES PROJETS SMART (calcul mois précis)
// ============================================================
function renderProjectsGrid() {
  const grid = document.getElementById('projects-grid');
  if (!grid) return;

  const catFilter = document.getElementById('proj-filter-category')?.value || 'ALL';
  const statusFilter = document.getElementById('proj-filter-status')?.value || 'ALL';

  let projects = appState.projects;

  if (catFilter !== 'ALL') {
    projects = projects.filter((p) => (p.category || 'Autre') === catFilter);
  }
  if (statusFilter !== 'ALL') {
    projects = projects.filter((p) => (p.status || 'En cours') === statusFilter);
  }

  setElementText('projects-count', projects.length);

  const totalTarget = appState.projects.reduce((s, p) => s + parseFloat(p.target || 0), 0);
  const totalSaved = appState.projects.reduce((s, p) => s + parseFloat(p.saved || 0), 0);
  const globalPct = totalTarget > 0 ? (totalSaved / totalTarget) * 100 : 0;

  let totalMonthlyNeeded = 0;
  const today = new Date();

  appState.projects.forEach((p) => {
    if ((p.status || 'En cours') !== 'Atteint') {
      const remaining = Math.max(0, p.target - p.saved);
      if (remaining > 0 && p.deadline) {
        const monthsLeft = calculateMonthsRemaining(p.deadline);
        if (monthsLeft > 0) {
          totalMonthlyNeeded += remaining / monthsLeft;
        }
      }
    }
  });

  setElementText('proj-kpi-target', formatCurrency(totalTarget));
  setElementText('proj-kpi-saved', formatCurrency(totalSaved));
  setElementText('proj-kpi-pct', globalPct.toFixed(1) + '%');
  setElementText('proj-kpi-monthly', formatCurrency(totalMonthlyNeeded) + ' / mo');

  if (projects.length === 0) {
    grid.innerHTML = `
     <div class="col-span-full p-8 text-center bg-white rounded-xl border border-dashed border-slate-300 text-slate-400">
       Aucun projet trouvé avec les critères sélectionnés.
     </div>
   `;
    return;
  }

  grid.innerHTML = projects
    .map((p) => {
      const target = parseFloat(p.target || 0);
      const saved = parseFloat(p.saved || 0);
      const pct = target > 0 ? Math.min((saved / target) * 100, 100) : 0;
      const remaining = Math.max(0, target - saved);
      const status = p.status || 'En cours';
      const category = p.category || 'Autre';
      const priority = p.priority || 'Moyenne';

      let monthsLeftText = '-';
      let monthlyEffort = 0;

      if (p.deadline) {
        const monthsLeft = calculateMonthsRemaining(p.deadline);
        if (monthsLeft > 1) {
          monthsLeftText = `${Math.ceil(monthsLeft)} mois restant(s)`;
          monthlyEffort = remaining / monthsLeft;
        } else if (monthsLeft > 0) {
          monthsLeftText = `Ce mois-ci !`;
          monthlyEffort = remaining;
        } else {
          monthsLeftText = `Échéance dépassée`;
          monthlyEffort = remaining;
        }
      }

      const priorityBadge =
        priority === 'Haute'
          ? '<span class="px-2 py-0.5 text-[10px] font-bold bg-rose-100 text-rose-700 rounded border border-rose-200">Priorité Haute 🔥</span>'
          : priority === 'Moyenne'
            ? '<span class="px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-700 rounded border border-amber-200">Priorité Moyenne ⚡</span>'
            : '<span class="px-2 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-600 rounded border border-slate-200">Priorité Basse 🌱</span>';

      const statusBadge =
        status === 'Atteint'
          ? '<span class="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 rounded">Terminé 🎉</span>'
          : status === 'En pause'
            ? '<span class="px-2 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-600 rounded">En Pause ⏸️</span>'
            : '<span class="px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-800 rounded">Actif 🚀</span>';

      return `
       <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3 flex flex-col justify-between relative overflow-hidden">
         <div class="space-y-2">
           <div class="flex justify-between items-start gap-2">
             <div>
               <span class="text-[10px] uppercase font-bold text-slate-400">${escapeHTML(category)}</span>
               <h3 class="font-bold text-slate-800 text-sm leading-snug">${escapeHTML(p.title)}</h3>
             </div>
             <div class="flex space-x-1">
               <button onclick="DoxtehadApp.openProjectModal('${p.id}')" title="Éditer" class="p-1 text-blue-600 hover:text-blue-800">
                 <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                   <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                 </svg>
               </button>
               <button onclick="DoxtehadApp.deleteProject('${p.id}')" title="Supprimer" class="p-1 text-rose-600 hover:text-rose-800">
                 <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                   <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                 </svg>
               </button>
             </div>
           </div>

           <div class="flex items-center space-x-2">
             ${statusBadge}
             ${priorityBadge}
           </div>

           <div class="space-y-1 pt-1">
             <div class="flex justify-between text-xs">
               <span class="text-slate-500 font-medium">Progression SMART</span>
               <span class="font-bold text-slate-800">${pct.toFixed(1)}%</span>
             </div>
             <div class="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
               <div class="${pct >= 100 ? 'bg-emerald-500' : 'bg-blue-600'} h-2.5 rounded-full transition-all duration-300" style="width: ${pct}%"></div>
             </div>
           </div>

           <div class="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-100 bg-slate-50/50 p-2.5 rounded-lg">
             <div>
               <p class="text-[10px] text-slate-400 font-semibold">CAPITAL ACQUIS</p>
               <p class="font-bold text-slate-800">${formatCurrency(saved)}</p>
             </div>
             <div>
               <p class="text-[10px] text-slate-400 font-semibold">OBJECTIF FINAL</p>
               <p class="font-bold text-slate-800">${formatCurrency(target)}</p>
             </div>
             <div class="col-span-2 pt-1 border-t border-slate-200/60 flex justify-between items-center text-[11px]">
               <span class="text-slate-500">Échéance : <strong class="text-slate-700">${p.deadline}</strong> (${monthsLeftText})</span>
             </div>
           </div>

           ${
             status !== 'Atteint' && remaining > 0
               ? `
             <div class="p-2 bg-amber-50 rounded border border-amber-200/60 text-[11px] text-amber-900 flex justify-between items-center">
               <span>Effort mensuel requis :</span>
               <strong class="font-bold text-amber-800">${formatCurrency(monthlyEffort)}/mo</strong>
             </div>
           `
               : ''
           }
         </div>

         <div class="pt-2">
           <button onclick="DoxtehadApp.openProjectContributionModal('${p.id}')" class="w-full flex items-center justify-center space-x-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold text-xs py-2 rounded-lg border border-blue-200 transition">
             <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
               <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
             </svg>
             <span>Alimenter ce Projet</span>
           </button>
         </div>
       </div>
     `;
    })
    .join('');
}

// Calcul précis des mois restants (jours / 30.4375)
function calculateMonthsRemaining(deadlineStr) {
  if (!deadlineStr) return 0;
  const deadline = new Date(deadlineStr);
  const now = new Date();
  const diffMs = deadline.getTime() - now.getTime();
  if (diffMs <= 0) return 0;
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return Math.max(0.1, diffDays / 30.4375);
}

function openProjectModal(id = null) {
  const modal = document.getElementById('modal-project');
  const form = document.getElementById('form-project');
  form.reset();

  if (id) {
    const proj = appState.projects.find((p) => p.id === id);
    if (proj) {
      setElementText('modal-proj-title', 'Modifier le Projet SMART');
      document.getElementById('proj-id').value = proj.id;
      document.getElementById('proj-title-input').value = proj.title;
      document.getElementById('proj-category').value = proj.category || 'Investissement';
      document.getElementById('proj-priority').value = proj.priority || 'Moyenne';
      document.getElementById('proj-target').value = proj.target;
      document.getElementById('proj-saved').value = proj.saved;
      document.getElementById('proj-deadline').value = proj.deadline;
      document.getElementById('proj-status').value = proj.status || 'En cours';
    }
  } else {
    setElementText('modal-proj-title', 'Nouveau Projet SMART');
    document.getElementById('proj-id').value = '';
    document.getElementById('proj-deadline').value = new Date().toISOString().split('T')[0];
  }

  modal.classList.remove('hidden');
}

async function saveProject(e) {
  e.preventDefault();
  const id = document.getElementById('proj-id').value;
  const targetVal = parseFloat(document.getElementById('proj-target').value);
  const savedVal = parseFloat(document.getElementById('proj-saved').value);
  let statusVal = document.getElementById('proj-status').value;

  if (savedVal >= targetVal && targetVal > 0) {
    statusVal = 'Atteint';
  }

  const projData = {
    title: document.getElementById('proj-title-input').value.trim(),
    category: document.getElementById('proj-category').value,
    priority: document.getElementById('proj-priority').value,
    target: targetVal,
    deadline: document.getElementById('proj-deadline').value,
    status: statusVal,
  };

  try {
    if (id) {
      await doxtehadDB.updateProject(id, projData);
      const idx = appState.projects.findIndex((p) => p.id === id);
      if (idx !== -1) appState.projects[idx] = { ...appState.projects[idx], ...projData };
      showToast('Projet modifié.', 'success');
    } else {
      const created = await doxtehadDB.createProject({ ...projData, saved: savedVal || 0 });
      appState.projects.unshift(created);
      showToast('Nouveau projet créé !', 'success');
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
    closeModal('modal-project');
    renderAll();
  } catch (err) {
    showToast('Erreur enregistrement projet : ' + err.message, 'error');
  }
}

async function deleteProject(id) {
  if (confirm('Voulez-vous vraiment supprimer ce projet ?')) {
    try {
      await doxtehadDB.deleteProject(id);
      appState.projects = appState.projects.filter((p) => p.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
      renderAll();
      showToast('Projet supprimé.', 'info');
    } catch (err) {
      showToast('Erreur suppression : ' + err.message, 'error');
    }
  }
}

function openProjectContributionModal(id) {
  const proj = appState.projects.find((p) => p.id === id);
  if (!proj) return;

  document.getElementById('contrib-proj-id').value = proj.id;
  setElementText(
    'contrib-proj-name',
    `Projet : ${proj.title} (Acquis: ${formatCurrency(proj.saved)})`
  );
  document.getElementById('contrib-amount').value = '';
  document.getElementById('modal-project-contribution').classList.remove('hidden');
}

async function saveProjectContribution(e) {
  e.preventDefault();
  const id = document.getElementById('contrib-proj-id').value;
  const rawAmount = document.getElementById('contrib-amount').value;
  const addAmount = parseFloat(rawAmount);
  const proj = appState.projects.find((p) => p.id === id);

  if (!proj) {
    showToast('Projet introuvable.', 'error');
    return;
  }

  if (!Number.isFinite(addAmount) || addAmount <= 0) {
    showToast('Montant invalide. Entrez un nombre strictement positif.', 'error');
    return;
  }

  const remaining = Math.max(0, (proj.target || 0) - (proj.saved || 0));
  if (remaining <= 0) {
    showToast('Ce projet a déjà atteint son objectif.', 'warning');
    return;
  }

  // Alerter et plafonner si le montant dépasse largement
  let appliedAmount = addAmount;
  if (addAmount > remaining) {
    appliedAmount = remaining;
    showToast(
      `Montant ajusté à ${formatCurrency(remaining)} pour ne pas dépasser l'objectif.`,
      'info'
    );
  }

  proj.saved = parseFloat(((proj.saved || 0) + appliedAmount).toFixed(2));
  if (proj.saved >= proj.target) {
    proj.status = 'Atteint';
  }

  try {
    // Mise à jour du projet en cloud
    await doxtehadDB.updateProject(id, { saved: proj.saved, status: proj.status });

    // Enregistrer également comme opération cloud
    const createdOp = await doxtehadDB.createOperation({
      type: 'Projet',
      category: proj.category || 'Projet',
      description: `Apport au projet : ${proj.title}`,
      amount: appliedAmount,
      date: new Date().toISOString().split('T')[0],
    });
    appState.operations.unshift(createdOp);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
    closeModal('modal-project-contribution');
    renderAll();
    showToast(`+${formatCurrency(appliedAmount)} alloués au projet ${proj.title} !`, 'success');
  } catch (err) {
    showToast('Erreur contribution : ' + err.message, 'error');
  }
}

// ============================================================
// RAPPORTS & ANALYSES (Canvas HiDPI net)
// ============================================================
function renderReports(rev, dep, proj, epar, depPct, projPct, eparPct) {
  setElementText('rep-depense-pct', depPct.toFixed(1) + '%');
  setElementText('rep-projet-pct', projPct.toFixed(1) + '%');
  setElementText('rep-epargne-pct', eparPct.toFixed(1) + '%');

  setElementStyleWidth('rep-depense-bar', Math.min(depPct, 100) + '%');
  setElementStyleWidth('rep-projet-bar', Math.min(projPct, 100) + '%');
  setElementStyleWidth('rep-epargne-bar', Math.min(eparPct, 100) + '%');

  const totalEngaged = dep + proj + epar;
  const totalDispo = Math.max(0, rev - totalEngaged);

  setElementText('rep-total-rev', formatCurrency(rev));
  setElementText('rep-total-eng', formatCurrency(totalEngaged));
  setElementText('rep-total-dispo', formatCurrency(totalDispo));

  drawNativeDoughnutCanvas(
    [dep, proj, epar, totalDispo],
    ['#f43f5e', '#3b82f6', '#f59e0b', '#10b981']
  );
}

// Support HiDPI / Retina pour un rendu net
function drawNativeDoughnutCanvas(values, colors) {
  const canvas = document.getElementById('custom-pie-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const displayWidth = 260;
  const displayHeight = 260;

  // Ajuster la résolution interne pour la netteté
  if (canvas.width !== displayWidth * dpr) {
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    canvas.style.width = displayWidth + 'px';
    canvas.style.height = displayHeight + 'px';
  }

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, displayWidth, displayHeight);

  const total = values.reduce((a, b) => a + b, 0);
  const centerX = displayWidth / 2;
  const centerY = displayHeight / 2;
  const radius = Math.min(centerX, centerY) - 15;
  const innerRadius = radius * 0.55;

  if (total === 0) {
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.arc(centerX, centerY, innerRadius, 2 * Math.PI, 0, true);
    ctx.fillStyle = '#e2e8f0';
    ctx.fill();
    ctx.restore();
    return;
  }

  let startAngle = -0.5 * Math.PI;

  values.forEach((val, i) => {
    if (val <= 0) return;
    const sliceAngle = (val / total) * 2 * Math.PI;
    const endAngle = startAngle + sliceAngle;

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, startAngle, endAngle);
    ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
    ctx.closePath();
    ctx.fillStyle = colors[i];
    ctx.fill();

    startAngle = endAngle;
  });

  ctx.restore();
}

// ============================================================
// SETTINGS & INFORMATIONS SÉCURITÉ
// ============================================================
function renderSettingsInfo() {
  if (!appState.passwordSetDate) return;

  const setDate = new Date(appState.passwordSetDate);
  setElementText('pwd-last-date', setDate.toLocaleDateString('fr-FR'));

  const diffMs = Date.now() - setDate.getTime();
  const daysUsed = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const remaining = Math.max(0, 180 - daysUsed);

  setElementText('pwd-remaining-days', remaining);
}

// ============================================================
// IMPORT / EXPORT AVEC VALIDATION (cloud + local)
// ============================================================
function exportDataJSON() {
  const exportData = {
    _version: 2,
    operations: appState?.operations || [],
    projects: appState?.projects || [],
    adminPasswordHash: appState?.adminPasswordHash || null,
    passwordSetDate: appState?.passwordSetDate || null,
    exportedAt: new Date().toISOString(),
  };
  const jsonStr = JSON.stringify(exportData, null, 2);
  downloadFile(
    jsonStr,
    `DOXTEHAD_Budget_Backup_${new Date().toISOString().split('T')[0]}.json`,
    'application/json'
  );
  showToast('Sauvegarde JSON générée avec succès !', 'success');
}

function exportDataCSV() {
  const headers = ['Date', 'Type', 'Catégorie', 'Description', 'Montant'];
  const ops = appState?.operations || [];
  const rows = ops
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map((op) => [
      op.date,
      op.type,
      '"' + (op.category || '').replace(/"/g, '""') + '"',
      '"' + (op.description || '').replace(/"/g, '""') + '"',
      op.type === 'Revenu' ? op.amount : -op.amount,
    ]);
  const csv = [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
  downloadFile(
    '\uFEFF' + csv,
    `DOXTEHAD_Operations_${new Date().toISOString().split('T')[0]}.csv`,
    'text/csv;charset=utf-8;'
  );
  showToast('Export CSV généré avec succès !', 'success');
}

function downloadFile(content, fileName, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importDataJSON(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const imported = JSON.parse(e.target.result);

      if (!imported.operations || !Array.isArray(imported.operations)) {
        showToast('Fichier invalide : structure de sauvegarde incorrecte', 'error', 6000);
        return;
      }
      if (!imported.projects || !Array.isArray(imported.projects)) {
        showToast('Fichier invalide : structure de sauvegarde incorrecte', 'error', 6000);
        return;
      }

      // SÉCURITÉ : désinfection des champs texte contre XSS embarqué
      imported.operations.forEach((op) => {
        op.category = sanitizeText(op.category);
        op.description = sanitizeText(op.description);
      });
      imported.projects.forEach((proj) => {
        proj.title = sanitizeText(proj.title);
        proj.category = sanitizeText(proj.category);
      });

      // Préserver le mot de passe de déverrouillage actuel si le fichier n'en a pas
      if (!imported.adminPasswordHash) {
        imported.adminPasswordHash = appState?.adminPasswordHash;
        imported.passwordSetDate = appState?.passwordSetDate;
      }

      appState = imported;
      saveCurrentState();
      checkAdminAuth();
      renderAll();
      showToast('Données restaurées avec succès !', 'success');
    } catch (err) {
      showToast('Erreur de lecture du fichier JSON: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
  // Reset l'input file pour permettre de re-sélectionner le même fichier
  event.target.value = '';
}

function sanitizeText(text) {
  if (!text || typeof text !== 'string') return '';
  // Whitelist alphanum + espaces + ponctuation courante
  return text.replace(/[^a-zA-Z0-9À-ÿ\s\-_'.,:;!?()€$£¥%°]/g, '');
}

function confirmResetAll() {
  if (
    confirm(
      'ATTENTION : Souhaitez-vous vraiment réinitialiser toutes vos opérations et projets ?\n\nLe mot de passe administrateur sera conservé.'
    )
  ) {
    const currentHash = appState.adminPasswordHash;
    const currentDate = appState.passwordSetDate;
    const currentSettings = appState.settings;

    appState = defaultAppState();
    appState.adminPasswordHash = currentHash;
    appState.passwordSetDate = currentDate;
    appState.settings = currentSettings;

    saveCurrentState();
    renderAll();
    showToast('Application réinitialisée à 0.00 $US.', 'info');
  }
}

// ============================================================
// NAVIGATION & UI
// ============================================================

/**
 * Bascule l'affichage d'un champ mot de passe (type text/password)
 * et met à jour l'icône œil du bouton.
 */
function togglePasswordVisibility(inputId, btnId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';

  const btn = btnId ? document.getElementById(btnId) : null;
  if (btn) {
    btn.innerHTML = isHidden ? ICON_EYE_OFF : ICON_EYE;
    btn.setAttribute(
      'aria-label',
      isHidden ? 'Masquer le mot de passe' : 'Afficher le mot de passe'
    );
    btn.setAttribute('title', isHidden ? 'Masquer' : 'Afficher');
  }
}

const ICON_EYE = `
    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
      <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
    </svg>`;

const ICON_EYE_OFF = `
    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.879l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
    </svg>`;

function switchTab(tabId) {
  document.querySelectorAll('section[id^="page-"]').forEach((el) => el.classList.add('hidden'));
  const targetPage = document.getElementById(`page-${tabId}`);
  if (targetPage) targetPage.classList.remove('hidden');

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.remove('bg-white', 'text-navy-800');
    btn.classList.add('text-slate-300', 'hover:text-white', 'hover:bg-navy-900');
  });

  const activeBtn = document.getElementById(`tab-${tabId}`);
  if (activeBtn) {
    activeBtn.classList.add('bg-white', 'text-navy-800');
    activeBtn.classList.remove('text-slate-300', 'hover:text-white', 'hover:bg-navy-900');
  }

  renderAll();
}

function closeModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.add('hidden');
}

function escapeHTML(str) {
  return (str || '').replace(
    /[&<>'"]/g,
    (tag) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
      })[tag] || tag
  );
}

// ============================================================
// API PUBLIQUE (exposée sur window.DoxtehadApp)
// ============================================================
window.DoxtehadApp = {
  // Auth Supabase
  handleSignUp,
  handleSignIn,
  handleSetupPassword,
  handleUnlockPassword,
  handleLogout,
  resetPassword,
  checkAuthModal,

  // Auth legacy (compatibilité)
  handleInitPassword,
  handleLogin,
  handleExpiredPasswordChange,
  handlePasswordChange,
  lockApp,
  simulateExpiration,

  // Opérations
  openOperationModal,
  saveOperation,
  deleteOperation,
  renderOperationsTable,

  // Projets
  openProjectModal,
  saveProject,
  deleteProject,
  openProjectContributionModal,
  saveProjectContribution,
  renderProjectsGrid,

  // Data
  exportDataJSON,
  exportDataCSV,
  importDataJSON,
  confirmResetAll,

  // Auth legacy (compatibilité)
  handleInitPassword,
  handleLogin,
  handleExpiredPasswordChange,
  handlePasswordChange,
  lockApp,
  simulateExpiration,

  // UI
  switchTab,
  closeModal,
  showToast,
  renderAuthStatus,
  togglePasswordVisibility,
};
