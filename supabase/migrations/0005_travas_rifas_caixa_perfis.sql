-- Travas no banco para os bugs achados no QA de novembro/2026. A tela já evita
-- esses casos; aqui o banco recusa também quando duas abas ou dois aparelhos
-- disputam o mesmo registro.

-- ==========================================================================
-- RIFAS: só uma rifa aberta muda de status
-- ==========================================================================
-- Sem isto, uma aba desatualizada cancelava uma rifa já encerrada (o prêmio
-- não voltava ao estoque e o valor recebido sumia dos totais) ou encerrava uma
-- rifa já cancelada (o prêmio contava como entregue e como disponível).
create function public.guard_raffle_status()
returns trigger
language plpgsql
as $$
begin
  if new.status <> old.status and old.status <> 'aberta' then
    raise exception 'A rifa "%" já está %.', old.name, old.status
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger raffles_status_guard_trigger
  before update on public.raffles
  for each row execute function public.guard_raffle_status();

-- ==========================================================================
-- VENDAS: não grava venda em caixa fechado
-- ==========================================================================
-- O PDV que ficou aberto numa aba seguia vendendo depois que o caixa era
-- fechado em outra; a venda ficava fora de qualquer fechamento.
create function public.guard_sale_session_open()
returns trigger
language plpgsql
as $$
begin
  if new.session_id is not null and exists (
    select 1 from public.cash_sessions where id = new.session_id and status <> 'open'
  ) then
    raise exception 'O caixa desta venda já foi fechado.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger sales_session_open_guard_trigger
  before insert on public.sales
  for each row execute function public.guard_sale_session_open();

-- ==========================================================================
-- PERFIS: funcionários logados veem o nome uns dos outros
-- ==========================================================================
-- Com só "usuário vê seu próprio perfil", o Histórico mostrava "—" como
-- vendedor em toda venda feita por outro funcionário. Editar continua
-- restrito ao próprio perfil.
create policy "profiles: usuários logados veem os perfis" on public.profiles
  for select using (auth.role() = 'authenticated');
