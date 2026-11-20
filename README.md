# Ouro Branco — Soluções em Gesso / PRECISO

Sistema existente em React 19, TanStack Start, Vite e Tailwind.

Repositório oficial: https://github.com/lp070087-cpu/gessobranco

```sh
npm ci
npm run dev
```

Site: `/`. Gestão comercial: `/admin/comercial`. Configuração do Neon, regras de estoque,
testes e pendências de implantação: [Operação comercial](docs/OPERACAO-COMERCIAL.md).
Folha do dia, caixa, fechamentos e conferência de entregas: [Folhas da loja](docs/FOLHAS-DA-LOJA.md).

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

A nova gestão comercial usa Neon e autenticação própria. Módulos antigos foram preservados e
ainda dependem da integração legada; a migração integral e a homologação em produção estão pendentes.

## Histórico dos requisitos iniciais

O conteúdo abaixo registra os requisitos originais; não representa o estado de implementação.

### Orça Fácil

CRIAR UM APLICATIVO MODERNO DE ORÇAMENTO PARA SERVIÇOS DE:

* Pintura
* Gesso
* Parede 3D
* Drywall
* Massa corrida
* Textura
* Reformas em geral

OBJETIVO:
O aplicativo deve permitir que clientes façam uma estimativa automática de orçamento com base nas medidas da parede ou área informada.

ESTILO VISUAL:
Usar design moderno, premium e responsivo inspirado nos sites:

* https://flex-beauty-br.lojavirtualnuvem.com.br/
* https://flex-jewelry-br.lojavirtualnuvem.com.br/
* https://flex-fashion-br.lojavirtualnuvem.com.br/
* https://flex-theme-br.lojavirtualnuvem.com.br/
* https://flex-electronics-br.lojavirtualnuvem.com.br/
* https://flex-sports-br.lojavirtualnuvem.com.br/
* https://lojanys.com.br/
* https://idealepapeis.lojavirtualnuvem.com.br/
* https://darklabsuplementos.com.br/
* https://eurobrasvinhos.com.br/
* https://www.choraboy.com.br/
* https://www.parafinesse.com/

CORES:

* Preto premium
* Branco clean
* Cinza moderno
* Azul escuro
* Detalhes dourados opcionais

TIPOGRAFIA:
Estilo elegante e moderno semelhante aos sites de e-commerce premium.

FUNCIONALIDADES PRINCIPAIS:

1. LOGIN E CADASTRO

* Login com email e senha
* Campo “manter conectado”
* Ícone de olho para mostrar/esconder senha
* Se o usuário errar a senha:

  * limpar automaticamente o campo senha
  * mostrar mensagem:
    “Senha incorreta, tente novamente.”
* Recuperação de senha
* Cadastro de cliente
* Cadastro de empresa

EMAIL ADMINISTRADOR PRINCIPAL:
[lp070087@gmail.com](mailto:lp070087@gmail.com)

2. HOME PAGE

* Banner principal moderno
* Botão “Fazer orçamento”
* Cards de serviços
* Sessão “Como funciona”
* Sessão de avaliações
* Serviços em destaque

3. CALCULADORA DE ORÇAMENTO
   O usuário informa:

* altura
* largura

O sistema calcula automaticamente:

Área = altura × largura

Exemplo:

3m × 2m = 6m²

Depois mostrar opções:

* Parede lisa
* Parede 3D
* Pintura simples
* Gesso
* Textura
* Drywall

Cada serviço terá valor por m² definido pelo administrador.

Exemplo:
Parede 3D = R$ 80/m²

Sistema calcula:
6 × 80 = R$ 480

Mostrar:
“Preço estimado”

Mensagem:
“Os valores podem variar após visita técnica.”

4. AGENDAMENTO
   Após orçamento:
   Perguntar:
   “Deseja agendar uma visita?”

Campos:

* nome
* telefone
* endereço
* cidade
* data
* horário
* observações
* upload de fotos

5. PAINEL ADMINISTRATIVO
   Administrador pode:

* adicionar serviços
* editar valores
* remover serviços
* ver agendamentos
* ver clientes
* aprovar orçamentos
* enviar notificações
* visualizar relatórios

6. PAINEL EMPRESA
   Empresa pode:

* cadastrar serviços
* alterar preços
* aceitar visitas
* conversar com clientes
* acompanhar pedidos

7. FUNCIONALIDADES FUTURAS

* IA para analisar paredes
* pagamento online
* mapa com profissionais
* avaliação de usuários
* sistema de assinatura

TECNOLOGIAS:
Frontend:

* React Native ou Flutter

Backend:

* Node.js
* Firebase ou Supabase

BANCO DE DADOS:

* usuários
* empresas
* serviços
* orçamentos
* agendamentos
* pagamentos
* avaliações

ESTILO GERAL:
Visual premium, moderno, elegante e intuitivo.
Animações suaves.
Cards arredondados.
Layout semelhante a aplicativos modernos de marketplace.
