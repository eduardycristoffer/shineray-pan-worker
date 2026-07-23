create table if not exists shineray_consultas_cpf (
  id uuid primary key default gen_random_uuid(),
  cliente text not null default 'shineray',
  cpf text not null,
  status text not null default 'pendente'
    check (status in ('pendente', 'processando', 'pre_aprovado', 'reprovado', 'erro')),
  motivo text,
  detalhes jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shineray_consultas_cpf_status_idx
  on shineray_consultas_cpf (status);
