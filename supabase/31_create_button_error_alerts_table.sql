-- ==============================================================================
-- WASEET PLATFORM - MIGRATION 31: BUTTON ERROR INCIDENTS & SELF-REPORTING LOG
-- Location: D:\waseet-app\supabase\31_create_button_error_alerts_table.sql
-- Desktop Backup: D:\H P\سطح المكتب 2\31_CREATE_BUTTON_ERROR_ALERTS_TABLE.sql
--
-- Partners: AntiGravity (Lead AI) & OpenCode (First Assistant)
-- Purpose: Logs broken button incidents, z-index overlaps, and console exceptions
--          with granular payload data and status tracking for immediate agent hotfix.
-- ==============================================================================

-- 1. Create incidents table
CREATE TABLE IF NOT EXISTS public.button_error_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_url TEXT NOT NULL,
    page_pathname TEXT,
    page_title TEXT,
    selector TEXT NOT NULL,
    button_id TEXT,
    button_class TEXT,
    button_text TEXT,
    failure_code TEXT NOT NULL,
    failure_title TEXT,
    detailed_reason TEXT NOT NULL,
    blocking_element JSONB,
    runtime_error JSONB,
    agent_dispatch JSONB,
    environment TEXT DEFAULT 'development',
    status TEXT DEFAULT 'pending_hotfix' CHECK (status IN ('pending_hotfix', 'investigating', 'resolved', 'ignored')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT
);

-- 2. Index for rapid querying by status and page
CREATE INDEX IF NOT EXISTS idx_button_incidents_status ON public.button_error_incidents(status);
CREATE INDEX IF NOT EXISTS idx_button_incidents_page ON public.button_error_incidents(page_url);
CREATE INDEX IF NOT EXISTS idx_button_incidents_created_at ON public.button_error_incidents(created_at DESC);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.button_error_incidents ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
-- Allow anyone (including anonymous clients / automated tests) to report broken buttons
DROP POLICY IF EXISTS "Allow anonymous and authenticated insert of button incidents" ON public.button_error_incidents;
CREATE POLICY "Allow anonymous and authenticated insert of button incidents"
ON public.button_error_incidents
FOR INSERT
TO public, anon, authenticated
WITH CHECK (true);

-- Allow reading incidents for authenticated users (moderators / admins)
DROP POLICY IF EXISTS "Allow authenticated read of button incidents" ON public.button_error_incidents;
CREATE POLICY "Allow authenticated read of button incidents"
ON public.button_error_incidents
FOR SELECT
TO authenticated
USING (true);

-- Allow updating status (e.g., mark as resolved)
DROP POLICY IF EXISTS "Allow authenticated update of button incidents" ON public.button_error_incidents;
CREATE POLICY "Allow authenticated update of button incidents"
ON public.button_error_incidents
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Comment
COMMENT ON TABLE public.button_error_incidents IS 'Real-time telemetry and error logging for broken buttons and z-index collisions detected by Waseet Self-Reporting Sentinel.';
