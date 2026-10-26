# Proposal

## Why

O cadastro atual expõe URLs e opções técnicas antes que o aplicativo tente
usar as informações que uma câmera ONVIF já fornece. Isso torna a primeira
configuração desnecessariamente difícil e leva operadores a procurar URLs RTSP
manualmente, mesmo em equipamentos que poderiam ser configurados pelo app.

## What Changes

- Substituir a entrada inicial de cadastro por uma escolha entre detectar
  automaticamente na rede, configurar por IP e adicionar por URL manual.
- Permitir que a configuração por IP use endereço, usuário e senha para tentar
  localizar um endpoint ONVIF e configurar o stream automaticamente.
- Nos fluxos automáticos, identificar fabricante e modelo, obter e validar o
  stream RTSP anunciado por ONVIF e usar apenas fallbacks de modelo confiáveis
  quando necessários.
- Encaminhar a pessoa para o cadastro manual de URL quando a automação não
  encontrar um stream utilizável, preservando os dados já descobertos.
- Manter a configuração manual como uma opção inicial e avançada, para câmeras
  sem suporte ou compatibilidade automática.

## Capabilities

### New Capabilities

- `camera-onboarding`: fluxo guiado para descobrir, configurar automaticamente
  e cadastrar câmeras, com fallback manual.

### Modified Capabilities

- Nenhuma.

## Impact

- Renderer: tela de câmeras, tela/formulário de cadastro e mensagens de
  resultado.
- Main/preload/shared: contrato IPC e serviço de tentativa de configuração por
  IP, incluindo candidatos ONVIF seguros e limitados.
- Testes de formulário, descoberta, ONVIF, RTSP e regressões de segurança.
