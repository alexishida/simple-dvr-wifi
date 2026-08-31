# Binários de mídia (MediaMTX / FFmpeg)

Este diretório recebe os binários de mídia redistribuídos por plataforma. Eles são
empacotados **fora do asar** via `extraResources` no `electron-builder.yml` e
iniciados somente pelo caminho empacotado conhecido, após validação de hash.

Estrutura esperada:

```text
resources/
├── media-binaries.json
├── mediamtx/
│   ├── win32/mediamtx.exe
│   └── linux/mediamtx
└── ffmpeg/
    ├── win32/ffmpeg.exe
    └── linux/ffmpeg
```

A versão, origem, SHA-256 do arquivo efetivo e obrigações de licença de cada
binário são registradas em `media-binaries.json` (fonte da validação em runtime)
e no relatório de decisão `docs/decisions/dependency-spike-windows.md`. Nenhum
binário é adicionado sem hash validado e sem aprovação de licença.

## MediaMTX (aprovado)

`resources/mediamtx/win32/mediamtx.exe` v1.20.0 está integrado. O hash do
arquivo efetivo (`6149B185...`) é fixado no manifesto e validado em runtime pelo
aplicativo antes de iniciar o sidecar. Verificação local:

```powershell
npm run verify:binaries
```

## FFmpeg (pendente)

Nenhum binário FFmpeg está no repositório. A redistribuição permanece bloqueada
até a aprovação de licença (somente build LGPL sem `--enable-gpl`/`--enable-nonfree`)
e a fixação de versão, origem e hash. O gate de release
(`npm run release:gate`) impede a publicação enquanto o status for `pending`.

## Validação em runtime

O aplicativo lê `media-binaries.json` (empacotado em `resources/` na instalação)
e usa o `fileSha256` do componente `mediamtx` da plataforma atual como hash
esperado, a menos que `MEDIAMTX_EXPECTED_SHA256` esteja definido (override).
Se o hash não conferir, a sessão de mídia falha com estado seguro
(`crashed`/`Hash do MediaMTX não confere`) e o binário não é executado.
