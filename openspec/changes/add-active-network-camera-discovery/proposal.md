# Proposal

## Why

A descoberta atual depende exclusivamente de respostas multicast ONVIF, por
isso não encontra câmeras que não anunciam esse protocolo. A busca precisa
partir de IPs ativos da rede local e então verificar serviços de câmera no host
que efetivamente respondeu.

## What Changes

- Adicionar descoberta ativa de hosts IPv4 na sub-rede da interface escolhida.
- Sondar, somente nos hosts ativos, uma lista limitada de portas comuns de
  câmera e identificar serviços ONVIF, RTSP e HTTP/HTTPS quando possíveis.
- Tentar obter fabricante e modelo por protocolos disponíveis, solicitando
  credenciais somente quando forem necessárias.
- Exibir resultados reconhecidos para a etapa existente de configuração
  automática e manter URL manual como fallback.
- Informar claramente quando um host ativo não oferece um serviço de câmera
  reconhecido; não prometer suporte universal a protocolos proprietários.

## Capabilities

### New Capabilities

- `network-camera-discovery`: descoberta ativa, limitada e cancelável de hosts
  de câmera na rede local e seus serviços acessíveis.

### Modified Capabilities

- `camera-onboarding`: fazer a opção de detecção automática usar os resultados
  de descoberta de rede, incluindo hosts sem anúncio multicast ONVIF.

## Impact

- Main/preload/shared: novos contratos IPC, scanner de hosts e sondagem de
  portas com limites de concorrência e tempo.
- Renderer: estado, progresso e resultados do fluxo de descoberta.
- Testes: simulações de hosts ativos, portas abertas, cancelamento, limites e
  encaminhamento ao cadastro automático.
