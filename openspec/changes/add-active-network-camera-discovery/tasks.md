# Tasks

## 1. Descoberta ativa e sondagem de serviços

- [x] 1.1 Implementar cálculo validado da faixa IPv4 da interface selecionada, com limites de tamanho da sub-rede, e verificar casos de máscara, faixa inválida e limite em testes unitários
- [x] 1.2 Implementar detecção concorrente e cancelável de hosts ativos, sem sondar portas em hosts inativos; verificar timeout, cancelamento e limite de concorrência com simuladores
- [x] 1.3 Implementar sondagem limitada das portas comuns de câmera em hosts ativos e fingerprint seguro de HTTP(S), ONVIF e RTSP; verificar portas abertas, fechadas e respostas autenticadas sem credenciais em logs
- [x] 1.4 Normalizar e agrupar resultados por host, incluindo origem, serviços reconhecidos e identidade parcial; verificar deduplicação entre descoberta multicast e ativa

## 2. Contratos e fluxo de descoberta

- [x] 2.1 Estender contratos IPC, preload e validação main para iniciar/cancelar descoberta ativa e retornar resultados normalizados; verificar typecheck dos processos main e renderer
- [x] 2.2 Atualizar a tela de descoberta com modo de varredura da sub-rede, progresso, cancelamento e estados de host sem serviço reconhecido; verificar o fluxo com smoke de interface
- [x] 2.3 Direcionar resultados de ONVIF, RTSP ou HTTP(S) reconhecidos à etapa de credenciais e configuração automática sem pular para o formulário; verificar descoberta com identidade parcial e credenciais exigidas
- [x] 2.4 Manter configuração por IP e URL manual como fallback para hosts não reconhecidos; atualizar README e verificar o caminho documentado e o layout responsivo

## 3. Validação integrada

- [x] 3.1 Adicionar regressões para faixa de rede, hosts ativos, portas de câmera, cancelamento, deduplicação e proteção de credenciais; verificar `npm test`
- [x] 3.2 Executar smoke do formulário, typecheck, lint e build após integrar o fluxo; verificar `node scripts/camera-form-smoke.mjs`, `npm run typecheck`, `npm run lint` e `npm run build`
