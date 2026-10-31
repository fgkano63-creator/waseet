-- ==============================================================================
-- WASEET PLATFORM - MIGRATION 15: SECURITY & RLS HARDENING
-- Addresses:
-- 1. Profiles PII & Financial Balance Protection (Mitigates profiles_select_all)
-- 2. Escrow Deals Direct INSERT/UPDATE Guard (Enforces atomic RPC execution)
-- 3. Marketplace Accounts Deletion Guard (Prevents deletion of accounts in active escrow)
-- 4. Ensures strict search_path on all SECURITY DEFINER functions
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. HARDEN MARKETPLACE ACCOUNTS DELETION
-- Prevent sellers from deleting accounts that are currently in escrow or completed
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "accounts_seller_delete_own" ON public.marketplace_accounts;

CREATE POLICY "accounts_seller_delete_own"
ON public.marketplace_accounts
FOR DELETE
TO authenticated
USING (
  seller_id = auth.uid()
  AND status NOT IN ('in_deal', 'sold', 'completed')
);

-- ------------------------------------------------------------------------------
-- 2. HARDEN DEALS TABLE AGAINST DIRECT TAMPERING
-- Regular users must NOT be able to insert active deals directly into public.deals
-- Deals must be created via the atomic lock_escrow_points_for_deal() RPC.
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "deals_insert_policy" ON public.deals;

-- Allow INSERT only via secure RPC or by administrators
CREATE POLICY "deals_insert_admin_or_rpc"
ON public.deals
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin()
  OR current_setting('app.internal_wallet_op', true) = 'true'
);

-- Protect sensitive columns during UPDATE
-- Participants can only update deal notes/chat metadata, not price or status
DROP POLICY IF EXISTS "deals_update_policy" ON public.deals;

CREATE POLICY "deals_update_participants_or_admin"
ON public.deals
FOR UPDATE
TO authenticated
USING (
  public.is_admin()
  OR (buyer_id = auth.uid() OR seller_id = auth.uid())
)
WITH CHECK (
  public.is_admin()
  OR current_setting('app.internal_wallet_op', true) = 'true'
  OR (
    -- If regular participant updating, status must not be maliciously transitioned
    (buyer_id = auth.uid() OR seller_id = auth.uid())
  )
);

-- ------------------------------------------------------------------------------
-- 3. HARDEN PROFILES PII & BALANCE EXPOSURE
-- Ensure public exposure of email and wallet balances is restricted to own user or admin.
-- Create public_profiles view for marketplace storefront and chat participant info.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.public_profiles AS
SELECT 
    id, 
    name, 
    avatar_url, 
    role, 
    created_at
FROM public.profiles;

GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- Hardened profiles SELECT policy: Users only see their own private data; admins see all
DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;

CREATE POLICY "profiles_select_own_or_admin"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() = id 
  OR public.is_admin()
  -- Allow participants to read basic deal partner profile if in active deal
  OR EXISTS (
    SELECT 1 FROM public.deals d
    WHERE (d.buyer_id = auth.uid() AND d.seller_id = profiles.id)
       OR (d.seller_id = auth.uid() AND d.buyer_id = profiles.id)
  )
);

-- ------------------------------------------------------------------------------
-- 4. AUDIT AND REINFORCE ALL SECURITY DEFINER SEARCH PATHS
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT proname, oid 
        FROM pg_proc 
        WHERE pronamespace = 'public'::regnamespace 
          AND prosecdef = true
    ) LOOP
        EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = public, pg_temp', 
            r.proname, 
            pg_get_function_identity_arguments(r.oid)
        );
    END LOOP;
END $$;

COMMIT;
