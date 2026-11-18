# Ouro Branco — operação comercial

Destino do código: https://github.com/lp070087-cpu/gessobranco

## Desenvolvimento

Stack preservada: React 19, TanStack Start, Vite e Tailwind. Use Node compatível com Vite 7 (22.12+), `npm ci` e `npm run dev`. Gestão comercial: `/admin/comercial`. O site público permanece em `/`.

## Banco e acesso

Configure `DATABASE_URL` exclusivamente no servidor, nunca com prefixo `VITE_`. Configure `APP_URL` com a origem exata da aplicação (inclusive porta no desenvolvimento). Sem banco, a gestão informa indisponibilidade; não grava vendas fictícias.

Antes de qualquer migração em produção, verifique a instância e os dados existentes e crie um ponto de recuperação no Neon. Rode `npm run db:plan`, valide primeiro em uma branch de teste do Neon e só então `npm run db:migrate`. O executor preserva dados, verifica checksums e aplica cada migration em uma transação. Não executa reset.

Crie o primeiro administrador com `node scripts/neon-bootstrap-admin.mjs`, fornecendo `DATABASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (mínimo 16 caracteres) e `ADMIN_NAME` pelo ambiente seguro. Não coloque credenciais no repositório. O comando preserva o administrador existente e não promove clientes existentes.

A gestão comercial usa sessões HttpOnly, permissões verificadas no servidor e autenticação própria do Neon. Os módulos antigos continuam preservados e ainda possuem integração legada com Supabase: a migração completa desses módulos não está concluída. A implantação integral requer resolver essa dependência e validar os dados existentes.

## Regras da loja

- Cadastre a unidade-base e as conversões reais de cada produto. O exemplo de gesso fica inativo e sem preço. Nenhum peso de saco é presumido.
- As compras criam lotes; o custo de aquisição inclui mercadoria, frete e outros custos informados. O método implementado é FIFO, explicitamente identificado no cadastro. Não há escolha silenciosa entre métodos.
- Venda confirmada baixa estoque uma vez, em transação. Pagamento, entrega e estorno são operações distintas. Venda a prazo requer cliente autorizado.
- Devoluções restauram os lotes de origem. Estornos financeiros precisam ser registrados separadamente, após confirmação do dinheiro devolvido.
- Preços podem variar por cliente, perfil, unidade, quantidade e validade. Alteração manual exige motivo. Margem abaixo da desejada gera alerta; só o limite de desconto configurado como obrigatório bloqueia.
- Custo desconhecido permanece desconhecido: o resultado é parcial. Completar custo de compra pendente atualiza as alocações antes desconhecidas; custos já conhecidos permanecem históricos.
- Margem de contribuição é receita menos custo das mercadorias e gastos atribuídos à venda. O resultado estimado do período também considera despesas gerais cadastradas. Não equivale a apuração contábil/fiscal completa. Caixa representa movimentação financeira, não lucro.
- Operações possuem identificador único, responsável, data e payload de auditoria. A interface guarda operações com resposta incerta para repetir a mesma chave, impedindo baixa duplicada após falha de rede.
- Importação XLSX (primeira aba) e CSV aceita até 200 produtos por arquivo, com mapeamento, simulação e validação. Cria rascunhos sem saldo; a planilha real precisa ser fornecida para importar relatórios e regras particulares.
- O catálogo público exibe somente produtos ativos e publicados. Só mostra preço padrão quando autorizado; condições comerciais e custos não são publicados.

## Validação e publicação

`npm test` testa regras de orçamento, senhas, importação e a implementação PostgreSQL comercial com PGlite isolado, além dos handlers HTTP reais com um adaptador de banco de teste. Os cenários usam uma hipótese de saco de 40 kg somente como fixture. Os testes locais de concorrência não substituem teste de múltiplas conexões no Neon.

Execute também `npm run typecheck`, `npm run lint` e `npm run build`. Valide no Neon transações concorrentes com conexões independentes, restauração de backup, persistência e permissões antes da operação real. Teste visual desktop/mobile em navegador disponível antes de afirmar homologação visual.

Na Vercel, configure `DATABASE_URL` e `APP_URL` por ambiente, associe o repositório novo e valide login/admin, estoque, pagamentos, build e commit publicado. Não publique como sistema integral homologado enquanto os módulos legados e a conexão real estiverem pendentes.
