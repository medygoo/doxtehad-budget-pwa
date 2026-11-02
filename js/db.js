/**
 * DOXTEHAD Budget PWA — Couche de données unifiée
 * Synchronise automatiquement entre Supabase (cloud) et localStorage (offline cache)
 */

import { supabase, getCurrentUser } from './supabase-client.js';

const STORAGE_KEY = 'doxtehad_offline_cache';

/**
 * Obtient la liste des tables supportées.
 */
export const TABLES = {
  PROFILES: 'user_profiles',
  OPERATIONS: 'operations',
  PROJECTS: 'projects',
};

/**
 * Vérifie si une opération de lecture/écriture doit aller vers le cloud.
 * Le cache offline est utilisé en priorité quand le réseau est absent.
 */
export const isOnline = () => navigator.onLine;

/**
 * Charge le cache offline depuis localStorage.
 */
export const loadOfflineCache = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { operations: [], projects: [], updatedAt: null };
  } catch {
    return { operations: [], projects: [], updatedAt: null };
  }
};

/**
 * Sauvegarde le cache offline dans localStorage.
 */
export const saveOfflineCache = (cache) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.warn('Cache offline non sauvegardé (localStorage plein?)', e);
  }
};

/**
 * Sauvegarde un snapshot local d'une opération (pour récupération après reconnexion).
 */
export const saveOperationSnapshot = (op) => {
  const cache = loadOfflineCache();
  cache.operations.push({ ...op, snapshot: true, syncedAt: null });
  cache.updatedAt = Date.now();
  saveOfflineCache(cache);
};

/**
 * Sauvegarde un snapshot local d'un projet.
 */
export const saveProjectSnapshot = (project) => {
  const cache = loadOfflineCache();
  cache.projects.push({ ...project, snapshot: true, syncedAt: null });
  cache.updatedAt = Date.now();
  saveOfflineCache(cache);
};

/**
 * Récupère toutes les opérations (cache + cloud).
 */
export const getOperations = async (options = {}) => {
  const { forceCloud = false } = options;

  if (isOnline() && !forceCloud) {
    try {
      const userId = await getCurrentUser();
      const { data, error } = await supabase
        .from(TABLES.OPERATIONS)
        .select('*')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;

      const cache = loadOfflineCache();
      cache.operations = data.map((op) => ({ ...op, synced: true }));
      cache.updatedAt = Date.now();
      saveOfflineCache(cache);
      return data;
    } catch (err) {
      console.warn('Lecture cloud échouée, utilisation du cache offline', err.message);
    }
  }

  const cache = loadOfflineCache();
  return cache.operations.filter((op) => !op.snapshot);
};

/**
 * Récupère une opération par ID.
 */
export const getOperation = async (id) => {
  const ops = await getOperations();
  return ops.find((op) => op.id === id) || null;
};

/**
 * Ajoute une opération.
 */
export const createOperation = async (operation) => {
  const userId = await getCurrentUser();
  const newOp = {
    user_id: userId.id,
    type: operation.type,
    category: operation.category,
    description: operation.description || '',
    amount: operation.amount,
    date: operation.date,
    device_id: 'web',
    sync_version: 1,
  };

  if (isOnline()) {
    try {
      const { data, error } = await supabase
        .from(TABLES.OPERATIONS)
        .insert(newOp)
        .select()
        .single();
      if (error) throw error;
      saveOfflineCache({ ...loadOfflineCache(), operations: [], updatedAt: Date.now() });
      return data;
    } catch (err) {
      console.warn('Insertion cloud échouée, mise en cache locale', err.message);
    }
  }

  saveOperationSnapshot(newOp);
  return newOp;
};

/**
 * Met à jour une opération.
 */
