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

| Plataforma     | Versão do SO | Pacote/versão | Instalado (ok) | Abre (ok) | Banco (ok) | Mídia (ok) | Sem internet (ok) | Evidência |
| -------------- | ------------ | ------------- | -------------- | --------- | ---------- | ---------- | ----------------- | --------- |
| Windows 10 x64 |              |               |                |           |            |            |                   |           |
| Windows 11 x64 |              |               |                |           |            |            |                   |           |

## Checklist manual

- [ ] O instalador NSIS executa sem a necessidade de Node.js ou SDK.
- [ ] O atalho do menu iniciar/área de trabalho abre o aplicativo.
- [ ] A tela inicial (dashboard) carrega sem configuração técnica manual.
- [ ] O binário MediaMTX está presente em `resources/mediamtx/win32/` na
      instalação (hash validado pelo gate de binários).
- [ ] Banco SQLite é criado no perfil de usuário sem erro.
- [ ] Com a rede desconectada, o aplicativo abre e permanece funcional
      (dashboard, configurações) sem erros de rede não autorizados.
- [ ] Nenhum processo órfão permanece após fechar o aplicativo.
- [ ] Capturas/screenshots anexadas e caminho da evidência registrado.
