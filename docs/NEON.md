# Neon: ativação pendente

O frontend continua usando Supabase. O schema e a API Neon são uma fundação independente e **não significam migração concluída**. Nenhum dado antigo foi copiado. Não remova o Supabase até validar importação, autenticação, arquivos e todos os fluxos com o banco destino.

## Preparar destino

1. Crie um banco Neon e configure `DATABASE_URL` exclusivamente no servidor; nunca use prefixo `VITE_`.
2. Configure `APP_URL` com a origem HTTPS publicada.
3. Execute `node --env-file=.env.local scripts/neon-migrate.mjs`. O script aplica DDL transacional no schema separado `preciso`, sem apagar tabelas existentes.
4. No terminal seguro, defina `ADMIN_EMAIL`, `ADMIN_NAME` e `ADMIN_PASSWORD` (mínimo 16 caracteres) e execute `scripts/neon-bootstrap-admin.mjs`. Não há senha padrão nem promoção por email no cadastro. Um admin existente é preservado.
5. Use uma conexão de aplicação com acesso apenas ao schema `preciso`; não conceda acesso SQL ao navegador. Guarde conexão de migração separadamente.

## API do servidor

`handleNeonRequest` em `src/server/neon/api.ts` deve ser montado em `/api/neon/*` no runtime Node. Sem banco responde 503. Mutations exigem JSON e `Origin` correspondente a `APP_URL`; sessões usam cookies HttpOnly, SameSite Strict e Secure em produção. Senhas usam scrypt e tokens de sessão são armazenados apenas como SHA-256. Login possui limite persistente por conta.

| Recurso | Métodos | Permissão |
| --- | --- | --- |
| auth/register | POST | Cadastro somente cliente |
| auth/login, auth/logout | POST | Origem verificada |
| auth/me | GET | Sessão válida |
| services | GET | Catálogo ativo público |
| admin/services | GET | Administrador |
| services, services/:id | POST, PATCH | Administrador |
| quotes | GET, POST | Dados do próprio usuário; admin lista geral |
| quotes/:id | PATCH | Administrador; mantém histórico |
| projects | GET, POST | Leitura própria; admin cria de orçamento aprovado |
| projects/:id | PATCH | Administrador |
| appointments | GET, POST | Leitura e solicitações próprias; admin lista geral |
| payments | GET, POST | Leitura própria; criação administrativa |
| payments/:id | PATCH | Administrador registra recebimento |

Preços são obtidos do catálogo no servidor ao criar orçamento. Nunca são aceitos preço, total, status, role, user_id ou company_id arbitrários do navegador. Orçamentos permanecem preliminares; empreendimentos, mais de 500 unidades e serviços sob orçamento exigem visita técnica. Itens e histórico são gravados em uma única instrução SQL atômica.

## Importação e validação antes da troca

Faça backup/exportação autorizada de todas as tabelas e arquivos de origem. Preserve UUIDs e relacionamentos; usuários precisam redefinir senha por canal seguro, pois hashes Supabase não são compatíveis com este cadastro. Implemente recuperação de senha com provedor de email antes de ativar o novo login. Implemente upload privado e URLs assinadas antes de migrar anexos. Compare contagens e totais, valide isolamento com duas contas e teste permissões admin. A API ainda não substitui todos os módulos Supabase; a UI operacional continua conectada ao Supabase. Gestão de etapas de obras, empresas, avaliações e configurações precisam de endpoints e todos os módulos precisam de adaptação do frontend antes do corte definitivo. A tabela `preciso.platform_settings` já oferece persistência de configurações no destino, sem dados fictícios ou defaults comerciais inventados.
