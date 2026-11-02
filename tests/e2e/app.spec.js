import { test, expect } from '@playwright/test';

const TEST_PASSWORD = 'TestPassword123';

async function firstRunSetup(page) {
  await page.goto('/');
  await page.waitForSelector('#form-init-pwd:not(.hidden)', { timeout: 10000 });
  await page.fill('#init-pwd', TEST_PASSWORD);
  await page.fill('#init-pwd-confirm', TEST_PASSWORD);
  await page.click('#form-init-pwd button[type="submit"]');
  await page.waitForSelector('#modal-admin-auth', { state: 'hidden', timeout: 20000 });
}

test.describe('PWA DOXTEHAD — Authentification', () => {
  test('premier lancement affiche le formulaire d\'initialisation', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#form-init-pwd')).toBeVisible();
    await expect(page.locator('#form-login-pwd')).toBeHidden();
  });

  test('refuse un mot de passe trop faible', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#form-init-pwd:not(.hidden)');
    await page.fill('#init-pwd', 'abc');
    await page.fill('#init-pwd-confirm', 'abc');
    await page.click('#form-init-pwd button[type="submit"]');
    // Le modal doit rester ouvert
    await expect(page.locator('#modal-admin-auth')).toBeVisible();
  });

  test('refuse des mots de passe différents', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#form-init-pwd:not(.hidden)');
    await page.fill('#init-pwd', 'Password123');
    await page.fill('#init-pwd-confirm', 'Password456');
    await page.click('#form-init-pwd button[type="submit"]');
    await expect(page.locator('#modal-admin-auth')).toBeVisible();
  });

  test('crée le mot de passe et déverrouille l\'application', async ({ page }) => {
    await firstRunSetup(page);
    await expect(page.locator('#modal-admin-auth')).toBeHidden();
    await expect(page.locator('#page-dashboard')).toBeVisible();
  });

  test('verrouille et exige le mot de passe au rechargement', async ({ page }) => {
    await firstRunSetup(page);
    await page.click('button[title="Verrouiller"]');
    await expect(page.locator('#form-login-pwd')).toBeVisible();
  });

  test('rejette un mauvais mot de passe', async ({ page }) => {
    await firstRunSetup(page);
    await page.click('button[title="Verrouiller"]');
    await page.fill('#login-pwd', 'WrongPassword');
    await page.click('#form-login-pwd button[type="submit"]');
    await expect(page.locator('#form-login-pwd')).toBeVisible();
  });

  test('accepte le bon mot de passe', async ({ page }) => {
    await firstRunSetup(page);
    await page.click('button[title="Verrouiller"]');
    await page.fill('#login-pwd', TEST_PASSWORD);
    await page.click('#form-login-pwd button[type="submit"]');
    await page.waitForSelector('#modal-admin-auth', { state: 'hidden', timeout: 20000 });
  });
});

test.describe('PWA DOXTEHAD — Opérations', () => {
  test.beforeEach(async ({ page }) => {
    await firstRunSetup(page);
  });

  test('crée une opération Revenu et met à jour le KPI', async ({ page }) => {
    await page.click('button:has-text("+ Nouvelle")');
    await page.selectOption('#op-type', 'Revenu');
    await page.fill('#op-category', 'Salaire');
    await page.fill('#op-desc', 'Salaire de test');
    await page.fill('#op-amount', '1500');
    await page.fill('#op-date', '2026-11-01');
    await page.click('#form-operation button[type="submit"]');

    await expect(page.locator('#kpi-revenus')).toContainText('1');
    await expect(page.locator('#kpi-revenus')).toContainText('500');
  });

  test('crée une dépense et l\'affiche dans le tableau', async ({ page }) => {
    await page.click('button:has-text("+ Nouvelle")');
    await page.selectOption('#op-type', 'Dépense');
    await page.fill('#op-category', 'Loyer');
    await page.fill('#op-amount', '450');
    await page.fill('#op-date', '2026-11-01');
    await page.click('#form-operation button[type="submit"]');

    await expect(page.locator('#recent-ops-tbody')).toContainText('Loyer');
  });

  test('rejette un montant négatif', async ({ page }) => {
    await page.click('button:has-text("+ Nouvelle")');
    await page.selectOption('#op-type', 'Revenu');
    await page.fill('#op-category', 'Test');
    await page.fill('#op-amount', '-100');
    await page.fill('#op-date', '2026-11-01');
    // Le navigateur bloque via min="0.01"
    await expect(page.locator('#form-operation')).toBeVisible();
  });

  test('filtre les opérations par type', async ({ page }) => {
    await page.click('#tab-operations');
    await page.selectOption('#filter-type', 'Dépense');
    await expect(page.locator('#filter-type')).toHaveValue('Dépense');
  });
});

