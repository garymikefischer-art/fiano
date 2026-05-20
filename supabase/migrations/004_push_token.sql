-- ============================================================================
-- 004_push_token.sql
-- ============================================================================
-- Datum:  2026-05-20
-- Phase:  D1 — Expo-Push-Token-Registrierung
-- ============================================================================
--
-- Speichert den Expo-Push-Token pro User. Der Mobile-Client schreibt ihn beim
-- Login (authStore -> syncPushToken) in die eigene profiles-Zeile; ein
-- spaeterer Server-Push-Pfad liest ihn von dort.
--
-- RLS: keine neue Policy noetig — die bestehende "update own profile"-Policy
-- (001_rls_baseline: FOR UPDATE, auth.uid() = id) deckt den Write ab,
-- GRANT UPDATE ON public.profiles TO authenticated ist ebenfalls schon gesetzt.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS expo_push_token text;
