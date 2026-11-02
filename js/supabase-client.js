/**
 * DOXTEHAD Budget PWA — Client Supabase
 * Connexion au projet ticglpmrwjpmvlqfteuu
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = (typeof import.meta !== 'undefined' && import.meta.env)
  ? import.meta.env.VITE_SUPABASE_URL
  : document.currentScript?.dataset?.url
    ? document.currentScript.dataset.url
    : 'https://ticglpmrwjpmvlqfteuu.supabase.co';
const SUPABASE_ANON_KEY = (typeof import.meta !== 'undefined' && import.meta.env)
  ? import.meta.env.VITE_SUPABASE_ANON_KEY
  : document.currentScript?.dataset?.key
    ? document.currentScript.dataset.key
    : 'sb_publishable_9ihKn4enPO4btff0YqPr7g_kryCGvhr';

/**
 * Client Supabase principal (avec RLS — permissions par utilisateur)
 * à utiliser dans l'application.
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
  db: {
    schema: 'public',
  },
});

/**
 * Client service_role (admin, contourne le RLS)
 * À utiliser UNIQUEMENT côté serveur ou dans les scripts de migration.
 * JAMAIS dans le code JavaScript de l'interface.
 */
export const createAdminClient = () => {
  const serviceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error(
      'VITE_SUPABASE_SERVICE_ROLE_KEY n\'est pas défini. Ne jamais l\'exposer dans le frontend.'
    );
  }
  return createClient(SUPABASE_URL, serviceKey, {
    db: { schema: 'public' },
  });
};

/**
 * Vérifie la connexion au projet Supabase.
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export const checkConnection = async () => {
  try {
    const { data, error } = await supabase.from('operations').select('id', { count: 'exact' }).limit(0);
    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
};

/**
 * Obtient l'utilisateur authentifié actuel.
 */
export const getCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
};

/**
 * S'abonner aux changements en temps réel (optionnel, pour sync push).
 */
export const subscribeToChannel = (table, callback) => {
  return supabase
    .channel('db-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table }, callback)
    .subscribe();
};

export default supabase;
