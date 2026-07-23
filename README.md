# shineray-pan-worker

Worker Playwright que loga no go!PAN (`veiculos.bancopan.com.br`), preenche o
CPF de um lead da Shineray e classifica o resultado (`pre_aprovado`,
`reprovado` ou `erro`).

## Arquitetura

Este projeto usa **Lovable Cloud**, que não expõe a `service_role key` do
Supabase pra fora. Por isso o worker não fala com o banco diretamente — ele
devolve o resultado pra um endpoint do próprio Lovable
(`LOVABLE_CALLBACK_URL`), que já tem acesso privilegiado internamente
(`supabaseAdmin`) e grava por lá.

```
Landing page (Lovable)
  → cria linha em shineray_consultas_cpf (status: pendente)
  → POST /consulta-cpf no worker (Railway), com { consulta_id, cpf }
      → worker loga no go!PAN, preenche o CPF, classifica o resultado
      → worker faz POST de volta pro LOVABLE_CALLBACK_URL
          → Lovable atualiza a linha via supabaseAdmin
```

O mesmo `WORKER_SECRET` autentica os dois sentidos da comunicação.

## Rodar local

```bash
npm install
npx playwright install --with-deps chromium
cp .env.example .env   # preencher os valores
npm start
```

Testar:

```bash
curl -X POST http://localhost:3000/consulta-cpf \
  -H "Authorization: Bearer SEU_WORKER_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"consulta_id":"<uuid da linha>","cpf":"00000000000"}'
```

A resposta HTTP volta na hora (202). O resultado chega no Lovable alguns
segundos depois, via callback.

## Deploy no Railway

1. Repositório: `eduardycristoffer/shineray-pan-worker` (já conectado).
2. Em **Variables** no Railway, preencher:
   - `PAN_USERNAME`, `PAN_PASSWORD`
   - `LOVABLE_CALLBACK_URL` (endpoint que o Lovable vai criar)
   - `WORKER_SECRET`
3. Gerar domínio público (Settings → Networking → Generate Domain) e usar
   essa URL no lado do Lovable, pra ele saber pra onde mandar `{ consulta_id,
   cpf }`.

## sql/schema.sql

Guardado como referência da estrutura da tabela `shineray_consultas_cpf`.
Como o Supabase deste projeto é gerenciado pelo Lovable Cloud, o jeito certo
de criar/alterar a tabela é pedindo pro próprio Lovable (ele roda a migração
internamente) — não dá pra rodar esse SQL manualmente sem acesso ao painel.

## O que ainda precisa ser confirmado no portal real

- Texto exato do botão de categoria (`Moto`) — `PAN_CATEGORIA` no `.env`
  controla isso.
- Se "Financiamento" já vem selecionado por padrão, o clique extra em
  `abrirNovaProposta` é só uma garantia e não deve causar problema.
- O seletor de modal (`[role="dialog"], [aria-modal="true"], .modal,
  .pan-mahoe-modal`) é genérico — se o modal real do go!PAN usar outra
  classe, ajustar em `src/pan-worker.js`.

## Segurança

- CPF nunca aparece completo nos logs (`maskCpf`).
- Credenciais do PAN só existem como variável de ambiente, nunca no código.
- O endpoint `/consulta-cpf` exige `Authorization: Bearer <WORKER_SECRET>`.
- O worker nunca guarda nem vê a `service_role key` do Supabase — quem grava
  no banco é sempre o Lovable, do lado dele.
