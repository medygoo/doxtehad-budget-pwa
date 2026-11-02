/* ============================================================
   STORAGE MODULE — Carnet de Budget DOXTEHAD
   Gestion localStorage robuste :
   - Try/catch complet
   - Validation du format importé
   - Versioning des données
   - Migration automatique
   ============================================================ */

(function (global) {
  'use strict';

  const STORAGE_KEY = 'DOXTEHAD_BUDGET_APP_DATA';
  const DATA_VERSION = 2;

  // ============================================================
  // État par défaut
  // ============================================================
  function defaultState() {
    return {
      _version: DATA_VERSION,
      operations: [],
      projects: [],
      adminPasswordHash: null,
      passwordSetDate: null,
      settings: {
        currency: '$US',
        currencySymbol: '$',
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

  // ============================================================
  // Chargement depuis localStorage
  // ============================================================
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return defaultState();

      return migrateIfNeeded(parsed);
    } catch (err) {
      console.error('[Storage] Erreur lecture localStorage:', err);
      return defaultState();
    }
  }

  // ============================================================
  // Migration des données
  // ============================================================
  function migrateIfNeeded(state) {
    const version = state._version || 1;

    // v1 → v2 : ajout settings
    if (version < 2) {
      state._version = 2;
      if (!state.settings) {
        state.settings = defaultState().settings;
      }
    }

    // Assurer les champs obligatoires
    if (!Array.isArray(state.operations)) state.operations = [];
    if (!Array.isArray(state.projects)) state.projects = [];
    if (!state.settings) state.settings = defaultState().settings;
    if (!state.settings.budgetRules) {
      state.settings.budgetRules = defaultState().settings.budgetRules;
    }

    return state;
  }

  // ============================================================
  // Sauvegarde dans localStorage
  // ============================================================
  function saveState(state) {
    try {
      state._version = DATA_VERSION;
      const serialized = JSON.stringify(state);

      // Vérifier la taille (limite ~5MB selon navigateur)
      const sizeKB = Math.round(serialized.length / 1024);
      if (sizeKB > 4000) {
        console.warn('[Storage] Données > 4MB, risque de quota exceeded');
      }

      localStorage.setItem(STORAGE_KEY, serialized);
      return { success: true, sizeKB };
    } catch (err) {
      if (err.name === 'QuotaExceededError' || err.code === 22) {
        console.error('[Storage] QUOTA EXCEEDED — localStorage plein');
        return {
          success: false,
          error: 'quota_exceeded',
          message: 'Stockage local plein. Exportez vos données et réinitialisez.',
        };
      }
      console.error('[Storage] Erreur écriture localStorage:', err);
      return { success: false, error: 'unknown', message: err.message };
    }
  }

  // ============================================================
  // Validation d'un état importé (JSON externe)
  // ============================================================
  function validateImportedState(data) {
    const errors = [];

    if (!data || typeof data !== 'object') {
      return { valid: false, errors: ['Format JSON invalide.'] };
    }

    if (!Array.isArray(data.operations)) {
      errors.push('Champ "operations" manquant ou invalide.');
    } else {
      // Valider chaque opération
      data.operations.forEach((op, i) => {
        if (!op.id || typeof op.id !== 'string') {
          errors.push(`Opération #${i}: id manquant.`);
        }
        if (!['Revenu', 'Dépense', 'Projet', 'Épargne'].includes(op.type)) {
          errors.push(`Opération #${i}: type "${op.type}" invalide.`);
        }
        const amount = parseFloat(op.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
          errors.push(`Opération #${i}: montant invalide.`);
        }
        if (!op.date || !/^\d{4}-\d{2}-\d{2}$/.test(op.date)) {
          errors.push(`Opération #${i}: date invalide.`);
        }
      });
    }

    if (!Array.isArray(data.projects)) {
      errors.push('Champ "projects" manquant ou invalide.');
    } else {
      data.projects.forEach((p, i) => {
        if (!p.id || typeof p.id !== 'string') {
          errors.push(`Projet #${i}: id manquant.`);
        }
        if (!p.title || typeof p.title !== 'string') {
          errors.push(`Projet #${i}: titre manquant.`);
        }
        const target = parseFloat(p.target);
        if (!Number.isFinite(target) || target <= 0) {
          errors.push(`Projet #${i}: objectif invalide.`);
        }
      });
    }

    if (errors.length > 5) {
      errors.splice(5);
      errors.push(`... et ${errors.length} autres erreurs.`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: generateWarnings(data),
    };
  }

  function generateWarnings(data) {
    const warnings = [];
    if (data.adminPasswordHash) {
      warnings.push(
        'Ce fichier contient le hash du mot de passe administrateur. Gardez-le confidentiel.'
      );
    }
    if (data.operations && data.operations.length > 5000) {
      warnings.push(
        `Ce fichier contient ${data.operations.length} opérations — chargement peut être lent.`
      );
    }
    return warnings;
  }

  // ============================================================
  // Export JSON (sans exposition du hash si non demandé)
  // ============================================================
  function exportToJSON(state, includeSecurity = false) {
    const exportData = {
      _version: DATA_VERSION,
      _exportDate: new Date().toISOString(),
      _app: 'DOXTEHAD Budget v2.0',
      operations: state.operations,
      projects: state.projects,
      settings: state.settings,
    };

    if (includeSecurity) {
      exportData.adminPasswordHash = state.adminPasswordHash;
      exportData.passwordSetDate = state.passwordSetDate;
    }

    return JSON.stringify(exportData, null, 2);
  }

  // ============================================================
  // Export CSV opérations
  // ============================================================
  function exportOperationsCSV(operations, locale = 'fr-FR') {
    const headers = ['Date', 'Type', 'Catégorie', 'Description', 'Montant'];
    const rows = operations
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
    return '\uFEFF' + csv; // BOM UTF-8 pour Excel
  }

  // ============================================================
  // Export du module
  // ============================================================
  global.DoxtehadStorage = {
    loadState,
    saveState,
    validateImportedState,
    exportToJSON,
    exportOperationsCSV,
    defaultState,
    DATA_VERSION,
  };
})(window);
