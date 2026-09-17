-- PDV Simples - schema inicial
-- Sistema de ponto de venda simplificado: cadastro, estoque, vendas, caixa,
-- dashboard e relatórios. Loja única (sem multi-loja), sem integração fiscal
-- ou de marketplaces - é um recorte enxuto de um sistema mais completo.

-- ==========================================================================
-- EXTENSÕES
-- ==========================================================================
create extension if not exists "pgcrypto";

-- ==========================================================================
-- PERFIS (papéis de usuário)
-- ==========================================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'caixa' check (role in ('dono', 'caixa', 'estoquista')),
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'Um perfil por usuário do Supabase Auth. role controla o que aparece no menu.';

-- cria o profile automaticamente quando um usuário se cadastra
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    coalesce(new.raw_user_meta_data ->> 'role', 'caixa')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ==========================================================================
-- CADASTRO: categorias, produtos, clientes
-- ==========================================================================
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  code text unique, -- código interno ou código de barras (opcional)
  name text not null,
  category_id uuid references public.categories(id) on delete set null,
  unit text not null default 'un', -- un, kg, cx, l...
  cost_price numeric(12,2) not null default 0 check (cost_price >= 0),
  sale_price numeric(12,2) not null default 0 check (sale_price >= 0),
  stock_quantity numeric(12,3) not null default 0 check (stock_quantity >= 0),
  min_stock numeric(12,3) not null default 0 check (min_stock >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_name_idx on public.products using gin (to_tsvector('simple', name));
create index products_category_idx on public.products(category_id);
create index products_active_idx on public.products(active);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  document text, -- CPF/CNPJ, opcional
  notes text,
  created_at timestamptz not null default now()
);

create index customers_name_idx on public.customers using gin (to_tsvector('simple', name));

-- ==========================================================================
-- CAIXA (sessões de caixa e movimentações de sangria/suprimento)
-- ==========================================================================
create table public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  cashier_id uuid references public.profiles(id),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opening_amount numeric(12,2) not null default 0 check (opening_amount >= 0),
  closing_amount numeric(12,2) check (closing_amount >= 0),
  expected_amount numeric(12,2) check (expected_amount >= 0),
  status text not null default 'open' check (status in ('open', 'closed'))
);

create index cash_sessions_status_idx on public.cash_sessions(status);

create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.cash_sessions(id) on delete cascade,
  type text not null check (type in ('sangria', 'suprimento')),
  amount numeric(12,2) not null check (amount > 0),
  reason text,
  created_at timestamptz not null default now()
);

-- ==========================================================================
-- VENDAS
-- ==========================================================================
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  cashier_id uuid references public.profiles(id),
  customer_id uuid references public.customers(id) on delete set null,
  session_id uuid references public.cash_sessions(id),
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  total numeric(12,2) not null default 0 check (total >= 0),
  payment_method text check (payment_method in ('dinheiro', 'pix', 'credito', 'debito', 'misto')),
  amount_received numeric(12,2) check (amount_received >= 0),
  change_amount numeric(12,2) check (change_amount >= 0),
  status text not null default 'completed' check (status in ('completed', 'cancelled')),
  created_at timestamptz not null default now()
);

create index sales_created_at_idx on public.sales(created_at desc);
create index sales_status_idx on public.sales(status);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id),
  description text not null, -- snapshot do nome do produto no momento da venda
  quantity numeric(12,3) not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  cost_price_at_sale numeric(12,2) not null default 0 check (cost_price_at_sale >= 0),
  subtotal numeric(12,2) not null check (subtotal >= 0)
);

create index sale_items_sale_idx on public.sale_items(sale_id);
create index sale_items_product_idx on public.sale_items(product_id);

-- pagamento pode ser dividido (misto): uma ou mais linhas por venda
create table public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  method text not null check (method in ('dinheiro', 'pix', 'credito', 'debito')),
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

-- ==========================================================================
-- ESTOQUE: movimentações manuais (entrada/saída/ajuste)
-- ==========================================================================
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  type text not null check (type in ('entrada', 'saida', 'ajuste')),
  quantity numeric(12,3) not null check (quantity <> 0),
  reason text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index stock_movements_product_idx on public.stock_movements(product_id);

-- ==========================================================================
-- TRIGGERS: baixa/entrada automática de estoque
-- ==========================================================================

-- venda finalizada (sale_items inserido) baixa o estoque do produto
create function public.apply_sale_item_stock()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.product_id is not null then
    update public.products
      set stock_quantity = stock_quantity - new.quantity,
          updated_at = now()
      where id = new.product_id;
  end if;
  return new;
end;
$$;

create trigger sale_items_stock_trigger
  after insert on public.sale_items
  for each row execute function public.apply_sale_item_stock();

-- venda cancelada devolve o estoque dos itens ao estoque
create function public.reverse_stock_on_cancel()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    update public.products p
      set stock_quantity = p.stock_quantity + si.quantity,
          updated_at = now()
      from public.sale_items si
      where si.sale_id = new.id and si.product_id = p.id;
  end if;
  return new;
end;
$$;

create trigger sales_cancel_stock_trigger
  after update on public.sales
  for each row execute function public.reverse_stock_on_cancel();

-- movimentação manual de estoque aplica entrada/saída/ajuste
create function public.apply_stock_movement()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.products
    set stock_quantity = stock_quantity +
      case
        when new.type = 'entrada' then new.quantity
        when new.type = 'saida' then -new.quantity
        else new.quantity -- ajuste: quantity pode ser positiva ou negativa
      end,
        updated_at = now()
    where id = new.product_id;
  return new;
end;
$$;

create trigger stock_movements_apply_trigger
  after insert on public.stock_movements
  for each row execute function public.apply_stock_movement();

-- ==========================================================================
-- RLS - qualquer usuário autenticado (funcionário logado) pode operar.
-- O controle fino por papel (dono/caixa/estoquista) é feito na interface;
-- para uma loja pequena de usuário único isso é suficiente. Ver README
-- para como restringir por papel no banco caso o negócio cresça.
-- ==========================================================================
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.cash_sessions enable row level security;
alter table public.cash_movements enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.sale_payments enable row level security;
alter table public.stock_movements enable row level security;

create policy "profiles: usuário vê seu próprio perfil" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles: usuário atualiza seu próprio perfil" on public.profiles
  for update using (auth.uid() = id);

create policy "authenticated full access" on public.categories
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated full access" on public.products
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated full access" on public.customers
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated full access" on public.cash_sessions
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated full access" on public.cash_movements
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated full access" on public.sales
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated full access" on public.sale_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated full access" on public.sale_payments
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated full access" on public.stock_movements
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