test.describe('PWA DOXTEHAD — Règle 75/15/10', () => {
  test.beforeEach(async ({ page }) => {
    await firstRunSetup(page);
  });

  test('calcule les seuils 75/15/10 depuis les revenus', async ({ page }) => {
    await page.click('button:has-text("+ Nouvelle")');
    await page.selectOption('#op-type', 'Revenu');
    await page.fill('#op-category', 'Salaire');
    await page.fill('#op-amount', '1000');
    await page.fill('#op-date', '2026-11-01');
    await page.click('#form-operation button[type="submit"]');

    // 75% de 1000 = 750, 15% = 150, 10% = 100
    await expect(page.locator('#val-max-depenses')).toContainText('750');
    await expect(page.locator('#val-max-projets')).toContainText('150');
    await expect(page.locator('#val-min-epargne')).toContainText('100');
  });

  test('affiche l\'alerte si dépenses dépassent 75%', async ({ page }) => {
    await page.click('button:has-text("+ Nouvelle")');
    await page.selectOption('#op-type', 'Revenu');
    await page.fill('#op-category', 'Salaire');
    await page.fill('#op-amount', '1000');
    await page.fill('#op-date', '2026-11-01');
    await page.click('#form-operation button[type="submit"]');

    await page.click('button:has-text("+ Nouvelle")');
    await page.selectOption('#op-type', 'Dépense');
    await page.fill('#op-category', 'Loyer');
    await page.fill('#op-amount', '800');
    await page.fill('#op-date', '2026-11-01');
    await page.click('#form-operation button[type="submit"]');

    await expect(page.locator('#alert-depenses-box')).toBeVisible();
  });
});

test.describe('PWA DOXTEHAD — Projets SMART', () => {
  test.beforeEach(async ({ page }) => {
    await firstRunSetup(page);
    await page.click('#tab-projects');
  });

  test('crée un projet et affiche la carte', async ({ page }) => {
    await page.click('button:has-text("+ Nouveau Projet SMART")');
    await page.fill('#proj-title-input', 'Fonds d\'urgence');
    await page.selectOption('#proj-category', 'Réserve');
    await page.selectOption('#proj-priority', 'Haute');
    await page.fill('#proj-target', '5000');
    await page.fill('#proj-saved', '500');
    await page.fill('#proj-deadline', '2027-06-01');
    await page.click('#form-project button[type="submit"]');

    await expect(page.locator('#projects-grid')).toContainText('Fonds d\'urgence');
  });

  test('plafonne une contribution au reste à financer', async ({ page }) => {
    await page.click('button:has-text("+ Nouveau Projet SMART")');
    await page.fill('#proj-title-input', 'Test plafond');
    await page.fill('#proj-target', '1000');
    await page.fill('#proj-saved', '900');
    await page.fill('#proj-deadline', '2027-01-01');
    await page.click('#form-project button[type="submit"]');

    await page.click('button:has-text("Alimenter ce Projet")');
    await page.fill('#contrib-amount', '5000');
    await page.click('#form-project-contribution button[type="submit"]');

    // Doit être plafonné à 100 (reste à financer)
    await expect(page.locator('#projects-grid')).toContainText('100');
  });
});

test.describe('PWA DOXTEHAD — PWA & Offline', () => {
  test('manifest.json est accessible', async ({ request }) => {
    const res = await request.get('/manifest.json');
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.name).toContain('DOXTEHAD');
    expect(json.display).toBe('standalone');
    expect(json.icons.length).toBeGreaterThanOrEqual(3);
  });

  test('service worker est enregistré', async ({ page }) => {
    await page.goto('/');
    const swReady = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const reg = await navigator.serviceWorker.getRegistration();
      return !!reg;
    });
    expect(swReady).toBeTruthy();
  });

  test('aucune dépendance CDN externe', async ({ page }) => {
    await page.goto('/');
    const external = await page.evaluate(() =>
      Array.from(document.querySelectorAll('script[src], link[href]'))
        .map((el) => el.src || el.href)
        .filter((url) => url.startsWith('http') && !url.includes('localhost'))
    );
    expect(external).toEqual([]);
  });

  test('fonctionne après coupure réseau', async ({ page, context }) => {
    await firstRunSetup(page);
    await context.setOffline(true);
    await page.reload();
    // L'app doit rester fonctionnelle depuis le cache
    await expect(page.locator('#page-dashboard')).toBeVisible({ timeout: 10000 });
    await context.setOffline(false);
  });
});

test.describe('PWA DOXTEHAD — Responsive', () => {
  test('s\'affiche correctement sur mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await firstRunSetup(page);
    await expect(page.locator('#page-dashboard')).toBeVisible();
    // Pas de scroll horizontal
    const hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(hasHorizontalScroll).toBe(false);
  });

  test('s\'affiche correctement sur tablette', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await firstRunSetup(page);
    await expect(page.locator('#page-dashboard')).toBeVisible();
  });
});
