# Tarefas

- [x] Verificar suporte atual e documentar a matriz de compatibilidade.
- [x] Implementar Event Service/PullPoint e simulador de eventos. PullPoint cria, renova e cancela assinaturas no processo principal; a ativação é tentada somente para câmeras ativas com ONVIF e falhas não criam sessão persistente.
- [x] Persistir eventos normalizados e deduplicados. PullMessages alimenta o parser, normalizador e SQLite; o vínculo com a mídia será aplicado pelo modo de gravação por evento.
- [ ] Adicionar modo de gravação por evento e pré-buffer limitado.
- [ ] Exibir marcadores e filtros na biblioteca.
- [ ] Cobrir queda de assinatura, eventos repetidos e hardware compatível.
