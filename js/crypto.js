/* ============================================================
   CRYPTO MODULE — Carnet de Budget DOXTEHAD
   Sécurité renforcée du mot de passe :
   - SHA-256 + sel aléatoire (via WebCrypto API)
   - Détection et migration de l'ancien hash faible
   - Rate limiting des tentatives de connexion
   ============================================================ */

(function (global) {
  'use strict';

  const PBKDF2_ITERATIONS = 100000;
  const SALT_BYTES = 16;
  const LEGACY_PREFIX = 'legacy:';

  // ============================================================
  // Utilitaires binaires
  // ============================================================
  function bytesToHex(bytes) {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
  }

  function generateSalt() {
    const salt = new Uint8Array(SALT_BYTES);
    crypto.getRandomValues(salt);
    return bytesToHex(salt);
  }

  // ============================================================
  // Détection de l'ancien système de hash (simpleHash)
  // ============================================================
  function isLegacyHash(hash) {
    if (!hash || typeof hash !== 'string') return false;
    // L'ancien simpleHash produisait un entier signé en string
    return /^-?\d+$/.test(hash) && hash.length <= 12;
  }

  // ============================================================
  // Reproduction exacte de l'ancien simpleHash pour migration
  // ============================================================
  function legacyHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return hash.toString();
  }

  // ============================================================
  // Dérivation PBKDF2-SHA256 (recommandé, plus robuste)
  // ============================================================
  async function deriveKey(password, saltHex, iterations) {
    const encoder = new TextEncoder();
    const passwordKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: hexToBytes(saltHex),
        iterations: iterations || PBKDF2_ITERATIONS,
        hash: 'SHA-256'
      },
      passwordKey,
      256
    );

    return bytesToHex(new Uint8Array(derivedBits));
  }

  // ============================================================
  // Créer un nouveau hash sécurisé
  // Format : "pbkdf2$<iterations>$<salt>$<hash>"
  // ============================================================
  async function createHash(password) {
    if (!password || typeof password !== 'string') {
      throw new Error('Mot de passe invalide');
    }
    const salt = generateSalt();
    const hash = await deriveKey(password, salt, PBKDF2_ITERATIONS);
    return `pbkdf2$${PBKDF2_ITERATIONS}$${salt}$${hash}`;
  }

  // ============================================================
  // Vérifier un mot de passe contre un hash stocké
  // Supporte : nouveau format pbkdf2$... ET ancien format legacy
  // Retourne { valid: bool, needsMigration: bool }
  // ============================================================
  async function verifyHash(password, storedHash) {
    if (!password || !storedHash) {
      return { valid: false, needsMigration: false };
    }

    // Ancien format (simpleHash)
    if (isLegacyHash(storedHash)) {
      const computed = legacyHash(password);
      return {
        valid: computed === storedHash,
        needsMigration: computed === storedHash
      };
    }

    // Nouveau format pbkdf2$iterations$salt$hash
    const parts = storedHash.split('$');
    if (parts.length !== 4 || parts[0] !== 'pbkdf2') {
      console.warn('[Crypto] Format de hash inconnu');
      return { valid: false, needsMigration: false };
    }

    const iterations = parseInt(parts[1], 10);
    const salt = parts[2];
    const expectedHash = parts[3];

    if (!Number.isFinite(iterations) || iterations < 1000 || !salt || !expectedHash) {
      return { valid: false, needsMigration: false };
    }

    try {
      const computed = await deriveKey(password, salt, iterations);
      // Comparaison à temps constant (protection timing attack)
      return {
        valid: timingSafeEqual(computed, expectedHash),
        needsMigration: false
      };
    } catch (err) {
      console.error('[Crypto] Erreur dérivation:', err);
      return { valid: false, needsMigration: false };
    }
  }

  // ============================================================
  // Comparaison à temps constant
  // ============================================================
  function timingSafeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
  }

  // ============================================================
  // Rate limiting — protection brute-force
  // ============================================================
  const RATE_LIMIT_KEY = 'DOXTEHAD_RATE_LIMIT';
  const MAX_ATTEMPTS = 5;
  const LOCKOUT_DURATION_MS = 60 * 1000; // 1 minute
  const ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

  function getRateLimitState() {
    try {
      const raw = localStorage.getItem(RATE_LIMIT_KEY);
      if (!raw) return { attempts: 0, firstAttemptAt: 0, lockedUntil: 0 };
      const parsed = JSON.parse(raw);
      return {
        attempts: parsed.attempts || 0,
        firstAttemptAt: parsed.firstAttemptAt || 0,
        lockedUntil: parsed.lockedUntil || 0
      };
    } catch {
      return { attempts: 0, firstAttemptAt: 0, lockedUntil: 0 };
    }
  }

  function saveRateLimitState(state) {
    try {
      localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(state));
    } catch (err) {
      console.warn('[Crypto] Impossible de sauvegarder le rate limit:', err);
    }
  }

  function isLockedOut() {
    const state = getRateLimitState();
    const now = Date.now();
    if (state.lockedUntil > now) {
      return {
        locked: true,
        remainingMs: state.lockedUntil - now,
        remainingSeconds: Math.ceil((state.lockedUntil - now) / 1000)
      };
    }
    return { locked: false, remainingMs: 0, remainingSeconds: 0 };
  }

  function recordFailedAttempt() {
    const now = Date.now();
    const state = getRateLimitState();

    // Fenêtre expirée → reset
    if (now - state.firstAttemptAt > ATTEMPT_WINDOW_MS) {
      state.attempts = 0;
      state.firstAttemptAt = now;
      state.lockedUntil = 0;
    }

    if (state.attempts === 0) {
      state.firstAttemptAt = now;
    }

    state.attempts += 1;

    if (state.attempts >= MAX_ATTEMPTS) {
      state.lockedUntil = now + LOCKOUT_DURATION_MS;
    }

    saveRateLimitState(state);
    return {
      attempts: state.attempts,
      maxAttempts: MAX_ATTEMPTS,
      lockedUntil: state.lockedUntil,
      remaining: Math.max(0, MAX_ATTEMPTS - state.attempts)
    };
  }

  function resetRateLimit() {
    try {
      localStorage.removeItem(RATE_LIMIT_KEY);
    } catch {
      /* noop */
    }
  }

  // ============================================================
  // Validation de la force du mot de passe
  // ============================================================
  function validatePasswordStrength(password) {
    const errors = [];
    if (!password || password.length < 8) {
      errors.push('Le mot de passe doit contenir au moins 8 caractères.');
    }
    if (password && !/[a-zA-Z]/.test(password)) {
      errors.push('Le mot de passe doit contenir au moins une lettre.');
    }
    if (password && !/[0-9]/.test(password)) {
      errors.push('Le mot de passe doit contenir au moins un chiffre.');
    }
    return {
      valid: errors.length === 0,
      errors,
      strength: computeStrength(password)
    };
  }

  function computeStrength(password) {
    if (!password) return { score: 0, label: 'Aucun' };
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;

    const labels = ['Très faible', 'Faible', 'Moyen', 'Bon', 'Fort', 'Très fort'];
    return { score, label: labels[Math.min(score, 5)] };
  }

  // ============================================================
  // Export du module
  // ============================================================
  global.DoxtehadCrypto = {
    createHash,
    verifyHash,
    validatePasswordStrength,
    computeStrength,
    isLegacyHash,
    legacyHash,
    isLockedOut,
    recordFailedAttempt,
    resetRateLimit,
    MAX_ATTEMPTS,
    LOCKOUT_DURATION_MS
  };
})(window);
