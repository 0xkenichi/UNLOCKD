-- Admin audit trail persistence
create table if not exists admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  actor_user_id uuid references app_users(id) on delete set null,
  actor_wallet text,
  actor_role text,
  target_type text,
  target_id text,
  ip_hash text,
  session_fingerprint text,
  payload jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_admin_audit_logs_created_at on admin_audit_logs (created_at desc);
create index if not exists idx_admin_audit_logs_action on admin_audit_logs (action);

alter table admin_audit_logs enable row level security;

do $$ begin
  perform 1 from pg_policies where policyname = 'service role all admin_audit_logs';
  if not found then
    create policy "service role all admin_audit_logs" on admin_audit_logs for all
      using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;
end $$;
