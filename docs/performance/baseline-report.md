# Baseline de desempenho — layout de monitoramento 1/4/9/16

Data: 2026-08-30
Plataforma registrada: `win32/x64`, Node `v25.4.0` (harness), runtime alvo Electron `44.0.0`.

## Objetivo

Medir o custo do caminho de mídia nos layouts 1/4/9/16, corrigir vazamentos ou
limites inviáveis e registrar uma baseline reproduzível por plataforma para
detectar regressões antes de estabilizar a versão.

## Como reproduzir

```powershell
npm run perf:baseline
```

O harness roda a suíte `tests/perf-baseline.test.ts` com `PERF_BASELINE_REPORT=1`
e grava `docs/performance/baseline-<platform>-<arch>.json` no final da execução.
O arquivo registra `platform`, `arch`, `node`, `generatedAt` e uma entrada por
layout.

O harness usa um `MediaProcessFactory` fake que abre listeners reais em loopback
para que portas e rede sejam medidas de forma determinística. A suíte também é
executada no `npm test` normal (sem env), funcionando como teste de guarda
contra vazamentos e limites.

## O que é medido por layout

| Métrica                | Descrição                                                            |
| ---------------------- | -------------------------------------------------------------------- |
| `acquireMs`            | Tempo para adquirir todas as sessões do layout (latência)            |
| `peakRssBytes`         | RSS do processo após adquirir o layout                               |
| `heapDeltaBytes`       | Crescimento de heap usado em relação ao baseline                     |
| `cpuUserMs`            | CPU de usuário consumida pela aquisição                              |
| `cpuSystemMs`          | CPU de sistema consumida pela aquisição                              |
| `processes`            | Sidecars iniciados (1 por câmera)                                    |
| `listeners`            | Listeners reais em loopback (2 por sidecar: http/api)                |
| `loopbackOnly`         | Todos os listeners vinculados a `127.0.0.1`                          |
| `configFiles`          | Arquivos de configuração temporários criados                         |
| `*AfterShutdown`       | Sessões/processos/arquivos restantes após encerrar (devem ser 0)     |

## Resultados registrados

| Layout | Acquire | RSS | Heap Δ | CPU user | Processes | Listeners | Loopback | Config | Após shutdown |
| ------ | ------- | --- | ------ | -------- | --------- | --------- | -------- | ------ | ------------- |
| 1      | 13 ms   | 64.3 MB | 508 KB | 16 ms | 1 | 2 | sim | 1 | 0/0/0 |
| 4      | 11 ms   | 64.9 MB | 732 KB | 0 ms | 4 | 8 | sim | 4 | 0/0/0 |
| 9      | 12 ms   | 65.7 MB | 436 KB | 0 ms | 9 | 18 | sim | 9 | 0/0/0 |
| 16     | 21 ms   | 68.8 MB | 0 KB | 16 ms | 16 | 32 | sim | 16 | 0/0/0 |

Valores medidos com o harness fake (sem binários reais de mídia). O custo de
supervisão do layout 16 (21 ms de aquisição, ~4.5 MB de RSS adicional) está
dentro de um teto viável; nenhum vazamento foi observado: ao encerrar, sessões,
processos e arquivos de configuração retornam a zero.

## Correção aplicada nesta baseline

**Vazamento/limite inviável encontrado e corrigido:** o `MediaSessionSupervisor`
compartilhava um único `configDir`, e cada `MediaSession` gravava o mesmo
`mediamtx.yml`. Nos layouts 4/9/16, uma câmera sobrescrevia a configuração da
anterior, tornando o grid inviável.

- `mediamtx-config.ts`: `generateMediaMtxConfig` agora aceita `configFileName`
  e deriva o log do mesmo nome base (`<cam>.log`).
- `media-session.ts`: `MediaSession` recebe `configFileName` por câmera e
  remove o arquivo de configuração ao encerrar (`cleanupConfig`).
- `MediaSessionSupervisor.acquire` passa `configFileName: <cameraId>.yml`.

Verificação: `tests/media-session.test.ts` cobre isolamento de configuração
entre câmeras, remoção no stop e o layout de 16 câmeras sem sobrescrita.

## Guardas permanentes

`tests/perf-baseline.test.ts` roda no `npm test` e falha se:

- sessões, processos ou arquivos de configuração sobram após shutdown;
- listeners saem do loopback;
- referências de stream não retornam a zero após ciclos de release;
- arquivos de configuração se acumulam entre ciclos de vida.

## Limitações

- Sem binários reais de MediaMTX/FFmpeg no repositório, CPU/memória refletem o
  custo de supervisão e do harness, não o processo sidecar completo. A baseline
  real de mídia deve ser regenerada após o empacotamento (tarefa 14.x) com
  `MEDIAMTX_BINARY` e `MEDIAMTX_EXPECTED_SHA256` definidos.
- Valores de CPU podem medir 0 ms em amostras curtas por granularidade do
  `process.cpuUsage`; tratá-los como tetos, não como medições precisas.