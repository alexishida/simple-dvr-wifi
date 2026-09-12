## Why

A biblioteca permite abrir e excluir arquivos, mas localizar um acontecimento e examinar capturas exige navegação repetitiva. A evolução deve reunir busca temporal, inspeção e organização no aplicativo.

## What Changes

- Filtros temporais, ordenação, agrupamento por dia, grade/lista, densidade e paginação configurável, atualização automática.
- Cards consistentes, estados explícitos, visualizador de snapshots com zoom, navegação e comparação.
- Reprodução com captura de frame vinculada à origem e exportação de trecho; linha do tempo por câmera.
- Favoritos, etiquetas, observações, proteção, seleção múltipla, exportação e abertura da pasta.
- Retenção opcional por idade e espaço, preservando itens protegidos e gravações ativas.

## Capabilities

### New Capabilities
- `media-library`: Busca, visualização, exportação, organização e retenção de mídia local.

### Modified Capabilities

Nenhuma especificação principal existente.

## Impact

Renderer, preload, handlers IPC, serviços locais e migração aditiva SQLite. Reutiliza FFmpeg empacotado e componentes/tokens existentes; sem novas dependências.
