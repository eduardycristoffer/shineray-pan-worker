-- Referência da estrutura esperada (o Lovable gerencia a tabela de verdade)
create table if not exists shineray_consultas_cpf (
  id uuid primary key default gen_random_uuid(),
  cpf text not null,
  status text not null default 'pendente',
  motivo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
