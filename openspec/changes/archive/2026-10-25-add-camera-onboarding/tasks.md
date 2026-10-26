# Tasks

## 1. Serviço de configuração por IP

- [x] 1.1 Definir contratos IPC compartilhados para tentativa de configuração automática por IP/hostname e verificar typecheck dos processos main e renderer
- [x] 1.2 Implementar candidatos ONVIF limitados ao host informado, com timeout total, cancelamento após sucesso e sem varredura de rede; verificar testes unitários dos candidatos
- [x] 1.3 Reutilizar detecção ONVIF, URI de stream, presets confiáveis e probe RTSP para retornar somente streams validados; verificar casos de URI ONVIF, fallback de modelo e falha
- [x] 1.4 Proteger mensagens e logs contra exposição de senhas ou URLs com credenciais; verificar smoke/regressão de sanitização aplicável

## 2. Fluxo de cadastro guiado

- [x] 2.1 Criar a tela inicial de escolha entre detectar na rede, configurar por IP e adicionar URL manualmente; verificar os três caminhos em teste de interface
- [x] 2.2 Adaptar a descoberta ONVIF existente para solicitar credenciais e configurar automaticamente a câmera selecionada; verificar resultado bem-sucedido com o simulador ONVIF
- [x] 2.3 Criar o fluxo por IP/hostname com endereço e credenciais, estados de progresso, identidade detectada e confirmação de stream validado; verificar sucesso, credencial inválida e timeout
- [x] 2.4 Encaminhar falhas de automação à configuração manual, preservando endereço e dados não sensíveis descobertos; verificar que o formulário abre pré-preenchido e permite concluir com URL RTSP manual
- [x] 2.5 Manter URLs RTSP e ONVIF como configuração avançada nos caminhos automáticos e documentar os três métodos de cadastro no README; verificar o texto e links/documentação renderizados

## 3. Regressão e validação integrada

- [x] 3.1 Atualizar os testes de formulário e regressões de câmera para cobrir escolha inicial, descoberta automática, configuração por IP e fallback manual; verificar `node scripts/camera-form-regression.mjs` e `npm test`
- [x] 3.2 Executar typecheck, lint e build após integrar renderer, preload e main; verificar `npm run typecheck`, `npm run lint` e `npm run build`
