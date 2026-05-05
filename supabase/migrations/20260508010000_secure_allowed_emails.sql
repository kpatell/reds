-- ============================================================
-- Migration: Secure allowed_emails table
-- ============================================================

-- Enable Row Level Security to prevent unauthorized read/write by anon users
ALTER TABLE public.allowed_emails ENABLE ROW LEVEL SECURITY;

-- No additional policies are created. 
-- By default, this denies all access to 'anon' and 'authenticated' roles.
-- Triggers or Edge Functions using SECURITY DEFINER will still have access via service_role.
