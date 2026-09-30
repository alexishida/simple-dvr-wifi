# Validação de PTZ

## Automática

`npm run test:ptz` valida no simulador SOAP ONVIF a listagem, criação,
substituição, movimentação e remoção de presets, além dos movimentos PTZ e do
tratamento de falhas SOAP.

As mudanças de layout são independentes da sessão de gravação: a regressão
valida que a reorganização somente altera slots de visualização e conserva o
estado de gravação da câmera.

## Hardware compatível

Não há uma câmera PTZ física disponível neste ambiente. Antes de disponibilizar
uma versão, executar a matriz física de `tasks.md` R.2, registrando modelo,
firmware, suporte a presets e qualquer limitação observada.
