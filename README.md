# Sistema de Recebimento e Conferência (ADM x Operação)

Aplicação web (HTML/CSS/JS) com Supabase para operação de recebimento de NF-e.

## Principais pontos implementados

- Login pela autenticação Supabase Auth, com perfil e papel protegidos por RLS.
- Perfis `adm` e `operacao` com visibilidade por permissão.
- Upload XML no ADM com extração automática de motorista, telefone, placa e DT/remessa.
- Conferência da operação com marcação direta de **avaria** e **faltando**.
- NQ somente no ADM, retornando linha pronta para Excel:  
  `Data | Placa | Remessa | NF | CD de Origem | SKU | Qtde NF | Qtd Rec. FISICO`.
- Cargas conferidas em abas no ADM, com botão para **fechar descarga**.
- Logs em página separada com abas (Todos, Divergências, Falta, Normais), busca e botões de baixar/apagar.
- Destaque visual: divergência em vermelho, faltas em amarelo.

## Segurança e configuração Supabase

O acesso depende do Supabase Auth. Não há fallback para login local quando o banco falha, e senhas não são armazenadas na tabela `usuarios`. O ADM provisiona e redefine acessos pela Edge Function `recebimento-admin-users`.

Antes de reativar o projeto pausado, faça backup e siga [`SECURITY_MIGRATION.md`](SECURITY_MIGRATION.md). A migração `supabase/migrations/202611090002_secure_auth_rls.sql` remove senhas antigas, habilita RLS com regras por perfil e protege a tabela de usuários. Todos os usuários precisam receber senhas novas.

A função de gestão exige `SUPABASE_SERVICE_ROLE_KEY` apenas no servidor e a chave temporária `RECEBIMENTO_BOOTSTRAP_SECRET` para criar o primeiro ADM. Remova a chave temporária após o bootstrap. Não publique nenhum segredo no front-end.

## 3) Executar localmente

```bash
python3 -m http.server 8080
```

Depois abra `http://localhost:8080`.

## 3.1) Backend Node para TeraBox (upload de TXT)

1. Copie o arquivo de ambiente:
   ```bash
   cp .env.example .env
   ```
2. Preencha no `.env`:
   - `TERABOX_CLIENT_ID`
   - `TERABOX_CLIENT_SECRET`
   - `TERABOX_REDIRECT_URI`
   - `TERABOX_TARGET_DIR`
3. Instale dependências e suba o backend:
   ```bash
   npm install
   npm start
   ```
4. Faça autenticação no TeraBox:
   - abra `http://localhost:3000/auth/terabox`
5. No painel ADM, página **Logs**, clique em **Guardar** para enviar o TXT de logs ao TeraBox.

> Fluxo implementado no backend: OAuth (authorization code) → pre-upload → upload da parte → create file.
> Nome do arquivo: `logs-carregamento-YYYYMMDD-HHMMSS.txt`.

## 4) Fluxo por perfil

### ADM
- Publica XML para conferência;
- acompanha cargas por abas (abertas/conferidas/NQ);
- fecha descarga;
- acessa página exclusiva de logs com busca, exportação e limpeza;
- copia linhas NQ para Excel.

### Operação
- Seleciona nota publicada;
- informa quantidades conferidas;
- marca se veio avariado e se veio faltando;
- envia conferência para retorno do ADM.

## 5) Redefinição de acesso

O ADM define uma senha temporária nova na tela “Usuários e redefinição de acesso” e a entrega por canal privado. Senhas antigas não são importadas nem enviadas por SMS ou e-mail pelo sistema.
