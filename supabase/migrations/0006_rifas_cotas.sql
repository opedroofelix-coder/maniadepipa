-- Rifas 2.0: valor e total de cotas, cotas vendidas por dia e prêmios
-- editáveis com a rifa aberta. As cotas de cada dia entram no Dashboard como
-- dinheiro que entrou e lucro do dia (ver src/lib/raffles.ts); o caixa e o
-- relatório de vendas continuam só com as vendas da loja.

-- ==========================================================================
-- RIFAS: valor da cota, total de cotas e data do sorteio
-- ==========================================================================
-- Opcionais: rifas antigas não têm, e uma rifa nova pode ser criada antes de
-- decidir o preço. Sem os dois primeiros não dá para registrar cotas.
alter table public.raffles
  add column ticket_price numeric(12,2) check (ticket_price > 0),
  add column total_tickets integer check (total_tickets > 0),
  add column draw_date date;

-- ==========================================================================
-- COTAS VENDIDAS POR DIA
-- ==========================================================================
create table public.raffle_ticket_sales (
  id uuid primary key default gen_random_uuid(),
  raffle_id uuid not null references public.raffles(id) on delete cascade,
  sale_date date not null,
  quantity integer not null check (quantity > 0),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  -- um registro por dia: para corrigir o dia, edita-se o registro
  unique (raffle_id, sale_date)
);

create index raffle_ticket_sales_date_idx on public.raffle_ticket_sales(sale_date);

-- só rifa aberta, com preço e total de cotas, e nunca mais cotas do que a rifa tem
create function public.guard_raffle_ticket_sale()
returns trigger
language plpgsql
as $$
declare
  r public.raffles;
  sold_elsewhere integer;
begin
  if tg_op = 'DELETE' then
    -- rifa encerrada ou cancelada não muda mais; a exclusão em cascata de uma
    -- rifa chega aqui sem ela (r vazio) e passa
    select * into r from public.raffles where id = old.raffle_id;
    if r.status is not null and r.status <> 'aberta' then
      raise exception 'A rifa "%" já está %.', r.name, r.status using errcode = 'check_violation';
    end if;
    return old;
  end if;
  select * into r from public.raffles where id = new.raffle_id;
  if r.status <> 'aberta' then
    raise exception 'A rifa "%" já está %.', r.name, r.status using errcode = 'check_violation';
  end if;
  if r.ticket_price is null or r.total_tickets is null then
    raise exception 'Defina o valor e o total de cotas da rifa "%" antes de registrar cotas.', r.name
      using errcode = 'check_violation';
  end if;
  select coalesce(sum(quantity), 0) into sold_elsewhere
    from public.raffle_ticket_sales
    where raffle_id = new.raffle_id and id <> new.id;
  if sold_elsewhere + new.quantity > r.total_tickets then
    raise exception 'A rifa "%" tem % cotas e já vendeu %.', r.name, r.total_tickets, sold_elsewhere
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger raffle_ticket_sales_guard_trigger
  before insert or update or delete on public.raffle_ticket_sales
  for each row execute function public.guard_raffle_ticket_sale();

-- o total de cotas não pode ficar abaixo do que já foi vendido
create function public.guard_raffle_total_tickets()
returns trigger
language plpgsql
as $$
declare
  sold integer;
begin
  if new.total_tickets is distinct from old.total_tickets then
    select coalesce(sum(quantity), 0) into sold from public.raffle_ticket_sales where raffle_id = new.id;
    if sold > 0 and (new.total_tickets is null or new.total_tickets < sold) then
      raise exception 'A rifa "%" já vendeu % cotas.', new.name, sold using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger raffles_total_tickets_guard_trigger
  before update on public.raffles
  for each row execute function public.guard_raffle_total_tickets();

-- ==========================================================================
-- PRÊMIOS: mudar a quantidade ou excluir ajusta o estoque
-- ==========================================================================
-- O insert já reserva o estoque (reserve_raffle_item_stock, 0004). Aqui:
-- aumentar tira a diferença, diminuir e excluir devolvem. Tudo vira
-- movimentação de estoque, e só vale com a rifa aberta.
create function public.guard_raffle_item_open()
returns trigger
language plpgsql
as $$
declare
  raffle_status text;
begin
  -- na exclusão em cascata de uma rifa ela já não existe (status nulo) e passa
  select status into raffle_status from public.raffles
    where id = case when tg_op = 'DELETE' then old.raffle_id else new.raffle_id end;
  if raffle_status is not null and raffle_status <> 'aberta' then
    raise exception 'Os prêmios só mudam com a rifa aberta.' using errcode = 'check_violation';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger raffle_items_open_guard_trigger
  before insert or update or delete on public.raffle_items
  for each row execute function public.guard_raffle_item_open();

create function public.adjust_raffle_item_stock()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  r public.raffles;
  diff numeric;
begin
  if tg_op = 'UPDATE' then
    diff := new.quantity - old.quantity;
    if diff = 0 then
      return new;
    end if;
    select * into r from public.raffles where id = new.raffle_id;
    insert into public.stock_movements (product_id, type, quantity, reason, created_by, raffle_id)
    values (
      new.product_id,
      case when diff > 0 then 'saida' else 'entrada' end,
      abs(diff),
      'Rifa: ' || r.name || case when diff > 0 then ' (prêmio aumentado)' else ' (prêmio diminuído)' end,
      auth.uid(),
      r.id
    );
    return new;
  end if;

  -- DELETE: devolve só se a rifa existe e está aberta (rifa cancelada já
  -- devolveu tudo; a exclusão em cascata de uma rifa não passa por aqui com ela)
  select * into r from public.raffles where id = old.raffle_id;
  if r.id is not null and r.status = 'aberta' then
    insert into public.stock_movements (product_id, type, quantity, reason, created_by, raffle_id)
    values (old.product_id, 'entrada', old.quantity, 'Rifa: ' || r.name || ' (prêmio removido)', auth.uid(), r.id);
  end if;
  return old;
end;
$$;

create trigger raffle_items_adjust_stock_trigger
  after update or delete on public.raffle_items
  for each row execute function public.adjust_raffle_item_stock();

-- ==========================================================================
-- RLS - mesma regra das outras tabelas de negócio
-- ==========================================================================
alter table public.raffle_ticket_sales enable row level security;

create policy "authenticated full access" on public.raffle_ticket_sales
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
