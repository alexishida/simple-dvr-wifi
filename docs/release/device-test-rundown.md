# Teste por dispositivo — Intelbras e Tapo

Registro de execução da tarefa 15.2. Para cada câmera, percorra os fluxos
abaixo e marque o resultado. Preencha o arquivo `docs/release/device-matrix.md`
com os resultados finais e as limitações.

## Preparação

- Build candidato empacotado instalado em Windows 10/11 x64.
- Câmeras conectadas à mesma rede do host (Ethernet recomendada).
- Anote, para cada câmera: endereço IP, credenciais, e se expõe ONVIF/RTSP.

## Validação automatizada por dispositivo

Para a parte de conectividade/segmentos (alcance, autenticação, ONVIF, mídia,
RTSP, snapshot, PTZ e codec), execute o harness contra a câmera:

```powershell
npm run device:test -- --onvif http://<IP>/onvif/device_service --user admin --pass senha --json docs/release/results/intelbras.json
npm run device:test -- --onvif http://<IP>/onvif/device_service --user admin --pass senha --json docs/release/results/tapo.json
```

O comando roda o teste segmentado real (mesmo orquestrador usado no cadastro) e
grava o JSON. O `ptz` e o `codec` dependem do que o dispositivo declara;
fluxos de UI (live view, grid, fullscreen) continuam exigindo validação manual
abaixo.

## Dispositivo 1 — Intelbras

| Campo         | Valor                |
| ------------- | -------------------- |
| Modelo exato  |                      |
| Firmware      |                      |
| IP / hostname |                      |
| Acesso        | ONVIF / RTSP / ambos |
| Tem PTZ       | sim / não            |

| Fluxo                                             | Resultado | Observação / Limitação |
| ------------------------------------------------- | --------- | ---------------------- |
| Descoberta WS-Discovery                           |           |                        |
| Cadastro manual                                   |           |                        |
| Cadastro via descoberta (botão Cadastrar)         |           |                        |
| Autenticação (credencial válida)                  |           |                        |
| Autenticação (credencial inválida → `auth_error`) |           |                        |
| Perfis main/substream                             |           |                        |
| Live view H.264                                   |           |                        |
| Grid (com segunda câmera)                         |           |                        |
| PTZ (se suportado)                                |           |                        |
| Snapshot (endpoint)                               |           |                        |
| Snapshot (fallback FFmpeg, se endpoint ausente)   |           |                        |
| Gravação                                          |           |                        |
| Reconexão (queda/retorno RTSP)                    |           |                        |

## Dispositivo 2 — Tapo

| Campo         | Valor                |
| ------------- | -------------------- |
| Modelo exato  |                      |
| Firmware      |                      |
| IP / hostname |                      |
| Acesso        | ONVIF / RTSP / ambos |
| Tem PTZ       | sim / não            |

| Fluxo                                             | Resultado | Observação / Limitação |
| ------------------------------------------------- | --------- | ---------------------- |
| Descoberta WS-Discovery                           |           |                        |
| Cadastro manual                                   |           |                        |
| Cadastro via descoberta (botão Cadastrar)         |           |                        |
| Autenticação (credencial válida)                  |           |                        |
| Autenticação (credencial inválida → `auth_error`) |           |                        |
| Perfis main/substream                             |           |                        |
| Live view H.264                                   |           |                        |
| H.265 (se exposto; confirmar fallback licenciado) |           |                        |
| Grid (com segunda câmera)                         |           |                        |
| PTZ (se suportado)                                |           |                        |
| Snapshot (endpoint)                               |           |                        |
| Snapshot (fallback FFmpeg, se endpoint ausente)   |           |                        |
| Gravação                                          |           |                        |
| Reconexão (queda/retorno RTSP)                    |           |                        |

## Regras de registro

- `ok` = fluxo concluído sem ressalvas.
- `parcial` = funciona com limitação (descrever na observação).
- `não suportado` = a câmera não oferece o recurso.
- `n/a` = não se aplica ao fluxo.

Ao final, copie os resultados para `docs/release/device-matrix.md` e liste as
limitações na seção "Limitações registradas".
