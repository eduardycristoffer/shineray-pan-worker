# shineray-pan-worker

Worker Playwright que loga no go!PAN (`veiculos.bancopan.com.br`), preenche o
CPF de um lead da Shineray e classifica o resultado (`pre_aprovado`,
`reprovado` ou `erro`), gravando direto no Supabase.

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
  -d '{"consulta_id":"<uuid da linha no supabase>","cpf":"00000000000"}'
```

A resposta HTTP volta na hora (202). O resultado é gravado no Supabase alguns
segundos depois — acompanhe pela tabela ou pelos logs do processo.

## Deploy no Railway

1. Suba esta pasta pra um repositório GitHub (novo repo, ex.:
   `shineray-pan-worker`).
2. No Railway, dentro do projeto `shineray-pan-worker` já criado, adicione um
   serviço a partir desse repo (`create-deployment` / "Deploy from GitHub" no
   painel).
3. Em **Variables**, cole os valores reais de `PAN_USERNAME`, `PAN_PASSWORD`,
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e gere um `WORKER_SECRET`
   (qualquer string longa aleatória) — direto no painel do Railway, nunca
   pelo chat.
4. Railway detecta o `Dockerfile` e builda com o Chromium já instalado.
5. Depois do deploy, gere um domínio público (Settings → Networking →
   Generate Domain) e use essa URL no HTTP Request node do n8n.

## O que ainda precisa ser confirmado no portal real

Alguns seletores foram inferidos do texto visível da tela e podem precisar de
ajuste fino depois do primeiro teste:

- Texto exato do botão de categoria (`Moto`) — `PAN_CATEGORIA` no `.env`
  controla isso.
- Se "Financiamento" já vem selecionado por padrão, o clique extra em
  `abrirNovaProposta` é só uma garantia e não deve causar problema.
- O seletor de modal (`[role="dialog"], [aria-modal="true"], .modal,
  .pan-mahoe-modal`) é genérico — se o modal real do go!PAN usar outra
  classe, ajustar em `src/pan-worker.js`.

## Segurança

- CPF nunca aparece completo nos logs (`maskCpf`).
- Credenciais do PAN e do Supabase só existem como variável de ambiente,
  nunca no código.
- O endpoint exige o header `Authorization: Bearer <WORKER_SECRET>` — sem
  isso, qualquer um na internet poderia disparar consultas.
