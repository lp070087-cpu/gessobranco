# Independência da plataforma de origem

O repositório oficial é https://github.com/lp070087-cpu/gessobranco. O projeto usa Vite, TanStack Start e Nitro diretamente; não depende de um editor hospedado para desenvolvimento ou deploy.

Foram removidos o wrapper de build do antigo editor, seu arquivo de projeto, a exceção de instalação e o lockfile Bun obsoleto. O gerenciador deste projeto é npm e o lockfile mantido é `package-lock.json`.

A função de estimativa não envia fotos para gateways de IA. As fotos continuam no fluxo existente para revisão da equipe. O cálculo preliminar usa somente medidas e condições informadas e é identificado como estimativa sujeita a revisão. Não há provedor de IA alternativo ativado silenciosamente.

O TanStack Start deve resolver para `1.168.60` e `@tanstack/start-server-core` para `1.169.39` ou versões posteriores corrigidas. O bloqueio de segurança da hospedagem deve ser resolvido atualizando dependências e reconstruindo a aplicação, sem variáveis que desativem a proteção.

## Limites externos

A gestão comercial usa Neon. Os módulos antigos ainda usam o SDK Supabase e a migração completa deles permanece pendente. Esse banco não foi apagado, migrado ou transferido de titularidade nesta limpeza. Se estiver sob gestão de uma plataforma anterior, a independência desses dados exige exportação e migração para uma conta própria antes de revogar o acesso.

Mudanças no código não revogam permissões concedidas a aplicativos externos na conta GitHub. Se existir acesso do editor ao repositório novo, remova somente esse repositório nas permissões do aplicativo instalado. Não é necessário afetar outros projetos da conta.

A publicação do código pode ser feita pelo acesso GitHub autorizado quando o ambiente local impedir escrita no diretório Git. Nesse caso a origem e o histórico Git locais continuam exigindo sincronização própria; não use push forçado.
