-- ============================================================
-- DOXTEHAD Budget PWA — Schéma Supabase
-- Version : 1.0.0
-- Date : 2026-11-02
-- Audit sécurité : intégration des corrections Agent 2 (Kimi K3)
-- ============================================================

-- Extensions nécessaires
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLE : user_profiles
-- Extension de auth.users (gérée par Supabase Auth)
-- Correctif CRITIQUE-02 : email retiré (dupliqué de auth.users)
-- ============================================================
CREATE TABLE public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT CHECK (char_length(full_name) <= 100),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'EUR', 'XOF', 'CAD', 'GBP')),
  locale TEXT NOT NULL DEFAULT 'fr-FR' CHECK (locale IN ('fr-FR', 'en-US', 'en-GB')),
  budget_rules JSONB NOT NULL DEFAULT '{"depensesMax":75,"projetsMax":15,"epargneMin":10}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Validation structure budget_rules (MINEUR-01)
  CONSTRAINT budget_rules_valid CHECK (
    (budget_rules->>'depensesMax')::numeric BETWEEN 0 AND 100 AND
    (budget_rules->>'projetsMax')::numeric BETWEEN 0 AND 100 AND
    (budget_rules->>'epargneMin')::numeric BETWEEN 0 AND 100 AND
    (budget_rules->>'depensesMax')::numeric +
    (budget_rules->>'projetsMax')::numeric +
    (budget_rules->>'epargneMin')::numeric = 100
  )
);

-- ============================================================
-- TABLE : operations
-- ============================================================
CREATE TABLE public.operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('Revenu', 'Dépense', 'Projet', 'Épargne')),
  category TEXT NOT NULL CHECK (char_length(category) BETWEEN 1 AND 100),
  description TEXT CHECK (char_length(description) <= 500),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  date DATE NOT NULL,

  -- Traçabilité sync offline (Agent 4)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  device_id TEXT,
  sync_version INTEGER NOT NULL DEFAULT 1,

  -- Validation date (MINEUR-04)
  CONSTRAINT date_reasonable CHECK (date BETWEEN '2000-01-01' AND '2100-12-31')
);

-- ============================================================
-- TABLE : projects
-- ============================================================
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  category TEXT NOT NULL CHECK (category IN ('Investissement', 'Immobilier', 'Équipement', 'Réserve', 'Autre')),
  priority TEXT NOT NULL DEFAULT 'Moyenne' CHECK (priority IN ('Haute', 'Moyenne', 'Basse')),
  target NUMERIC(12,2) NOT NULL CHECK (target > 0),
  saved NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (saved >= 0),
  deadline DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'En cours' CHECK (status IN ('En cours', 'En pause', 'Atteint')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  device_id TEXT,
  sync_version INTEGER NOT NULL DEFAULT 1,

  -- Correctif MINEUR-03 : saved <= target
  CONSTRAINT saved_lte_target CHECK (saved <= target),
  CONSTRAINT deadline_reasonable CHECK (deadline BETWEEN '2000-01-01' AND '2100-12-31')
);

-- ============================================================
-- INDEX DE PERFORMANCE
-- ============================================================
CREATE INDEX idx_operations_user_date ON public.operations(user_id, date DESC);
CREATE INDEX idx_operations_user_type ON public.operations(user_id, type);
CREATE INDEX idx_projects_user_status ON public.projects(user_id, status);
CREATE INDEX idx_projects_user_deadline ON public.projects(user_id, deadline);

-- ============================================================
-- TRIGGER : updated_at automatique
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.sync_version = COALESCE(OLD.sync_version, 1) + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER set_operations_updated_at
  BEFORE UPDATE ON public.operations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- TRIGGER : création automatique du profil à l'inscription
-- Correctif CRITIQUE-01 (profile_insert manquant)
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- --- user_profiles ---
CREATE POLICY "profile_select_own"
  ON public.user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profile_insert_own"
  ON public.user_profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profile_update_own"
  ON public.user_profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profile_delete_own"
  ON public.user_profiles FOR DELETE
  USING (auth.uid() = id);

-- --- operations ---
CREATE POLICY "operations_select_own"
  ON public.operations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "operations_insert_own"
  ON public.operations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "operations_update_own"
  ON public.operations FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "operations_delete_own"
  ON public.operations FOR DELETE
  USING (auth.uid() = user_id);

-- --- projects ---
CREATE POLICY "projects_select_own"
  ON public.projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "projects_insert_own"
  ON public.projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "projects_update_own"
  ON public.projects FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "projects_delete_own"
  ON public.projects FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- FONCTION : suppression complète du compte utilisateur (RGPD)
-- ============================================================
CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Supprime auth.users → cascade vers user_profiles, operations, projects
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.delete_own_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;

-- ============================================================
-- VUE : profil avec email (message MINEUR-02)
-- ============================================================
CREATE OR REPLACE VIEW public.user_profiles_with_email
WITH (security_invoker = true)
AS
SELECT
  up.id,
  au.email,
  up.full_name,
  up.currency,
  up.locale,
  up.budget_rules,
  up.created_at,
  up.updated_at
FROM public.user_profiles up
JOIN auth.users au ON au.id = up.id
WHERE auth.uid() = up.id;

-- ============================================================
-- STATISTIQUES : fonction d'agrégation pour le dashboard
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_budget_summary(p_year INT DEFAULT NULL, p_month INT DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  result JSON;
BEGIN
  WITH filtered AS (
    SELECT *
    FROM public.operations
    WHERE auth.uid() = user_id
      AND (p_year IS NULL OR EXTRACT(YEAR FROM date) = p_year)
      AND (p_month IS NULL OR EXTRACT(MONTH FROM date) = p_month)
  )
  SELECT json_build_object(
    'revenus',   COALESCE(SUM(amount) FILTER (WHERE type = 'Revenu'), 0),
    'depenses',  COALESCE(SUM(amount) FILTER (WHERE type = 'Dépense'), 0),
    'projets',   COALESCE(SUM(amount) FILTER (WHERE type = 'Projet'), 0),
    'epargne',   COALESCE(SUM(amount) FILTER (WHERE type = 'Épargne'), 0),
    'count',     COUNT(*)
  ) INTO result
  FROM filtered;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_budget_summary(INT, INT) TO authenticated;

-- ============================================================
-- FIN DU SCHÉMA
-- ============================================================
COMMENT ON TABLE public.operations IS 'Opérations budgétaires isolées par utilisateur via RLS';
COMMENT ON TABLE public.projects IS 'Projets SMART isolés par utilisateur via RLS';
COMMENT ON TABLE public.user_profiles IS 'Profils utilisateurs, email récupéré via auth.users';
COMMENT ON FUNCTION public.delete_own_account() IS 'Suppression RGPD — efface le compte et toutes les données';