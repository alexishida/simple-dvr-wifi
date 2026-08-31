# Roteiro de aceite do MVP — Windows

Preenchimento obrigatório para a tarefa 15.5. O MVP só é considerado aprovado
quando **todos os itens obrigatórios** passarem no Windows ou tiverem limitação
explicitamente permitida pelas specs. Evidência (screenshots, vídeos curtos,
diagnóstico sanitizado) deve ser anexada ou referenciada por caminho.

## Harness automatizado de aceite

Execute o harness que roda automaticamente os critérios automatizáveis e gera
`dist/release/acceptance-report.json`:

```powershell
npm run acceptance:report
```

O harness executa (e registra resultado): checklist de segurança/privacidade
(A12), sem internet/loopback-only no pacote (A13), reinício via e2e (A5), build
do candidato, fuses de segurança e binários com hash válido. Os itens que exigem
hardware (A1, A2, A3, A6–A11) ficam marcados como pendentes para preenchimento
manual abaixo.

## Preparação

- Build candidato empacotado (NSIS) e instalado em Windows 10/11 x64.
- Pelo menos uma câmera real de categoria aprovada na matriz (docs/release/device-matrix.md)
  ou simulador para os fluxos permitidos pelas specs.
- Diretórios de gravação/snapshot selecionáveis e graváveis.

## Roteiro

| #   | Critério obrigatório          | Como validar                                                                     | Resultado | Evidência |
| --- | ----------------------------- | -------------------------------------------------------------------------------- | --------- | --------- |
| A1  | Instalação                    | Executar NSIS em máquina limpa sem Node.js                                       |           |           |
| A2  | Cadastro manual ou descoberta | Wizard compartilhado; cadastro RTSP/ONVIF                                        |           |           |
| A3  | Autenticação                  | Credencial válida conecta; inválida gera `auth_error` sem vazar senha            |           |           |
| A4  | Persistência segura           | Reinício preserva configuração; senha nunca volta ao DOM/logs/banco              |           |           |
| A5  | Reinício                      | App fecha e reabre com estado e câmeras                                          |           |           |
| A6  | Vídeo ao vivo                 | H.264 de baixa latência reproduz no card                                         |           |           |
| A7  | Múltiplas câmeras             | Grid 4/9/16 com isolamento por card                                              |           |           |
| A8  | PTZ suportado                 | Movimento/zoom/presets somente se confirmados; Stop seguro                       |           |           |
| A9  | Snapshot                      | Captura por endpoint e fallback FFmpeg; metadados UTC                            |           |           |
| A10 | Gravação                      | Início/parada, sessão catalogada, estado persistido                              |           |           |
| A11 | Reconexão                     | Queda/retorno do RTSP sem recarregar a tela                                      |           |           |
| A12 | Segurança/privacidade         | Checklist docs/release/security-checklist.md sem segredo/listener não autorizado |           |           |
| A13 | Sem internet                  | App ocioso só acessa loopback e câmeras configuradas                             |           |           |

## Regras de aprovação

- Itens **obrigatórios** (A1–A13): todos devem estar `ok`, exceto limitação
  explicitamente permitida pelas specs (ex.: H.265 indisponível sem fallback
  licenciado → `codec_error` documentado; PTZ ausente → `não suportado`).
- Qualquer segredo em banco/log/DOM ou listener fora do loopback **bloqueia** a
  versão.
- Itens registrados como `não suportado` devem constar em
  `docs/release/device-matrix.md` com limitação.

## Decisão

- [ ] Todos os itens obrigatórios passaram.
- [ ] Limitações registradas e permitidas pelas specs.
- [ ] Versão considerada pronta para estável.

Responsável e data: ______________________
