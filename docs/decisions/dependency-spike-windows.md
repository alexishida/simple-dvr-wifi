# Spike de dependências — Windows x64

Data: 2026-08-30  
Escopo: primeira entrega para Windows 10/11 x64; Linux fica fora desta mudança.

## Ambiente reproduzido

- Host: Windows x64, Node.js `25.4.0`, npm `11.8.0`.
- Runtime da aplicação: Electron `44.0.0`, Node embarcado `24.18.1` e ABI
  nativa `149`.
- Comandos executados:

```powershell
npm install better-sqlite3@13.0.3 onvif@0.8.2
npx electron-builder install-app-deps
$env:ELECTRON_RUN_AS_NODE = '1'
.\node_modules\electron\dist\electron.exe --eval "require('better-sqlite3')"
```

O teste abriu um banco SQLite em memória, criou/consultou uma tabela e confirmou
o carregamento do driver reconstruído pela ABI do Electron. Também confirmou que
`Cam` é exportado por `onvif@0.8.2`.

## Decisão

| Componente | Versão/fonte aprovada                                           | Licença                                        | Resultado do spike                                                                                                                            | Decisão                                                                                                                                               |
| ---------- | --------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQLite     | `better-sqlite3@13.0.3`                                         | MIT                                            | Compatível com Node >=22 e carregado com ABI Electron 149                                                                                     | Adotar; reconstruir em todo build empacotado.                                                                                                         |
| ONVIF      | `onvif@0.8.2`                                                   | MIT                                            | Exporta a API compatível `Cam`; atende descoberta, mídia e PTZ iniciais                                                                       | Adotar atrás de `CameraAdapter`.                                                                                                                      |
| MediaMTX   | release oficial `v1.20.0`, `mediamtx_v1.20.0_windows_amd64.zip` | MIT                                            | Executável respondeu `v1.20.0`; SHA-256 do ZIP `7364E7672E6B4420E986EC4B56E2CC32EC7B4085F69B56EC224D596D0FA8B19F`, igual ao manifesto oficial | Aprovar para integração posterior, sempre fora do `asar`, com hash fixado.                                                                            |
| FFmpeg     | build Windows LGPL a ser fixado em manifesto de release         | LGPL-2.1-or-later, salvo componentes opcionais | Não há binário no repositório nem no pacote nesta etapa                                                                                       | Aprovar somente um build LGPL sem `--enable-gpl` ou `--enable-nonfree`; fixar versão, origem, SHA-256 e fontes correspondentes antes de redistribuir. |

O hash de MediaMTX foi validado contra `checksums.sha256` da release oficial. O
artefato usado no spike permaneceu no diretório temporário do sistema e não foi
incluído nos recursos da aplicação.

## Integração do binário MediaMTX

Em 2026-08-30, o `mediamtx.exe` extraído de
`mediamtx_v1.20.0_windows_amd64.zip` (SHA-256 do ZIP validado contra o
manifesto oficial) foi adicionado em `resources/mediamtx/win32/mediamtx.exe`.
O SHA-256 do arquivo efetivo é fixado em `resources/media-binaries.json`
(`6149B1854800295CC2578BCFC20DFB965F4B2FD5ACFE7B3D3D41FE2F5CBD38DF`) e usado
como hash esperado em runtime (`expectedMediaMtxHashFromManifest`), empacotado
em `resources/media-binaries.json` na instalação. A validação é obrigatória por
padrão; `MEDIAMTX_EXPECTED_SHA256` permanece como override.

Verificação local: `npm run verify:binaries` e `npm run smoke:package`.

## Limites de codec e conformidade

- MediaMTX encaminha o stream; não transforma automaticamente H.265/MJPEG em
  um formato reproduzível pelo Chromium.
- FFmpeg será chamado sem shell e somente para fallback/remux/transcodificação
  permitidos. H.264 direto é a preferência do MVP.
- A distribuição de FFmpeg exige revisar a configuração exata e os avisos de
  licença. Builds GPL, `nonfree`, `libx264` e `libx265` não entram sem nova
  aprovação de licença.
- H.264/H.265 podem envolver patentes conforme a jurisdição; isso permanece
  registrado como risco de release e não como promessa de suporte universal.

## Aprovação

Esta decisão está aprovada para a implementação desta mudança pelo responsável
da mudança OpenSpec: o usuário confirmou a aplicação do escopo Windows em
2026-08-30. A aprovação autoriza os dois pacotes npm e o uso de MediaMTX na
integração. Não autoriza redistribuir FFmpeg até que seu artefato verificável e
suas obrigações de licença sejam adicionados ao inventário de release.

## Fontes

- [Electron ABI no runtime local](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)
- [MediaMTX releases e verificações](https://github.com/bluenviron/mediamtx/releases)
- [Licença do MediaMTX](https://mediamtx.org/docs/misc/license)
- [ONVIF para Node.js](https://github.com/agsh/onvif)
- [Considerações legais do FFmpeg](https://ffmpeg.org/legal.html)
- [Variantes LGPL do BtbN FFmpeg Builds](https://github.com/BtbN/FFmpeg-Builds)
