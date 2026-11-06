-- Casa Avintes — esquema da base de dados (Supabase / Postgres)
-- Executar no Supabase: SQL Editor → New query → colar tudo → Run.

create table if not exists public.gastos (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  categoria   text not null default 'Outros',
  data        date not null default current_date,
  loja        text,
  preco       numeric(12,2) not null check (preco >= 0),
  quantidade  numeric(10,2) not null default 1 check (quantidade > 0),
  pago        boolean not null default false,
  quem_pagou  text,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid() references auth.users(id)
);

create index if not exists gastos_data_idx on public.gastos (data);

-- Segurança: só utilizadores autenticados (login) podem ler e escrever.
-- Todos os utilizadores com login partilham a mesma lista (é a casa de todos).
alter table public.gastos enable row level security;

drop policy if exists "gastos: ler (autenticados)"    on public.gastos;
drop policy if exists "gastos: inserir (autenticados)" on public.gastos;
drop policy if exists "gastos: editar (autenticados)"  on public.gastos;
drop policy if exists "gastos: apagar (autenticados)"  on public.gastos;

create policy "gastos: ler (autenticados)"     on public.gastos for select to authenticated using (true);
create policy "gastos: inserir (autenticados)" on public.gastos for insert to authenticated with check (true);
create policy "gastos: editar (autenticados)"  on public.gastos for update to authenticated using (true) with check (true);
create policy "gastos: apagar (autenticados)"  on public.gastos for delete to authenticated using (true);

-- Dados importados do Notion ("Gastos da Compra (Casa)").
-- "Pessoa 2" é quem pagou a Comissão Avaliação no Notion — altere para o nome certo.
insert into public.gastos (nome, categoria, data, loja, preco, quantidade, pago, quem_pagou) values
  ('Primeira Fração dos 10% de entrada (Carlo Rui)', 'Aquisição da Casa', '2026-05-05', null,  5000.00, 1, true, 'Jardel'),
  ('Fração dos 10% de entrada (Gisela Cristina)',    'Aquisição da Casa', '2026-05-20', null,  3281.25, 1, true, 'Jardel'),
  ('Fração dos 10% de entrada (Paula Maria)',        'Aquisição da Casa', '2026-05-20', null,  3281.25, 1, true, 'Jardel'),
  ('Fração dos 10% de entrada (Carlo Rui)',          'Aquisição da Casa', '2026-05-21', null,  5500.00, 1, true, 'Jardel'),
  ('Fração dos 10% de entrada (Paula Maria)',        'Aquisição da Casa', '2026-05-21', null, 14437.50, 1, true, 'Jardel'),
  ('Comissão Dossier',                               'Aquisição da Casa', '2026-06-17', null,   301.60, 1, true, 'Jardel'),
  ('Comissão Avaliação',                             'Aquisição da Casa', '2026-06-17', null,   239.20, 1, true, 'Pessoa 2');
