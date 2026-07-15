# Bot de WhatsApp — Átila Gomes Academy

Bot de menu fixo (sem IA) que deixa clientes agendarem, verem, remarcarem e cancelarem
atendimentos direto pelo WhatsApp. Usa a **API oficial da Meta (WhatsApp Cloud API)** e
lê/escreve no **mesmo Supabase** que o `index.html` já usa — tudo que o bot fizer aparece
automaticamente no app quando você abrir no navegador.

Sem dependências externas (só `fetch`/`crypto` nativos do Node 18+), sem servidor para manter
no ar: roda em funções serverless da Vercel.

Também inclui: menus/confirmações como **listas e botões clicáveis** (não só números digitados),
**histórico de mensagens** (visível na página "Mensagens WhatsApp" do `index.html`), e um fluxo de
**"falar com atendente"** com aviso automático + resposta manual pelo app (veja seção 6).

**Fluxo de agendamento** (opção 1 do menu): profissional (pulado automaticamente se só houver 1
ativo) → procedimento (cadastrado em Configurações → Planos Disponíveis, cada um com sua duração
em minutos) → mês (este mês / mês que vem) → dia (só aparecem dias com horário livre, com
paginação) → horário (já calculado considerando a duração do procedimento escolhido) → confirmação.
Remarcar segue o mesmo mês → dia → horário, mantendo o profissional/duração do agendamento original.

---

## 1. Criar o app na Meta for Developers

1. Acesse https://developers.facebook.com/ → **Meus Apps** → **Criar App** → tipo **"Negócios"**.
2. Dentro do app, em **Adicionar Produto**, adicione o **WhatsApp**.
3. Em **WhatsApp → Configuração da API**, clique em **"Adicionar número de telefone"** e registre o
   número NOVO e dedicado ao bot (precisa receber um SMS/ligação de verificação — não pode ser um
   número já ativo no WhatsApp pessoal ou Business App comum).
4. Anote, nessa mesma tela:
   - **Phone Number ID** (`META_PHONE_NUMBER_ID`)
   - **WhatsApp Business Account ID** (não precisa numa variável, mas guarde por garantia)
5. Gere um **token de acesso temporário** (válido por 24h, ótimo para os primeiros testes) — depois
   trocamos por um permanente.
6. Em **Configurações do App → Básico**, copie o **Chave Secreta do App / App Secret**
   (`META_APP_SECRET`).
7. Ainda em **WhatsApp → Configuração da API**, na seção **"Para"**, adicione seu **próprio número de
   celular** como destinatário de teste e verifique-o — enquanto o app não passar pela Verificação
   de Negócios da Meta, só números cadastrados aqui conseguem mandar/receber mensagens do bot.
8. Quando quiser deixar de vez em produção (qualquer cliente podendo mandar mensagem, sem precisar
   cadastrar o número dela como testadora), gere um **token permanente**: **Configurações do
   Negócio → Usuários do Sistema → criar um Usuário do Sistema** com permissão
   `whatsapp_business_messaging`, e gere o token por lá (não expira).

## 2. Criar a tabela nova no Supabase

1. Abra o painel do Supabase do projeto (o mesmo que o `index.html` usa).
2. Vá em **SQL Editor** → cole o conteúdo de [`sql/001_whatsapp_sessions.sql`](sql/001_whatsapp_sessions.sql) → **Run**.
3. Em **Settings → API**, copie a chave **`service_role`** (⚠️ é secreta — nunca cole essa chave no
   `index.html` nem em nenhum lugar visível pelo navegador; ela só vai para a Vercel, como variável
   de ambiente do servidor).

## 3. Publicar na Vercel

1. Crie um repositório novo no GitHub só com o conteúdo desta pasta `whatsapp-bot/` (pode ser
   privado).
2. Em https://vercel.com → **Add New... → Project** → importe esse repositório.
3. Antes de publicar, vá em **Environment Variables** e adicione todas as variáveis abaixo
   (veja `.env.example` para a lista com descrição de onde pegar cada uma):

   | Variável | Valor |
   |---|---|
   | `META_ACCESS_TOKEN` | token do passo 1.5 (ou o permanente do passo 1.8) |
   | `META_PHONE_NUMBER_ID` | do passo 1.4 |
   | `META_VERIFY_TOKEN` | invente uma senha qualquer, ex: `atila-verify-2026` |
   | `META_APP_SECRET` | do passo 1.6 |
   | `SUPABASE_URL` | `https://qtxglcprcuwucukablar.supabase.co` |
   | `SUPABASE_SERVICE_KEY` | do passo 2.3 |
   | `ADMIN_SECRET` | invente outra senha, ex: `atila-admin-2026` |
   | `PAINEL_WHATSAPP_SECRET` | precisa ser IGUAL à constante `WA_PAINEL_SECRET` no `index.html` |
   | `STUDIO_NOTIFICACAO_TELEFONE` | telefone (DDI+DDD+número, só dígitos) que recebe o aviso de "pediu atendente" |