export const updateOperation = async (id, updates) => {
  const userId = await getCurrentUser();
  const update = { updated_at: new Date().toISOString(), ...updates };

  if (isOnline()) {
    try {
      const { data, error } = await supabase
        .from(TABLES.OPERATIONS)
        .update(update)
        .eq('id', id)
        .eq('user_id', userId.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (err) {
      console.warn('Mise à jour cloud échouée, mise en cache locale', err.message);
    }
  }

  saveOperationSnapshot({ id, ...updates, user_id: userId.id });
  return { id, ...updates };
};

/**
 * Supprime une opération.
 */
export const deleteOperation = async (id) => {
  const userId = await getCurrentUser();

  if (isOnline()) {
    try {
      const { error } = await supabase
        .from(TABLES.OPERATIONS)
        .delete()
        .eq('id', id)
        .eq('user_id', userId.id);
      if (error) throw error;
      return true;
    } catch (err) {
      console.warn('Suppression cloud échouée, mise en cache locale', err.message);
    }
  }

  saveOperationSnapshot({ id, deleted: true });
  return true;
};

/**
 * Récupère tous les projets.
 */
export const getProjects = async (options = {}) => {
  const { forceCloud = false } = options;

  if (isOnline() && !forceCloud) {
    try {
      const userId = await getCurrentUser();
      const { data, error } = await supabase
        .from(TABLES.PROJECTS)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const cache = loadOfflineCache();
      cache.projects = data.map((p) => ({ ...p, synced: true }));
      cache.updatedAt = Date.now();
      saveOfflineCache(cache);
      return data;
    } catch (err) {
      console.warn('Lecture cloud échouée, utilisation du cache offline', err.message);
    }
  }

  const cache = loadOfflineCache();
  return cache.projects.filter((p) => !p.snapshot);
};

/**
 * Récupère un projet par ID.
 */
export const getProject = async (id) => {
  const projects = await getProjects();
  return projects.find((p) => p.id === id) || null;
};

/**
 * Ajoute un projet.
 */
export const createProject = async (project) => {
  const userId = await getCurrentUser();
  const newProject = {
    user_id: userId.id,
    title: project.title,
    category: project.category,
    priority: project.priority || 'Moyenne',
    target: project.target,
    saved: project.saved || 0,
    deadline: project.deadline,
    status: project.status || 'En cours',
    device_id: 'web',
    sync_version: 1,
  };

  if (isOnline()) {
    try {
      const { data, error } = await supabase
        .from(TABLES.PROJECTS)
        .insert(newProject)
        .select()
        .single();
      if (error) throw error;
      saveOfflineCache({ ...loadOfflineCache(), projects: [], updatedAt: Date.now() });
      return data;
    } catch (err) {
      console.warn('Insertion cloud échouée, mise en cache locale', err.message);
    }
  }

  saveProjectSnapshot(newProject);
  return newProject;
};

/**
 * Met à jour un projet.
 */
export const updateProject = async (id, updates) => {
  const userId = await getCurrentUser();
  const update = { updated_at: new Date().toISOString(), ...updates };

  if (isOnline()) {
    try {
      const { data, error } = await supabase
        .from(TABLES.PROJECTS)
        .update(update)
        .eq('id', id)
        .eq('user_id', userId.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (err) {
      console.warn('Mise à jour cloud échouée, mise en cache locale', err.message);
    }
  }

  saveProjectSnapshot({ id, ...updates, user_id: userId.id });
  return { id, ...updates };
};

/**
 * Supprime un projet.
 */
export const deleteProject = async (id) => {
  const userId = await getCurrentUser();

  if (isOnline()) {
    try {
      const { error } = await supabase
        .from(TABLES.PROJECTS)
        .delete()
        .eq('id', id)
        .eq('user_id', userId.id);
      if (error) throw error;
      return true;
    } catch (err) {
      console.warn('Suppression cloud échouée, mise en cache locale', err.message);
    }
  }

  saveProjectSnapshot({ id, deleted: true });
  return true;
};

/**
 * Obtient les statistiques (sommes par type d'opération).
 */
export const getSummary = async () => {
  const ops = await getOperations();
  const summary = {
    revenus: 0,
    depenses: 0,
    projets: 0,
    epargne: 0,
  };
  ops.forEach((op) => {
    summary[op.type] = (summary[op.type] || 0) + Number(op.amount);
  });
  return summary;
};

/**
 * Obtient les seuils de la règle 75/15/10 à partir du profil utilisateur.
 */
export const getBudgetRules = async () => {
  const userId = await getCurrentUser();
  const { data } = await supabase
    .from(TABLES.PROFILES)
    .select('budget_rules')
    .eq('id', userId.id)
    .single();
  return data?.budget_rules || { depensesMax: 75, projetsMax: 15, epargneMin: 10 };
};

/**
 * Sauvegarde le profil utilisateur dans le cloud.
 */
export const saveUserProfile = async (profile) => {
  const userId = await getCurrentUser();
  const { data, error } = await supabase
    .from(TABLES.PROFILES)
    .upsert({ id: userId.id, ...profile })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export default {
  TABLES,
  isOnline,
  loadOfflineCache,
  saveOfflineCache,
  getOperations,
  getOperation,
  createOperation,
  updateOperation,
  deleteOperation,
  getProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  getSummary,
  getBudgetRules,
  saveUserProfile,
};
