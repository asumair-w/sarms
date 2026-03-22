-- -----------------------------------------------------------------------------
-- SARMS – approve_task_complete (atomic close-out)
-- Run in Supabase SQL Editor after schema-consolidated.sql
--
-- Loads the session row, copies closure fields into operations_log, updates task
-- (status + flagged), sets sessions.closed_at before delete for a consistent
-- snapshot (row is still removed after; audit lives in operations_log).
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.approve_task_complete(text, uuid, timestamptz, integer, text, jsonb);

CREATE OR REPLACE FUNCTION public.approve_task_complete(
  p_task_id text,
  p_session_id uuid,
  p_start_time timestamptz,
  p_expected_minutes integer,
  p_record_id text,
  p_record_snapshot jsonb,
  p_approved_by uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.sessions%ROWTYPE;
  v_approved_at timestamptz;
  v_flagged boolean;
BEGIN
  IF p_task_id IS NULL OR trim(p_task_id) = '' THEN
    RAISE EXCEPTION 'approve_task_complete: task_id required';
  END IF;
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'approve_task_complete: session_id required';
  END IF;

  SELECT * INTO STRICT s FROM public.sessions WHERE id = p_session_id;

  v_approved_at := COALESCE(
    NULLIF(trim(p_record_snapshot->>'dateTime'), '')::timestamptz,
    now()
  );

  -- Prefer explicit flagged from client snapshot when present; else session row.
  IF p_record_snapshot ? 'flagged' AND (p_record_snapshot->>'flagged') IS NOT NULL THEN
    v_flagged := (p_record_snapshot->>'flagged')::boolean;
  ELSE
    v_flagged := COALESCE(s.flagged, false);
  END IF;

  -- Stamp session closure before delete (same tx); full audit also in operations_log.
  UPDATE public.sessions
  SET closed_at = v_approved_at
  WHERE id = p_session_id;

  INSERT INTO public.operations_log (
    task_id,
    source_session_id,
    start_time,
    expected_minutes,
    task_status_at_close,
    finished_by_worker_at,
    session_status_at_close,
    flagged,
    worker_notes,
    engineer_notes,
    approved_by,
    approved_at,
    data,
    task_snapshot,
    session_snapshot
  )
  SELECT
    p_task_id,
    p_session_id,
    COALESCE(p_start_time, s.start_time, now()),
    COALESCE(p_expected_minutes, s.expected_minutes, 0),
    'completed'::public.task_status_enum,
    s.finished_by_worker_at,
    s.status::text,
    v_flagged,
    p_record_snapshot->>'notes',
    p_record_snapshot->>'engineerNotes',
    p_approved_by,
    v_approved_at,
    COALESCE(p_record_snapshot, '{}'::jsonb),
    COALESCE(p_record_snapshot, '{}'::jsonb),
    jsonb_build_object(
      'sessionId', s.id,
      'taskId', s.task_id,
      'status', s.status::text,
      'finishedByWorkerAt', s.finished_by_worker_at,
      'closedAt', v_approved_at,
      'flagged', v_flagged,
      'workerId', s.worker_id
    );

  UPDATE public.tasks
  SET status = 'completed'::public.task_status_enum
    , flagged = v_flagged
    , data = COALESCE(data, '{}'::jsonb)
      || jsonb_build_object(
        'approvedAt', p_record_snapshot->>'dateTime',
        'engineerComment', p_record_snapshot->>'engineerNotes'
      )
  WHERE id = p_task_id;

  DELETE FROM public.sessions WHERE id = p_session_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_task_complete(text, uuid, timestamptz, integer, text, jsonb, uuid)
  TO anon, authenticated, service_role;

-- Optional: allow calls without the 7th arg (defaults to NULL) — same signature with DEFAULT is one function.
COMMENT ON FUNCTION public.approve_task_complete(text, uuid, timestamptz, integer, text, jsonb, uuid) IS
  'Closes a worker session: insert operations_log, set task completed + flagged, delete session.';
