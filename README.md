# PDV Simples

Sistema de ponto de venda enxuto: cadastro, estoque, vendas (caixa), dashboard
e relatórios. É um recorte simplificado do fluxo de um PDV completo — sem
multi-loja, sem integração fiscal/NCM, sem enriquecimento de catálogo por API
externa e sem integração com marketplaces.

## Stack

- [Vite](https://vite.dev) + React 19 + TypeScript
- Tailwind CSS 4
- [Supabase](https://supabase.com) (Postgres + Auth) como backend
- React Router, Recharts (gráfico do dashboard), date-fns

## Estrutura

```
src/
  components/    Layout, sidebar e componentes de UI (Button, Card, Modal, Tabs...)
  contexts/      AuthContext (sessão + perfil do usuário logado)
  lib/           cliente Supabase e utilitário de exportação CSV
  pages/
    Dashboard.tsx
    Login.tsx
    cadastro/    Produtos, Categorias, Clientes
    estoque/     Níveis de estoque, Movimentações
    vendas/      PDV (tela de caixa), Histórico, sessão de caixa
    relatorios/  Vendas por período, valorização de estoque
  types/         tipos TypeScript que espelham as tabelas do banco
supabase/
  migrations/0001_init.sql            schema completo (tabelas, triggers, RLS)
  migrations/0002_seed_categorias.sql categorias iniciais (loja de pipas)
```

## 1. Criar o projeto no Supabase

1. Crie um projeto em [supabase.com](https://supabase.com/dashboard) (ou use um
   já existente, dedicado a este sistema).
2. No painel do projeto, abra **SQL Editor** e rode, em ordem, o conteúdo dos
   arquivos de `supabase/migrations/`: primeiro `0001_init.sql` (cria todas as
   tabelas, os gatilhos de baixa/entrada de estoque e as políticas de RLS) e
   depois `0002_seed_categorias.sql` (pré-cadastra as categorias de produtos).
   Alternativamente, com a [CLI do Supabase](https://supabase.com/docs/guides/local-development)
   instalada: `supabase link --project-ref SEU_REF && supabase db push`.
3. Em **Project Settings → API**, copie a **Project URL** e a **anon public key**.

## 2. Configurar o projeto localmente

```bash
cp .env.example .env
# edite .env com a URL e a anon key do seu projeto Supabase
npm install
npm run dev
```

Acesse `http://localhost:5173`.

## 3. Criar o primeiro usuário (dono)

O app não tem tela de cadastro de usuário — funcionários são criados pelo
dono direto no Supabase (mais simples e mais seguro para uma loja pequena):

1. No painel do Supabase, vá em **Authentication → Users → Add user** e
   crie o usuário com e-mail e senha.
2. Um perfil é criado automaticamente na tabela `profiles` com papel `caixa`.
   Para o primeiro acesso, promova esse usuário a dono rodando no **SQL Editor**:
   ```sql
   update public.profiles set role = 'dono' where id = 'UUID_DO_USUARIO';
   ```
   (o UUID aparece na lista de usuários do Authentication).
3. Repita o passo 1 para cada funcionário, ajustando o `role` para `caixa`
   (só acessa Dashboard e Vendas) ou `estoquista` (Dashboard, Estoque e
   Cadastro). Só `dono` vê Relatórios.

## 4. Build e deploy

```bash
npm run build   # gera a pasta dist/
npm run preview # serve o build localmente para conferir
```

`dist/` é um site estático puro — pode ser publicado em qualquer hospedagem
de front-end (Vercel, Netlify, Cloudflare Pages, um bucket S3 com CDN etc.).
Lembre de configurar lá as mesmas variáveis `VITE_SUPABASE_URL` e
`VITE_SUPABASE_ANON_KEY` usadas no `.env.local`.

### Vercel

O projeto está ligado ao repositório do GitHub: todo push na `main` gera um
deploy de produção. O `vercel.json` na raiz faz o rewrite de todas as rotas
para `index.html` (necessário para o React Router).

As variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` ficam em
**Project → Settings → Environment Variables** (Production e Preview). Após
alterá-las é preciso fazer um novo deploy, pois o Vite as embute no build.

No Supabase, adicione a URL de produção da Vercel em **Authentication → URL
Configuration** (Site URL e Redirect URLs).

## Como o fluxo de venda funciona

- **Abrir caixa**: antes de vender, é preciso abrir uma sessão de caixa
  informando o valor inicial (para troco).
- **Vender**: busca por nome ou código, monta o carrinho, aplica desconto,
  escolhe a forma de pagamento (dinheiro, pix, crédito, débito ou misto) e
  finaliza. A baixa de estoque é automática (gatilho no banco).
- **Sangria / suprimento**: retiradas ou reforços de caixa durante o turno.
- **Fechar caixa**: informa o valor contado na gaveta ao final do turno.
- **Cancelar venda**: no histórico, cancelar uma venda devolve o estoque dos
  itens automaticamente.

## Segurança dos dados (RLS)

Para manter simples, a política padrão é: qualquer usuário autenticado (ou
seja, qualquer funcionário logado) pode ler e escrever em todas as tabelas de
negócio. O controle por papel (dono/caixa/estoquista) acontece apenas na
interface — o menu lateral já esconde o que cada papel não deveria ver.

Isso é suficiente para uma loja pequena com poucos funcionários de confiança.
Se o negócio crescer e for necessário impedir, por exemplo, que um `caixa`
edite produtos mesmo via API direta, adicione políticas de RLS mais
específicas por papel nas tabelas relevantes (usando o `role` de
`public.profiles`), no lugar da política genérica `authenticated full access`.

## Nota sobre o provisionamento automático

Ao montar este projeto eu tentei já criar um projeto Supabase novo (separado
do `mv-fable`) usando o MCP, mas a conta já está no limite de projetos
gratuitos ativos (2). Por isso o passo 1 acima precisa ser feito manualmente
— criando um projeto novo, ou pausando/atualizando um dos existentes para
liberar uma vaga.
