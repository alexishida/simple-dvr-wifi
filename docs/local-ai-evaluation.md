# Avaliação de detecção local

Data: 2026-09-30.

Não há runtime de inferência, modelo de pessoas/veículos, origem verificável ou
licença aprovada no projeto. O manifesto de binários de mídia já mantém o FFmpeg
como pendente de aprovação, e acrescentar um modelo sem definir redistribuição,
atualizações e termos de uso ampliaria esse risco.

O smoke test Electron confirma os recursos de GPU do Chromium para vídeo, mas
isso não determina compatibilidade com um runtime de inferência nem permite
medir CPU, GPU, memória, latência ou consumo térmico de um modelo inexistente.
Não foram feitos downloads, chamadas em nuvem ou inferências em imagens de
câmera.

Resultado: a implementação não é viável nesta versão. Antes de reabrir o tema,
é necessário aprovar um modelo e runtime redistribuíveis, sua licença, os
dispositivos-alvo e um protocolo de medição com streams H.264/H.265 reais. A
execução deve permanecer local, com frequência e concorrência limitadas e sem
enviar imagens à nuvem.
