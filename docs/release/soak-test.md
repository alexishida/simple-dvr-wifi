# Soak test — múltiplas câmeras

Preenchimento obrigatório para a tarefa 15.3. Objetivo: verificar ausência de
crash, vazamento progressivo de memória/recursos e processos órfãos sob carga
contínua.

## Execução

### Harness automatizado (sem hardware físico)

As specs permitem exercitar o soak com o ambiente simulado. Rode o harness
automatizado que adquire/libera 16 sessões com quedas/retornos parciais por
ciclo, medindo memória, referências de stream e processo/config órfãos:

```powershell
# 40 ciclos (rápido, roda no npm test)
npm run soak

# soak longo reproduzível (ex.: 200 ciclos)
npm run soak 200
```

O harness grava `docs/release/soak-<platform>-<arch>.json` com RSS inicial/final,
delta de heap, CPU, sessions/processos/config após shutdown e loopback-only.

### Soak com câmeras reais

- Usar câmeras reais das categorias aprovadas na matriz (mínimo 4; ideal 8–16).
- Duração mínima: 4 horas de execução contínua; gravação prolongada por ao
  menos 1 hora em uma câmera.
- Ciclos de queda/retorno: provocar queda e retorno do stream da câmera várias
  vezes (idealmente a cada 15–30 minutos) e verificar reconexão automática.
- Minimizar/restaurar a janela repetidamente durante a execução.

## Resultado inicial (harness simulado — win32/x64)

| Métrica                   | Valor medido                                       |
| ------------------------- | -------------------------------------------------- |
| Ciclos / câmeras          | 40 × 16                                            |
| RSS inicial → final       | 61.5 MB → 96.2 MB (delta +34.7 MB, abaixo do teto) |
| Pico de heap usado        | +9.7 MB                                            |
| CPU (user/system)         | 390 / 1063 ms                                      |
| Sessões após shutdown     | 0                                                  |
| Processos órfãos          | 0                                                  |
| Arquivos de config órfãos | 0                                                  |
| Loopback-only             | sim                                                |

Relatório: `docs/release/soak-win32-x64.json`.

## Métricas

| Métrica                     | Expectativa                                                  | Medido inicial | Medido final | Resultado |
| --------------------------- | ------------------------------------------------------------ | -------------- | ------------ | --------- |
| Memória do processo (RSS)   | Sem crescimento progressivo significativo após estabilização |                |              |           |
| CPU                         | Sem pico sustentado não explicado                            |                |              |           |
| Portas locais em loopback   | Retornam a zero após encerrar sessões                        |                |              |           |
| Processos órfãos            | Nenhum após encerramento do app                              |                |              |           |
| Arquivos temporários/config | Nenhum acúmulo entre ciclos                                  |                |              |           |
| Referências de stream       | Retornam a zero após releases                                |                |              |           |
| Sessões de gravação         | Estados consistentes (completed/interrupted)                 |                |              |           |

## Checklist

- [ ] Nenhum crash durante o soak.
- [ ] Nenhum vazamento progressivo de memória (RSS estável após estabilização).
- [ ] Reconexão automática funcionou após cada queda programada.
- [ ] Minimizar/restaurar não interrompeu vídeo nem acumulou processos.
- [ ] Gravação prolongada concluiu ou está catalogada com estado correto.
- [ ] Nenhum processo órfão após fechar o aplicativo.
- [ ] Evidências (screenshots, logs sanitizados, métricas) registradas.

## Evidência

- Caminho do relatório de métricas, capturas de tela e logs sanitizados.
