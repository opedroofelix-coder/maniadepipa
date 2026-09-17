-- PDV Simples - seed de categorias (loja de pipas)
-- Rode depois de 0001_init.sql. Idempotente: pode rodar mais de uma vez.

insert into public.categories (name) values
  ('Pipas'),
  ('Linhas'),
  ('Carretilhas'),
  ('Rabiolas'),
  ('Varetas'),
  ('Papel de seda'),
  ('Colas e fitas'),
  ('Kits prontos'),
  ('Acessórios')
on conflict (name) do nothing;
