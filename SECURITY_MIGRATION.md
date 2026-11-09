# Migração de segurança do recebimento

Esta mudança substitui as senhas em texto e as sessões montadas pelo navegador por Supabase Auth. As senhas antigas não serão copiadas; cada pessoa recebe uma senha nova.

## Ordem de implantação

O Supabase pausado não aceita migrações nem deploy de Edge Functions. Faça backup e execute esta sequência em janela de manutenção:

1. Gere uma chave temporária aleatória e cadastre `RECEBIMENTO_BOOTSTRAP_SECRET` nos secrets das Edge Functions. Não a grave no repositório.
2. Reative o projeto e execute imediatamente `supabase/migrations/202611090002_secure_auth_rls.sql` no SQL Editor. Isso apaga a coluna de senhas e as políticas antigas; somente sessões Auth ativas poderão operar nos dados.
3. Desative o cadastro público de usuários nas configurações de Auth. Publique `recebimento-admin-users` com `supabase functions deploy recebimento-admin-users`. A função configura `verify_jwt = false` para aceitar a chamada inicial com a chave publicável; o código valida o token Auth em todas as ações administrativas e exige o secret de uso único no bootstrap. A service-role key fica apenas no ambiente da função.
4. Publique o front-end deste branch e mantenha a aplicação em manutenção até o passo seguinte.
5. No primeiro acesso, o ADM cria sua conta Auth com a matrícula aprovada e uma senha nova, usando a chave temporária. A função permite apenas um bootstrap.
6. O ADM provisiona os usuários existentes com novas senhas temporárias; entrega cada senha por canal privado. Usuários inativos não conseguem entrar.
7. Remova `RECEBIMENTO_BOOTSTRAP_SECRET`, valide um acesso ADM e outro de operação e retire a manutenção.

A tabela `usuarios` mantém apenas matrícula, perfil e dados de contato. `notas` tem leitura para usuários ativos e escrita para ADM; conferências/NQ seguem os papéis de operação; logs ficam restritos a ADM; o chat só mostra mensagens dirigidas ao papel do usuário ou enviadas por ele.
