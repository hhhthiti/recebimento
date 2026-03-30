# Sistema de Recebimento e Conferência (ADM x Operação)

Aplicação web simples (HTML/CSS/JS) integrada ao Supabase para:

- cadastro/login por matrícula;
- controle por perfil (`adm` e `operacao`);
- upload e publicação de XML de NF-e;
- conferência cega com confirmação de divergência;
- logs com destaque em vermelho para divergência;
- exportar e apagar logs;
- chat por bolha flutuante entre perfis.

## 1) Configuração

1. Crie um projeto no Supabase.
2. No SQL Editor, rode o script `supabase-schema.sql`.
3. Configure RLS/policies conforme sua necessidade de segurança.
4. (Opcional) criar edge functions:
   - `send-sms` para envio da nova senha via SMS;
   - `send-email` para envio da nova senha por email.

> **Importante:** este MVP salva senha em texto puro para simplificar e atender ao fluxo pedido. Em produção, usar autenticação nativa do Supabase Auth e hash de senha.

## 2) Executar localmente

Use qualquer servidor estático. Exemplo:

```bash
python3 -m http.server 8080
```

Depois abra `http://localhost:8080`.

## 3) Fluxo

### ADM
- sobe XML + motorista/placa/telefone;
- visualiza dados da nota e imprime em PDF (`Ctrl+P` do navegador);
- publica nota para conferência;
- acompanha conferências e logs;
- exporta/apaga logs.

### Operação
- seleciona nota por `numero/placa`;
- confere sem ver quantidade esperada (conferência cega);
- confirma envio;
- se houver divergência, sistema pede confirmação e salva observação.

## 4) Sobre Terabox

Não foi incluída integração direta com Terabox neste MVP.
O sistema mantém logs no banco Supabase e exportação em JSON.
