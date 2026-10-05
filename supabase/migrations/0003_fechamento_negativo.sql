-- O esperado na gaveta fica negativo quando as sangrias passam da abertura mais
-- as vendas em dinheiro do dia. É um fato do caixa, não um erro de digitação:
-- com o check em >= 0 o banco recusava o update e o caixa simplesmente não
-- fechava. O valor contado (closing_amount) continua tendo que ser >= 0, porque
-- não existe contar dinheiro negativo na gaveta.

alter table public.cash_sessions
  drop constraint if exists cash_sessions_expected_amount_check;
