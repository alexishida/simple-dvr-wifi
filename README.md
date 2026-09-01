# Simple DVR Wi-Fi

Monitoramento local de câmeras IP/Wi-Fi no Windows. O aplicativo é um desktop
Electron + React + TypeScript para descobrir e cadastrar câmeras ONVIF/RTSP,
acompanhar vídeo ao vivo, controlar PTZ compatível, capturar snapshots e gravar
localmente. Credenciais permanecem cifradas no computador do usuário.

> **Escopo atual:** Windows 10/11 (x64). A arquitetura preserva fronteiras de
> plataforma para uma futura porta Linux, mas o suporte Linux **não faz parte**
> desta versão.

---

## Funcionalidades

- **Descoberta WS-Discovery** por interface de rede (Ethernet, Wi-Fi, VPN, virtual),
  com progresso, cancelamento e deduplicação por dispositivo.
- **Cadastro manual** por URL RTSP/ONVIF, com verificação de conexão e
  persistência de endpoints descobertos.
- **Interoperabilidade ONVIF/RTSP** tolerante a implementações incompletas:
  capacidades e perfis normalizados como `supported` / `unsupported` / `unknown` / `error`.
- **Vídeo ao vivo de baixa latência** (WebRTC/WHEP via MediaMTX em loopback),
  com layouts 1/4/9/16, fullscreen e troca main/substream.
- **Controle PTZ** condicionado às capacidades: movimentação contínua, zoom e
  parada de segurança com lease renovável.
- **Snapshots** pelo endpoint da câmera ou fallback FFmpeg.
- **Gravação local** segmentada (fMP4) com sessões catalogadas e recuperação
  após falhas.
- **Persistência segura**: SQLite com migrações, backup pré-migração e
  credenciais cifradas com AES-256-GCM sob chave envolvida pelo `safeStorage`
  do sistema.
- **Operação 100% local**: sem telemetria, sem atualizações automáticas, sem
  tráfego externo além das câmeras configuradas.
- **Diagnóstico sanitizado** por câmera, sem expor senhas, tokens ou URLs autenticadas.

## Requisitos

- Windows 10 ou 11 (x64)
- 4 GB de RAM recomendados; a necessidade cresce conforme a quantidade e o codec dos streams
- Espaço em disco conforme a política de gravação e snapshots
- Nenhuma ferramenta de desenvolvimento é necessária no uso final

Para detalhes sobre firewall, multicast, VLAN, VPN e limitações de codec,
veja [docs/release/requirements-windows.md](docs/release/requirements-windows.md).

### Limitações conhecidas

- O substream depende de a câmera informar um perfil secundário via ONVIF; caso
  contrário, o aplicativo usa o stream principal.
- O fallback de snapshot por RTSP requer `ffmpeg` disponível no `PATH`. O FFmpeg
  ainda não é redistribuído junto ao aplicativo.
- A compatibilidade ONVIF, RTSP, codecs e PTZ varia por fabricante e firmware.

---

## Começando (desenvolvimento)

Pré-requisitos: Node.js `>=22 <26` e npm.

```bash
# Instalar dependências
npm ci

# Reconstruir o driver SQLite nativo para a ABI do Electron
npm run rebuild:native

# Rodar em modo desenvolvimento
npm run dev

# Typecheck e lint
npm run typecheck
npm run lint

# Build (typecheck + electron-vite)
npm run build
```

## Uso básico

1. Cadastre uma câmera manualmente ou abra **Descoberta** para procurar dispositivos ONVIF na rede local.
2. Informe ou atualize as credenciais quando necessário e use **Testar** para atualizar endpoints e capacidades.
3. Abra o Dashboard para visualizar o stream; selecione tela cheia para alternar entre perfil principal e substream.
4. Use os controles do card para snapshot e gravação. Os arquivos ficam nos diretórios configurados em **Configurações**.

## Empacotamento Windows

```bash
# Reconstruir módulo nativo e empacotar instalador NSIS
npm run rebuild:native
npm run build:win
```

O instalador é gerado em `dist/Simple DVR Wi-Fi-<versão>-setup.exe`. Durante o
empacotamento:

- o driver SQLite é reconstruído para a ABI do Electron (`npm run rebuild:native`);
- o binário MediaMTX é validado por hash contra
  [resources/media-binaries.json](resources/media-binaries.json) antes de ser
  incluído (`npm run verify:binaries`);
