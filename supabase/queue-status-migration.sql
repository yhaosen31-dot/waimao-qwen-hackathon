alter table public.runs drop constraint if exists runs_status_check;

alter table public.runs
  add constraint runs_status_check
  check (status in ('created', 'queued', 'running', 'waiting_review', 'paused', 'completed', 'failed', 'cancelled'));

