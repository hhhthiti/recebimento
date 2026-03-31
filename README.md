# Sistema de Recebimento e Conferência (ADM x Operação)

Aplicação web simples (HTML/CSS/JS) integrada ao Supabase para:

- cadastro/login por matrícula;
- controle por perfil (`adm` e `operacao`);
- upload e publicação de XML de NF-e;
- conferência cega com confirmação de divergência;
- logs com destaque em vermelho para divergência;
- exportar e apagar logs;
- chat por bolha flutuante entre perfis.

## 1) Erro "Could not find the table 'public.usuarios'"

Se aparecer esse erro ao cadastrar/login, significa que as tabelas ainda não foram criadas no Supabase.

**Como corrigir (definitivo):**
1. Abra o Supabase > SQL Editor.
2. Rode o script `supabase-schema.sql`.
3. Atualize a página.

**Comportamento atual do app:**
- Se detectar ausência das tabelas, o sistema troca automaticamente para **MODO LOCAL** (localStorage), para você continuar testando sem travar.

## 2) Configuração Supabase

1. Crie um projeto no Supabase.
2. No SQL Editor, rode o script `supabase-schema.sql`.
3. Configure RLS/policies conforme sua necessidade de segurança.
4. (Opcional) crie edge functions:
   - `send-sms` para envio da nova senha via SMS;
   - `send-email` para envio da nova senha por email.

> **Importante:** este MVP salva senha em texto puro para simplificar e atender ao fluxo pedido. Em produção, usar autenticação nativa do Supabase Auth e hash de senha.

## 3) Executar localmente

Use qualquer servidor estático. Exemplo:

```bash
python3 -m http.server 8080
```

Depois abra `http://localhost:8080`.

## 4) Fluxo

### ADM
- sobe XML e o sistema extrai motorista/telefone/placa automaticamente;
- visualiza dados da nota e gera PDF em 2 páginas (layout de NF + conferência);
- publica nota para conferência;
- acompanha conferências e logs;
- exporta/apaga logs.

### Operação
- seleciona nota por `numero/placa`;
- confere sem ver quantidade esperada (conferência cega);
- confirma envio;
- se houver divergência, sistema pede confirmação e salva observação.

## 5) Sobre Terabox

Não foi incluída integração direta com Terabox neste MVP.
O sistema mantém logs no banco Supabase e exportação em JSON.

## 6) SMS e E-mail (recuperação de senha)

Se SMS/E-mail não estiver funcionando, não é erro de frontend: falta configurar as Edge Functions no Supabase.

### Exemplo de setup
1. Criar `send-email` (com Resend ou SMTP) em `supabase/functions/send-email`.
2. Criar `send-sms` (com Twilio) em `supabase/functions/send-sms`.
3. Publicar com:
   ```bash
   supabase functions deploy send-email
   supabase functions deploy send-sms
   ```
4. Definir secrets (`RESEND_API_KEY` ou `TWILIO_*`) com:
   ```bash
   supabase secrets set CHAVE=valor
   ```

Sem essas funções, o sistema mostra mensagem orientando a configuração.
