# Sistema de Recebimento e Conferência (ADM x Operação)

Aplicação web (HTML/CSS/JS) com Supabase para operação de recebimento de NF-e.

## Principais pontos implementados

- Login/cadastro separados por telas (matrícula + senha).
- Perfis `adm` e `operacao` com visibilidade por permissão.
- Upload XML no ADM com extração automática de motorista, telefone, placa e DT/remessa.
- Conferência da operação com marcação direta de **avaria** e **faltando**.
- NQ somente no ADM, retornando linha pronta para Excel:  
  `Data | Placa | Remessa | NF | CD de Origem | SKU | Qtde NF | Qtd Rec. FISICO`.
- Cargas conferidas em abas no ADM, com botão para **fechar descarga**.
- Logs em página separada com abas (Todos, Divergências, Falta, Normais), busca e botões de baixar/apagar.
- Destaque visual: divergência em vermelho, faltas em amarelo.

## 1) Erro "Could not find the table 'public.usuarios'"

Esse erro significa que o schema do banco ainda não está aplicado no projeto Supabase.

### Correção definitiva
1. Abrir o **SQL Editor** do Supabase.
2. Executar o arquivo `supabase-schema.sql` (versão idempotente atualizada).
3. Recarregar o app.

> O app entra em **MODO LOCAL** automaticamente quando não encontra as tabelas, para não travar testes.

## 2) Configuração Supabase

1. Crie um projeto no Supabase.
2. Rode `supabase-schema.sql` no SQL Editor.
3. Ajuste RLS/policies conforme sua segurança.
4. (Opcional) configure funções para recuperação de senha:
   - `send-sms` (Twilio);
   - `send-email` (Resend/SMTP).

## 3) Executar localmente

```bash
python3 -m http.server 8080
```

Depois abra `http://localhost:8080`.

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

## 5) SMS e E-mail

Se SMS/e-mail não funcionar, normalmente faltam as edge functions no projeto Supabase.

Exemplo:
```bash
supabase functions deploy send-email
supabase functions deploy send-sms
supabase secrets set CHAVE=valor
```

## 6) Observação de segurança

Este MVP mantém senha em texto puro para simplicidade operacional. Para produção, usar Supabase Auth + hash de senha.
