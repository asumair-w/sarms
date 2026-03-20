-- -----------------------------------------------------------------------------
-- SARMS – approve_task_complete (atomic close-out)
-- Run in Supabase SQL Editor after schema-consolidated.sql
-- Phase 3: extend payload (snapshots, workers_json, etc.); client calls:
--   supabase.rpc('approve_task_complete', { ... })
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_task_complete(
  p_task_id text,
  p_session_id uuid,
  p_start_time timestamptz,
  p_expected_minutes integer,
  p_record_id text,
  p_record_snapshot jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_task_id IS NULL OR trim(p_task_id) = '' THEN
    RAISE EXCEPTION 'approve_task_complete: task_id required';
  END IF;
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'approve_task_complete: session_id required';
  END IF;

  INSERT INTO public.operations_log (
    task_id,
    source_session_id,
    start_time,
    expected_minutes,
    task_status_at_close,
    worker_notes,
    engineer_notes,
    data
  ) VALUES (
    p_task_id,
    p_session_id,
    COALESCE(p_start_time, now()),
    COALESCE(p_expected_minutes, 0),
    'completed'::public.task_status_enum,
    p_record_snapshot->>'notes',
    p_record_snapshot->>'engineerNotes',
    COALESCE(p_record_snapshot, '{}'::jsonb)
  );

  UPDATE public.tasks
  SET status = 'completed'::public.task_status_enum
    , data = COALESCE(data, '{}'::jsonb)
      || jsonb_build_object(
        'approvedAt', p_record_snapshot->>'dateTime',
        'engineerComment', p_record_snapshot->>'engineerNotes'
      )
  WHERE id = p_task_id;

  DELETE FROM public.sessions WHERE id = p_session_id;
END;
$$;

-- Open policy era (RLS off); tighten when Auth + RLS land.
GRANT EXECUTE ON FUNCTION public.approve_task_complete(text, uuid, timestamptz, integer, text, jsonb)
  TO anon, authenticated, service_role;