4. Clique em **Deploy**. Ao terminar, copie a URL pública, ex: `https://atila-bot.vercel.app`.

## 4. Conectar o Webhook na Meta

1. Volte em **WhatsApp → Configuração** (na Meta for Developers).
2. Em **Webhook**, clique em **Editar** e preencha:
   - **URL de retorno de chamada**: `https://SEU-PROJETO.vercel.app/api/webhook`
   - **Token de verificação**: o MESMO valor que você colocou em `META_VERIFY_TOKEN`
3. Clique em **Verificar e salvar** (se der erro, confira se a Vercel já terminou o deploy e se o
   token bate certinho dos dois lados).
4. Clique em **Gerenciar** ao lado de "Campos do Webhook" e assine (subscribe) o campo **`messages`**.

Pronto — a partir daqui, qualquer mensagem recebida no número do bot é entregue na sua função
`api/webhook.js`.

## 5. Testar antes de liberar para clientes de verdade

**5.1 — Teste local, sem gastar nada, sem precisar do WhatsApp real ainda:**

```bash
cd whatsapp-bot
npx vercel dev
```

Em outro terminal, simule uma mensagem chegando (troque `5511999999999` pelo seu número de teste):

```bash
curl -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{ "changes": [{ "value": {
      "contacts": [{ "wa_id": "5511999999999", "profile": { "name": "Cliente Teste" } }],
      "messages": [{ "from": "5511999999999", "id": "wamid.teste1", "type": "text", "text": { "body": "oi" } }]
    }}]}]
  }'
```

> Nota: sem `META_APP_SECRET` batendo com uma assinatura real, esse teste local vai falhar na
> verificação de assinatura (por segurança). Para testar localmente sem a Meta, comente
> temporariamente a checagem `verifySignature` em `api/webhook.js` — e **lembre de descomentar**
> antes de publicar.

Percorra o fluxo inteiro por texto: menu → agendar → ver → remarcar → cancelar → uma cliente nova
(número nunca visto) sendo cadastrada automaticamente.

**5.2 — Teste real com a Meta**, depois do deploy na Vercel:

1. Do seu celular (cadastrado como testador no passo 1.7), mande "oi" para o número do bot.
2. Percorra o menu completo pelo WhatsApp de verdade.
3. Confira no navegador, abrindo o `index.html`, que os agendamentos criados/alterados aparecem
   certinho nas telas **Agendamentos**, **Grade de Horários** e **Auditoria** (a ação deve
   aparecer como feita por "Bot WhatsApp").

**5.3 — Casos extremos:**
- Tente agendar num domingo ou num feriado cadastrado → deve recusar.
- Tente agendar dois horários que se sobrepõem para o mesmo profissional → o segundo deve ser
  recusado.
- Mande a mesma mensagem duas vezes (`curl` com o mesmo `"id"`) → não deve duplicar o agendamento.

## 6. "Falar com atendente" — como funciona de ponta a ponta

Quando uma cliente escolhe a opção **5 (Falar com atendente)**:

1. O bot manda uma mensagem avisando e **fica em silêncio** para aquele número por 1h (retoma
   sozinho depois disso, ou a cliente pode digitar **"menu"** a qualquer momento para voltar).
2. Se `STUDIO_NOTIFICACAO_TELEFONE` estiver configurado, o bot manda **automaticamente** um aviso
   por WhatsApp pra esse número, com o nome e telefone da cliente.
3. Quem for responder abre a página **"Mensagens WhatsApp"** no `index.html`, vê a conversa, e usa
   o campo **"Responder manualmente"** pra mandar a resposta — ela sai pelo mesmo número do bot
   (via `POST /api/enviar-manual`, protegido pela `PAINEL_WHATSAPP_SECRET`) e fica registrada no
   histórico como uma mensagem normal.
4. Enviar uma resposta manual também renova o prazo de silêncio do bot (mais 1h), pra ele não
   voltar a responder no meio de uma conversa humana em andamento.

Devolver a conversa pro bot na força, sem esperar a 1h:
```
https://SEU-PROJETO.vercel.app/api/admin-reset?phone=5511999999999&secret=SEU_ADMIN_SECRET
```

## Limitações conhecidas (por design, para manter simples)

- Bot de menu fixo — a cliente responde com números ou clicando em listas/botões, não é
  entendimento de texto livre por IA.
- Duração do agendamento vem do procedimento escolhido (Planos Disponíveis); sem procedimentos
  cadastrados, usa 60min padrão. Remarcações preservam a duração original.
- Listas clicáveis do WhatsApp aceitam no máximo 10 linhas — profissionais e procedimentos são
  cortados nesse limite (sem paginação, ao contrário da lista de dias, que já pagina).
- Sem lembrete automático de atraso ainda (isso é o botão manual 📲 que já existe no app) — dá
  para integrar depois reaproveitando `lib/meta.js`.
