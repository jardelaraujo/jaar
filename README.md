# Casa Avintes: gastos

App web e mobile (PWA, instalável no telemóvel) para registar e ver os gastos da casa de Avintes. Substitui a base de dados do Notion "Gastos da Compra (Casa)".

- **Login** com email e palavra-passe (Supabase Auth)
- **Lançamentos**: criar, editar e apagar (nome, categoria, data, loja, preço, quantidade, quem pagou, pago/por pagar)
- **Resumo**: total gasto, pago, por pagar, gasto deste mês
- **Gráficos**: evolução por mês ou acumulada, total por categoria, total por quem pagou
- Filtros, pesquisa e exportação para CSV
- Modo claro/escuro automático; abre como app no telemóvel ("Adicionar ao ecrã principal")

É uma app estática (HTML/CSS/JS, sem build), servida a partir da raiz do repositório.

## 1. Configurar o backend (Supabase, plano gratuito)

1. Crie um projeto em <https://supabase.com>.
2. **SQL Editor → New query**: cole o conteúdo de [`schema.sql`](schema.sql) e carregue em **Run**.
   Isto cria a tabela `gastos`, as regras de segurança (só utilizadores com login acedem) e importa os 7 lançamentos atuais do Notion.
3. **Authentication → Sign In / Providers**: desative **"Allow new users to sign up"**, para que só as pessoas que adicionar consigam entrar.
4. **Authentication → Users → Add user**: crie um utilizador (email e palavra-passe) para cada pessoa da casa.
5. **Project Settings → API**: copie o **Project URL** e a **anon public key** para [`config.js`](config.js):

   ```js
   window.CASA_CONFIG = {
     SUPABASE_URL: "https://xxxx.supabase.co",
     SUPABASE_ANON_KEY: "eyJhbGciOi...",
   };
   ```

   A anon key pode ser pública: os dados estão protegidos pelas políticas RLS do `schema.sql`.

Sem `config.js` preenchido, a app corre em **modo demo**: aceita qualquer login e guarda os dados só no browser. Serve para experimentar.

## 2. Publicar

Qualquer alojamento estático serve. Com GitHub Pages: **Settings → Pages → Deploy from a branch** (`main`, pasta `/`). A app fica em `https://<utilizador>.github.io/jaar/`.

Para testar localmente:

```bash
python3 -m http.server 8000
```

Depois abra <http://localhost:8000/>.

## 3. Instalar no telemóvel

Abra o endereço da app no telemóvel:

- **iPhone (Safari)**: Partilhar → Adicionar ao ecrã principal
- **Android (Chrome)**: menu ⋮ → Instalar app

## Notas

- **Total** = preço unitário × quantidade.
- No `schema.sql`, a "Comissão Avaliação" ficou com o pagador **"Pessoa 2"**, porque no Notion foi paga por um utilizador cujo nome não consegui ler. Altere o nome na app (toque no lançamento) ou no SQL antes de o executar.
- Ficheiros: `index.html` (estrutura), `styles.css` (visual), `app.js` (lógica), `config.js` (ligação ao Supabase), `schema.sql` (base de dados), `sw.js` e `manifest.webmanifest` (PWA).
