import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const storageSrc = readFileSync(resolve(__dirname, '../../js/storage.js'), 'utf8');
const cryptoSrc = readFileSync(resolve(__dirname, '../../js/crypto.js'), 'utf8');

describe('DoxtehadStorage — validation import JSON', () => {
  let DoxtehadStorage;

  beforeEach(() => {
    const fakeWindow = {};
    const fn = new Function(
      'window',
      'localStorage',
      'console',
      storageSrc + '\nreturn window.DoxtehadStorage;'
    );
    const fakeLocalStorage = {
      _data: {},
      getItem(k) {
        return this._data[k] ?? null;
      },
      setItem(k, v) {
        this._data[k] = v;
      },
      removeItem(k) {
        delete this._data[k];
      },
    };
    DoxtehadStorage = fn(fakeWindow, fakeLocalStorage, console);
  });

  it('rejette un objet null', () => {
    const r = DoxtehadStorage.validateImportedState(null);
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('rejette des operations non-array', () => {
    const r = DoxtehadStorage.validateImportedState({ operations: 'x', projects: [] });
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/operations/);
  });

  it("rejette un type d'opération inconnu", () => {
    const r = DoxtehadStorage.validateImportedState({
      operations: [{ id: 'a', type: 'Hack', amount: 10, date: '2026-01-01' }],
      projects: [],
    });
    expect(r.valid).toBe(false);
  });

  it('rejette un montant négatif', () => {
    const r = DoxtehadStorage.validateImportedState({
      operations: [{ id: 'a', type: 'Revenu', amount: -5, date: '2026-01-01' }],
      projects: [],
    });
    expect(r.valid).toBe(false);
  });

  it('rejette une date invalide', () => {
    const r = DoxtehadStorage.validateImportedState({
      operations: [{ id: 'a', type: 'Revenu', amount: 5, date: '01/01/2026' }],
      projects: [],
    });
    expect(r.valid).toBe(false);
  });

  it('accepte un état valide', () => {
    const r = DoxtehadStorage.validateImportedState({
      operations: [
        { id: 'a', type: 'Revenu', category: 'Salaire', amount: 100, date: '2026-01-01' },
      ],
      projects: [{ id: 'p', title: 'Projet', target: 1000, saved: 0, deadline: '2026-12-01' }],
    });
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('exportToJSON exclut le hash par défaut', () => {
    const state = {
      operations: [],
      projects: [],
      adminPasswordHash: 'pbkdf2$100000$abc$def',
      passwordSetDate: '2026-01-01',
      settings: {},
    };
    const json = DoxtehadStorage.exportToJSON(state, false);
    expect(json).not.toContain('pbkdf2$');
    expect(json).not.toContain('adminPasswordHash');
  });

  it('exportToJSON inclut le hash si demandé explicitement', () => {
    const state = {
      operations: [],
      projects: [],
      adminPasswordHash: 'pbkdf2$100000$abc$def',
      passwordSetDate: '2026-01-01',
      settings: {},
    };
    const json = DoxtehadStorage.exportToJSON(state, true);
    expect(json).toContain('pbkdf2$');
  });

  it('exportOperationsCSV produit un BOM UTF-8 et un en-tête', () => {
    const csv = DoxtehadStorage.exportOperationsCSV([
      {
        date: '2026-01-01',
        type: 'Revenu',
        category: 'Salaire',
        description: 'Janvier',
        amount: 500,
      },
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('Date;Type;Catégorie;Description;Montant');
    expect(csv).toContain('500');
  });

  it('exportOperationsCSV échappe les guillemets', () => {
    const csv = DoxtehadStorage.exportOperationsCSV([
      { date: '2026-01-01', type: 'Dépense', category: 'A"B', description: '', amount: 10 },
    ]);
    expect(csv).toContain('"A""B"');
  });
});

describe('DoxtehadCrypto — hash et vérification', () => {
  let DoxtehadCrypto;

  beforeEach(() => {
    const fakeWindow = {};
    const fakeLocalStorage = {
      _data: {},
      getItem(k) {
        return this._data[k] ?? null;
      },
      setItem(k, v) {
        this._data[k] = v;
      },
      removeItem(k) {
        delete this._data[k];
      },
    };

    // crypto.js est désormais un module ES : on convertit l'export default en global
    // pour conserver la mécanique d'injection du test.
    const wrappedSrc = cryptoSrc.replace(
      /export\s+default\s+\{/,
      'window.DoxtehadCrypto = {'
    );
    const fn = new Function(
      'window',
      'localStorage',
      'crypto',
      'TextEncoder',
      'console',
      wrappedSrc + '\nreturn window.DoxtehadCrypto;'
    );
    DoxtehadCrypto = fn(
      fakeWindow,
      fakeLocalStorage,
      globalThis.crypto,
      globalThis.TextEncoder,
      console
    );
  });

  it('détecte un ancien hash simpleHash', () => {
    expect(DoxtehadCrypto.isLegacyHash('12345')).toBe(true);
    expect(DoxtehadCrypto.isLegacyHash('-98765')).toBe(true);
  });

  it('ne confond pas un hash PBKDF2 avec un legacy', () => {
    expect(DoxtehadCrypto.isLegacyHash('pbkdf2$100000$aa$bb')).toBe(false);
  });

  it("legacyHash reproduit l'algorithme original", () => {
    // Valeur vérifiée par exécution de l'algorithme original
    const h = DoxtehadCrypto.legacyHash('test');
    expect(h).toBe('3556498');
  });

  it('createHash produit le format pbkdf2$iterations$salt$hash', async () => {
    const hash = await DoxtehadCrypto.createHash('MonMotDePasse123');
    const parts = hash.split('$');
    expect(parts.length).toBe(4);
    expect(parts[0]).toBe('pbkdf2');
    expect(parseInt(parts[1], 10)).toBeGreaterThanOrEqual(100000);
    expect(parts[2]).toMatch(/^[0-9a-f]{32}$/); // 16 octets = 32 hex
    expect(parts[3]).toMatch(/^[0-9a-f]{64}$/); // 256 bits = 64 hex
  });

  it('createHash génère un sel différent à chaque appel', async () => {
    const a = await DoxtehadCrypto.createHash('same');
    const b = await DoxtehadCrypto.createHash('same');
    expect(a).not.toBe(b);
  });

  it('verifyHash accepte le bon mot de passe', async () => {
    const hash = await DoxtehadCrypto.createHash('Secret123!');
    const r = await DoxtehadCrypto.verifyHash('Secret123!', hash);
    expect(r.valid).toBe(true);
    expect(r.needsMigration).toBe(false);
  });

  it('verifyHash rejette un mauvais mot de passe', async () => {
    const hash = await DoxtehadCrypto.createHash('Secret123!');
    const r = await DoxtehadCrypto.verifyHash('Wrong', hash);
    expect(r.valid).toBe(false);
  });

  it('verifyHash détecte la migration legacy nécessaire', async () => {
    const legacy = DoxtehadCrypto.legacyHash('oldpass');
    const r = await DoxtehadCrypto.verifyHash('oldpass', legacy);
    expect(r.valid).toBe(true);
    expect(r.needsMigration).toBe(true);
  });

  it('verifyHash rejette un format inconnu', async () => {
    const r = await DoxtehadCrypto.verifyHash('x', 'garbage');
    expect(r.valid).toBe(false);
  });

  it('validatePasswordStrength rejette moins de 8 caractères', () => {
    const r = DoxtehadCrypto.validatePasswordStrength('abc1');
    expect(r.valid).toBe(false);
  });

  it('validatePasswordStrength exige une lettre et un chiffre', () => {
    expect(DoxtehadCrypto.validatePasswordStrength('12345678').valid).toBe(false);
    expect(DoxtehadCrypto.validatePasswordStrength('abcdefgh').valid).toBe(false);
    expect(DoxtehadCrypto.validatePasswordStrength('abcd1234').valid).toBe(true);
  });

  it('rate limiting bloque après MAX_ATTEMPTS', () => {
    for (let i = 0; i < DoxtehadCrypto.MAX_ATTEMPTS; i++) {
      DoxtehadCrypto.recordFailedAttempt();
    }
    const lock = DoxtehadCrypto.isLockedOut();
    expect(lock.locked).toBe(true);
    expect(lock.remainingSeconds).toBeGreaterThan(0);
  });

  it('resetRateLimit débloque', () => {
    for (let i = 0; i < DoxtehadCrypto.MAX_ATTEMPTS; i++) {
      DoxtehadCrypto.recordFailedAttempt();
    }
    DoxtehadCrypto.resetRateLimit();
    expect(DoxtehadCrypto.isLockedOut().locked).toBe(false);
  });
});
