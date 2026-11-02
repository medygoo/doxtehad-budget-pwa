/**
 * DOXTEHAD Budget PWA — Authentification Supabase
 * Gère l'inscription, la connexion et la session avec Supabase Auth
 */

import { supabase, createAdminClient } from './supabase-client.js';
import { TABLES } from './db.js';

/**
 * Initialise l'écoute des changements de session (auth state change).
 * @param {Function} onSessionChanged Callback appelé quand la session change.
 */
export const initializeAuth = (onSessionChanged) => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
    console.log('[Auth] Événement:', event, session?.user?.email);
    if (typeof onSessionChanged === 'function') {
      try {
        await onSessionChanged(event, session);
      } catch (err) {
        console.error('[Auth] Erreur callback onSessionChanged:', err);
      }
    }
  });
  return subscription;
};

/**
 * Vérifie s'il existe une session active.
 */
export const hasSession = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return !!session;
};

/**
 * Obtenir l'utilisateur connecté.
 */
export const getCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
};

/**
 * Inscription avec email + mot de passe.
 * Crée le profil utilisateur dans user_profiles.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ user, error }>}
 */
export const signup = async (email, password) => {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: email.split('@')[0],
        },
      },
    });
    if (error) throw error;

    // Créer le profil utilisateur
    if (data.user) {
      await createProfile(data.user.id);
      console.log('[Auth] Profil créé pour', data.user.id);
    }
    return { user: data.user, error: null };
  } catch (err) {
    return { user: null, error: err.message };
  }
};

/**
 * Connexion avec email + mot de passe.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ session, error }>}
 */
export const signIn = async (email, password) => {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    console.log('[Auth] Connexion réussie pour', data.user?.email);
    return { session: data.session, error: null };
  } catch (err) {
    return { session: null, error: err.message };
  }
};

/**
 * Déconnexion.
 * @returns {Promise<{ error }>}
 */
export const signOut = async () => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    console.log('[Auth] Déconnexion réussie');
    return { error: null };
  } catch (err) {
    return { error: err.message };
  }
};

/**
 * Réinitialisation du mot de passe (récupération par email).
 * @param {string} email
 * @returns {Promise<{ error }>}
 */
export const resetPassword = async (email) => {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password',
    });
    if (error) throw error;
    console.log('[Auth] Email de réinitialisation envoyé à', email);
    return { error: null };
  } catch (err) {
    return { error: err.message };
  }
};

/**
 * Créer le profil utilisateur dans user_profiles.
 * @param {string} userId
 */
const createProfile = async (userId) => {
  const { error } = await supabase
    .from(TABLES.PROFILES)
    .insert({
      id: userId,
      full_name: '',
      currency: 'XOF',
      locale: 'fr-FR',
      budget_rules: { depensesMax: 75, projetsMax: 15, epargneMin: 10 },
    });
  if (error) throw error;
};

/**
 * Récupère le profil utilisateur.
 * @param {string} userId
 * @returns {Promise<{ profile, error }>}
 */
export const getProfile = async (userId) => {
  try {
    const { data, error } = await supabase
      .from(TABLES.PROFILES)
      .select('*')
      .eq('id', userId)
      .single();
    if (error) throw error;
    return { profile: data, error: null };
  } catch (err) {
    return { profile: null, error: err.message };
  }
};

/**
 * Met à jour le profil utilisateur.
 * @param {string} userId
 * @param {Object} updates
 * @returns {Promise<{ profile, error }>}
 */
export const updateProfile = async (userId, updates) => {
  try {
    const { data, error } = await supabase
      .from(TABLES.PROFILES)
      .update(updates)
      .eq('id', userId)
      .select()
      .single();
    if (error) throw error;
    return { profile: data, error: null };
  } catch (err) {
    return { profile: null, error: err.message };
  }
};

/**
 * Migration d'un compte local (mot de passe hashé localStorage) vers Supabase Auth.
 * Utilise le client admin côté serveur ou script.
 * @param {string} adminPasswordHash Le hash du mot de passe local
 * @param {string} email Nouvel email à associer
 */
export const migrateLocalAccount = async (adminPasswordHash, email) => {
  // Nécessite le client admin (côté serveur ou script de migration)
  const admin = createAdminClient();
  try {
    // Créer le compte Supabase
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: 'temporary-' + Math.random().toString(36).slice(2),
      email_confirm: true,
      user_metadata: { full_name: email.split('@')[0] },
    });
    if (error) throw error;

    // Créer le profil avec le hash migré (pour le déverrouillage local)
    await createProfile(data.user.id);

    console.log('[Auth] Compte migré:', data.user.id);
    return { userId: data.user.id, error: null };
  } catch (err) {
    return { userId: null, error: err.message };
  }
};

export default {
  initializeAuth,
  hasSession,
  getCurrentUser,
  signup,
  signIn,
  signOut,
  resetPassword,
  getProfile,
  updateProfile,
  migrateLocalAccount,
};
