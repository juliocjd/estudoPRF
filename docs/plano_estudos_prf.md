# plano_estudos_prf

Modulo para gerar plano de estudos PRF com base nas provas objetivas PRF 2021, PRF 2019 e PRF 2013.

## Arquivos

- `data/plano_estudos_prf/dados_analise_prf_pesos_estudo.json`: base estatistica revisada.
- `scripts/plano_estudos_prf.mjs`: exporta `gerar_plano_prf(config)` e tambem funciona como CLI.
- `scripts/test-plano-estudos-prf.mjs`: validacoes das regras principais.

## Uso rapido

```bash
npm run plano-prf:generate -- --out-json data/plano_estudos_prf/plano_estudos_prf_exemplo.json --out-md data/plano_estudos_prf/plano_estudos_prf_exemplo.md
```

Com configuracao propria:

```json
{
  "semanas_disponiveis": 16,
  "horas_por_semana": 24,
  "dias_de_estudo_por_semana": 6,
  "nivel_por_materia": {
    "Legislacao de Transito": 2,
    "Portugues": 4,
    "Direito Penal": 2
  },
  "edital_publicado": false
}
```

```bash
npm run plano-prf:generate -- --config config.plano-prf.json --out-json data/plano_estudos_prf/meu_plano.json --out-md data/plano_estudos_prf/meu_plano.md
```

## Regras preservadas

- Os dados ficam separados por `exam_key`: `prf_2021_objetiva`, `prf_2019_objetiva`, `prf_2013_objetiva`.
- Em transito, o plano separa `norma_cobrada_na_prova` de `norma_atual_de_estudo`.
- Toda sessao inclui itens C/E, correcao ativa, registro de erros e revisao 24h/7d/30d.
- Simulados sao quinzenais ate metade do ciclo e semanais na reta final.
- O Markdown inclui alerta para conferir edital, retificacoes, CONTRAN/SENATRAN e jurisprudencia atual.