- o gate de release bloqueia a publicação de componentes não aprovados
  (`npm run release:gate`);
- SBOM, inventário de licenças e NOTICE são gerados em `dist/release`
  (`npm run release:assets`);
- o smoke test do pacote valida abertura, banco, mídia e ausência de tráfego
  externo (`npm run smoke:package`).

## Verificações operacionais

| Comando                      | O que verifica                                              |
| ---------------------------- | ----------------------------------------------------------- |
| `npm run security:smoke`     | Abertura, CSP, preload e banco no renderer empacotado       |
| `npm run security:checklist` | Checklist de segurança/privacidade contra o build candidato |
| `npm run verify:binaries`    | Presença e hash dos binários de mídia                       |

## Scripts de release

| Comando                   | Descrição                                                  |
| ------------------------- | ---------------------------------------------------------- |
| `npm run rebuild:native`  | Rebuild do driver SQLite para a ABI Electron               |
| `npm run verify:binaries` | Valida presença e hash dos binários de mídia               |
| `npm run release:gate`    | Bloqueia release com componente não aprovado               |
| `npm run release:assets`  | Gera SBOM, licenças, NOTICE e fontes de binários           |
| `npm run smoke:package`   | Smoke test do pacote Windows empacotado                    |
| `npm run smoke:installed` | Smoke test do aplicativo instalado (defina `PACKAGED_EXE`) |

---

## Arquitetura

```
src/
├── main/          # ciclo de vida, janelas, autorização IPC e supervisão
│   ├── ipc/       # registro central de handlers validados
│   ├── security/  # CSP, navegação, paths, TLS, URLs, vault
│   ├── services/  # câmeras, credenciais, descoberta, PTZ, snapshots, gravação
│   ├── supervisors/# workers, sessões de mídia, shutdown coordenado
│   └── logging/   # logger estruturado e sanitizador
├── preload/       # API estreita exposta via contextBridge (sem ipcRenderer)
├── renderer/      # React + Zustand (estado de apresentação)
├── workers/       # database (SQLite), discovery (WS-Discovery), camera (ONVIF),
│   │              # media (MediaMTX/FFmpeg)
└── shared/        # contratos, schemas (zod), estados e erros tipados
```

Princípios de segurança:

- `sandbox`, `contextIsolation`, `nodeIntegration: false`, `webSecurity: true`
  e CSP restritiva em toda janela.
- IPC tipado com validação de schema, sender e limite de payload; o preload
  **não** expõe `ipcRenderer` nem canais arbitrários.
- MediaMTX roda em sessões locais por câmera e perfil, ligado apenas a
  `127.0.0.1`, com portas efêmeras, credenciais aleatórias por sessão e hash
  validado antes de executar.
- Credenciais persistidas apenas cifradas (AES-256-GCM); a chave fica envolvida
  pelo `safeStorage` e nunca é gravada em claro.
- FFmpeg executado sem shell, com argumentos validados e diretórios confinados.
- XML ONVIF parseado com DTD/entidades externas desabilitadas e limites de
  bytes/profundidade.

## Documentação

- [Requisitos de execução — Windows](docs/release/requirements-windows.md)
- [Matriz de validação com câmeras reais](docs/release/device-matrix.md)
- [Decisão de dependências Windows](docs/decisions/dependency-spike-windows.md)
- [Binários de mídia (MediaMTX/FFmpeg)](resources/README.md)
- Especificações e mudanças OpenSpec em [openspec/](openspec/)

## Licenciamento e cadeia de suprimentos

- Electron, React e as dependências npm têm suas licenças registradas no SBOM
  gerado por `npm run release:assets`.
- **MediaMTX** (MIT) está integrado e seu hash é validado em runtime.
- **FFmpeg** ainda **não** é redistribuído: a inclusão está bloqueada até a
  aprovação de um build LGPL sem `--enable-gpl`/`--enable-nonfree`.

Veja o gate e os avisos em [resources/media-binaries.json](resources/media-binaries.json)
e o inventário gerado em `dist/release/`.

## Status

MVP em desenvolvimento. A versão estável depende de validação operacional no
Windows e da matriz de câmeras reais por categoria.

## Licença

Distribuído sob a [Licença MIT](LICENSE).
