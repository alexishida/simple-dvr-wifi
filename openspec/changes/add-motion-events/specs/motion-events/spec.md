# Requisitos de eventos de movimento

## Requisito: compatibilidade explícita

O sistema DEVE manter o modo de movimento indisponível para uma câmera até que
o Event Service e os tópicos recebidos sejam confirmados. Câmeras sem suporte
DEVEM continuar aptas a gravação manual e agendada.

## Requisito: dados mínimos de validação

O sistema DEVE registrar modelo, firmware, método de assinatura, tópicos e
resultado de reconexão antes de declarar uma câmera compatível.
