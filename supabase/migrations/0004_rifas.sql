-- Rifas com produtos do estoque.
-- A venda dos números e o sorteio acontecem em outro sistema de rifa; aqui o
-- PDV controla só os prêmios (que saem do estoque) e o valor recebido, que é
-- informado no fim. Esse dinheiro não passa pelo caixa nem entra em `sales`.
--
-- Ciclo: aberta -> encerrada (com o valor recebido) ou aberta -> cancelada
-- (os prêmios voltam para o estoque).

create table public.raffles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  notes text,
  status text not null default 'aberta' check (status in ('aberta', 'encerrada', 'cancelada')),
  amount_received numeric(12,2) check (amount_received >= 0), -- nulo até encerrar
  closed_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index raffles_created_at_idx on public.raffles(created_at desc);

-- prêmios da rifa: mesmo formato de sale_items (snapshot do nome e dos preços)
create table public.raffle_items (
  id uuid primary key default gen_random_uuid(),
  raffle_id uuid not null references public.raffles(id) on delete cascade,
  product_id uuid not null references public.products(id),
  description text not null,
  quantity numeric(12,3) not null check (quantity > 0),
  cost_price_at_raffle numeric(12,2) not null default 0 check (cost_price_at_raffle >= 0),
  sale_price_at_raffle numeric(12,2) not null default 0 check (sale_price_at_raffle >= 0)
);

create index raffle_items_raffle_idx on public.raffle_items(raffle_id);
create index raffle_items_product_idx on public.raffle_items(product_id);

-- liga a movimentação de estoque à rifa que a gerou (nulo para as manuais)
alter table public.stock_movements
  add column raffle_id uuid references public.raffles(id) on delete set null;

-- ==========================================================================
-- TRIGGERS: a reserva e a devolução viram movimentações de estoque, e o
-- gatilho stock_movements_apply_trigger (0001_init.sql) faz a conta. Assim
-- tudo aparece em Estoque -> Movimentações, e o check stock_quantity >= 0
-- recusa a rifa inteira quando falta estoque.
-- ==========================================================================

-- prêmio cadastrado reserva (baixa) o estoque
create function public.reserve_raffle_item_stock()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.stock_movements (product_id, type, quantity, reason, created_by, raffle_id)
  select new.product_id, 'saida', new.quantity, 'Rifa: ' || r.name, r.created_by, r.id
    from public.raffles r
    where r.id = new.raffle_id;
  return new;
end;
$$;

create trigger raffle_items_stock_trigger
  after insert on public.raffle_items
  for each row execute function public.reserve_raffle_item_stock();

-- rifa cancelada devolve os prêmios ao estoque
create function public.return_raffle_stock_on_cancel()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status = 'cancelada' and old.status = 'aberta' then
    insert into public.stock_movements (product_id, type, quantity, reason, created_by, raffle_id)
    select ri.product_id, 'entrada', ri.quantity, 'Rifa cancelada: ' || new.name, auth.uid(), new.id
      from public.raffle_items ri
      where ri.raffle_id = new.id;
  end if;
  return new;
end;
$$;

create trigger raffles_cancel_stock_trigger
  after update on public.raffles
  for each row execute function public.return_raffle_stock_on_cancel();

-- ==========================================================================
-- RLS - mesma regra das outras tabelas de negócio (ver 0001_init.sql)
-- ==========================================================================
alter table public.raffles enable row level security;
alter table public.raffle_items enable row level security;

create policy "authenticated full access" on public.raffles
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated full access" on public.raffle_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
