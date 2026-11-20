# Folhas da loja

Telas que repetem o controle que o dono fazia no papel. Todas ficam no menu lateral, grupo **Loja**.

| Tela                               | Endereço                         | Quem usa          |
| ---------------------------------- | -------------------------------- | ----------------- |
| Folha do dia                       | `/admin/folha`                   | dono e secretária |
| Folha da semana (segunda a sábado) | `/admin/folha?secao=semana`      | dono e secretária |
| Fechamentos                        | `/admin/folha?secao=fechamentos` | dono e secretária |
| Fiados                             | `/admin/folha?secao=fiados`      | dono              |
| Débitos da empresa                 | `/admin/folha?secao=debitos`     | dono              |
| Conferir entregas                  | `/admin/folha?secao=entregas`    | dono              |

A secretária precisa de uma conta de cliente com a permissão **"Folha do dia, caixa e
fechamento (secretária)"**, dada em Loja › Clientes › Acessos da equipe.

## Regras

- **Caixa:** abre com um valor; vendas em dinheiro entram; retiradas (RT), vales e contas pagas com
  o dinheiro da gaveta saem. Ao fechar, o sistema compara o contado com o que deveria ter e mostra
  se faltou ou sobrou.
- **Retiradas e vales** saem do caixa, mas não contam como gasto da loja no resultado.
- **Gastos** são fixos ou variáveis, como na folha do dono.
- **Fechamento automático** todo dia às 23h (Brasília). No sábado também fecha a semana. No dia 5
  também roda o CFO do mês anterior. O dono ou a secretária podem fechar na hora, com observação.
- **Conferir entregas:** pedido ao fornecedor › "a entrega chegou" › conferir item por item
  (chegou bom, quebradas, avariadas, faltou). Só o que chegou bom entra no estoque e na conta do
  fornecedor. O resto fica anotado para cobrar.
- **Débitos da empresa:** boletos, dívidas, aluguel, outros e créditos. O valor pode ficar em branco.
  Itens marcados como **Exemplo** precisam ser confirmados com o dono.

## Semana de exemplo (09 a 14/11/2026)

`scripts/exemplo-semana-loja.mjs` monta a semana das folhas do dono (vendas, caixa, gastos, fiados,
débitos, estoque de 16/11 e um pedido para conferir).

O que não estava claro nas folhas ficou como exemplo: valor do aluguel do Sr. Dema (em branco),
créditos de João e Ramom, Leonardo e caminhão (em branco), se o vale de R$ 150 da STE faz parte dos
R$ 400, e o custo por metro de junta, moldura, baguete e prancha.

Diferenças achadas nas folhas: na sexta 13/11 faltaram R$ 90 no caixa; na terça a folha soma
R$ 671, mas as vendas somam R$ 670; a diária da quinta não entrou nos gastos da semana.

## Produtos e preços

Nomes, medidas e preços de varejo e atacado vieram das artes de oferta da loja (só o texto; as
imagens não foram usadas). Atacado: placa 65x65 R$ 4,89 a partir de 100, gesso 40kg R$ 23,99 a
partir de 30, bloco hidro R$ 22,99 a partir de 20, gesso cola 5kg R$ 11,99 a partir de 10, arame 1kg
R$ 29,99 a partir de 10 e bloco divisório R$ 11,99 para cliente de perfil atacado. Rebite 4mm e
pitão 6mm são vendidos só em embalagem fechada (100 unidades ou milheiro).

Contato da loja nas artes: (81) 9.8424-4279 · Rua Coronel Waldemar Basgal, 299 e Rua Equador, 677 —
Cajueiro Seco.

## Publicar

```sh
npm run db:migrate                     # aplica drizzle/0009_folhas_da_loja.sql
node scripts/exemplo-semana-loja.mjs --dir .exemplo-pglite --apply   # opcional: semana de exemplo
```

O `--apply` só grava se o banco ainda não tiver vendas. Na Vercel, o agendamento passou a rodar
todo dia (`vercel.json`), e precisa de `CRON_SECRET` configurado.
