# Plano de implementação — Simple DVR Wi-Fi

Este arquivo organiza as próximas entregas por prioridade. Começar pela fase 0 e pela fase 1; as fases seguintes dependem dos critérios de aceite indicados. As funcionalidades descritas aqui são planejadas, não concluídas.

## Referências e regras

- Seguir [as regras oficiais](.ai-framework/RULES.md) e o [design system](.ai-framework/DESIGN.md). Botões com texto visível devem ter ícone representativo.
- Preservar alterações locais, arquitetura Electron/React/TypeScript, isolamento do renderer, contratos IPC validados e SQLite no worker.
- Reutilizar os componentes, serviços e binários existentes. Justificar qualquer dependência adicional.
- A biblioteca já possui [proposta](openspec/changes/improve-media-library/proposal.md), [design](openspec/changes/improve-media-library/design.md), [especificação](openspec/changes/improve-media-library/specs/media-library/spec.md) e [tarefas de implementação](openspec/changes/improve-media-library/tasks.md). Esses artefatos detalham o escopo da biblioteca; este arquivo organiza a sequência geral de entregas.
- Ao implementar biblioteca e retenção, manter o progresso coerente com a change `improve-media-library`. Não incluir agendamento, inteligência artificial ou acesso remoto nessa change.
- Testes que gravem ou excluam arquivos devem usar diretórios temporários e dados de teste. Não testar exclusão sobre a biblioteca real.

## Fase 0 — Preparação e validação inicial

- [x] 0.1 Revisar o estado atual do código e das changes, distinguindo funcionalidades disponíveis, parcialmente integradas e apenas planejadas.
- [x] 0.2 Executar `npm test`, `npm run build` e `npm run lint`; registrar falhas anteriores à implementação, se existirem. Concluído sem falhas em 2026-09-25.
- [x] 0.3 Preparar dados de teste com múltiplas câmeras, câmeras desativadas, gravações com vários segmentos, intervalos sem vídeo e arquivos ausentes. Fixture isolado em `scripts/media-library-fixtures.mjs`, validado pela regressão SQLite.
- [x] 0.4 Registrar uma medição reproduzível de carregamento da biblioteca, memória e quantidade de consultas com catálogos pequenos e grandes. Executar `npm run benchmark:library`; linha de base em `docs/benchmarks/media-library-baseline.md`.

**Aceite:** ambiente de teste isolado e resultado inicial documentado, permitindo comparar comportamento e desempenho após cada entrega.

## Fase 1 — Biblioteca, reprodução e exportação

**Prioridade:** alta. **Dependência:** fase 0. **Escopo detalhado:** change `improve-media-library`.

### 1A. Consulta e organização

- [x] 1.1 Adicionar filtros por câmera, data inicial/final, horário e tipo de mídia; tratar limites no fuso local e gravações que cruzam o período selecionado. O tipo de mídia é definido pelas telas separadas de Snapshots e Gravações; a consulta é filtrada no banco e recebe limites convertidos do fuso local.
- [x] 1.2 Implementar ordenação, agrupamento por dia, visualizações em grade/lista, densidade e tamanho de página configurável.
- [x] 1.3 Atualizar a biblioteca a cada dez segundos somente enquanto estiver visível, preservando filtros, seleção e página quando possível.
- [x] 1.4 Manter miniaturas limitadas à página visível e descartar respostas atrasadas após mudanças de filtro ou saída da tela.
- [x] 1.5 Criar migração aditiva e contratos para favoritos, etiquetas, observações, proteção contra exclusão e vínculo de captura com a gravação de origem.
- [x] 1.6 Implementar seleção múltipla e ações em lote com resultado individual; diferenciar favorito de arquivo protegido.

### 1B. Visualizadores e linha do tempo

- [x] 1.7 Implementar visualizador interno de snapshots com zoom, navegação anterior/próxima e comparação entre duas imagens.
- [x] 1.8 Implementar linha do tempo por câmera e dia, indicando períodos gravados, lacunas e arquivos indisponíveis.
- [x] 1.9 Permitir reprodução sequencial entre segmentos e busca por horário, sem carregar gravações inteiras na memória.
- [x] 1.10 Adicionar captura de frame durante a reprodução, registrando gravação de origem e posição temporal.
- [x] 1.11 Garantir navegação por teclado, foco acessível e encerramento dos recursos de reprodução ao fechar o visualizador.

### 1C. Exportação e ações locais

- [x] 1.12 Implementar cópia/exportação de arquivos e abertura da pasta pelo processo principal, resolvendo IDs do catálogo e validando caminhos reais.
- [x] 1.13 Implementar seleção de início/fim e exportação de trecho MP4 com FFmpeg empacotado; suportar trechos que cruzam segmentos e informar lacunas. O visualizador envia o intervalo à IPC; o concat do FFmpeg usa somente caminhos validados e relata lacunas após a exportação.
- [x] 1.14 Limitar exportação a um trabalho por vez, com duração máxima, timeout, progresso, cancelamento e limpeza de temporários. O serviço serializa trabalhos, limita trechos a duas horas, encerra após dez minutos, limpa o manifesto temporário e expõe progresso/cancelamento pela IPC.
- [x] 1.15 Impedir sobrescrita silenciosa, preservar originais e tratar destino sem permissão ou sem espaço.
- [x] 1.16 Validar filtros temporais, cancelamento, arquivos ausentes, mídia exportada e consumo de memória; comparar com a medição inicial. A regressão cobre filtros, fixture com arquivos ausentes, cancelamento/limpeza e MP4 real pelo FFmpeg empacotado; a comparação está em `docs/benchmarks/media-library-baseline.md`.

**Aceite:** localizar uma ocorrência por horário, reproduzi-la entre segmentos, capturar uma imagem e exportar um trecho sem alterar a mídia original. Favoritos, etiquetas e proteção persistem após reiniciar.

## Fase 2 — Armazenamento, retenção e alertas

**Prioridade:** alta. **Dependência:** metadados de proteção e ações de arquivo da fase 1.

- [x] 2.1 Exibir espaço livre, uso da biblioteca e consumo por câmera, evitando varreduras completas a cada renderização. A categoria Armazenamento consulta o catálogo e mantém o resultado em cache no processo principal por 30 segundos.
- [x] 2.2 Adicionar retenção opcional por idade e tamanho, desativada por padrão; manter compatibilidade com configurações antigas. A configuração persiste limites por dias e MB, com zero desativando cada limite; arquivos de configuração legados recebem os valores padrão.
- [x] 2.3 Apresentar impacto e confirmação na ativação da retenção; definir claramente a combinação dos limites e o significado de zero. A ativação confirma a política: mídia não protegida fica elegível ao ultrapassar idade ou tamanho; zero desativa o limite e ambos em zero não removem mídia.
- [x] 2.4 Implementar limpeza dos itens elegíveis mais antigos, preservando arquivos protegidos, gravações ativas e exportações em andamento. A limpeza percorre candidatos do mais antigo ao mais novo, exclui metadados protegidos e sessões ativas, e só remove o catálogo após os arquivos.
- [x] 2.5 Serializar limpeza, exclusão manual e mudanças de proteção; impedir duas execuções simultâneas da retenção. Um lock único da biblioteca coordena essas mutações no processo principal.
- [x] 2.6 Manter catálogo e arquivos coerentes diante de falhas parciais; não registrar exclusão bem-sucedida quando a remoção falhar. A retenção move arquivos para staging, restaura-os se o catálogo falhar e só confirma a remoção após todos os arquivos serem preparados.
- [x] 2.7 Criar central local de alertas para disco insuficiente, diretório inacessível, câmera desconectada e gravação interrompida, agrupando ocorrências repetidas. A central aparece em Diagnóstico, agrupa por tipo/câmera e permite dispensar ocorrências.
- [x] 2.8 Exibir a última execução da retenção, espaço liberado, falhas e situação sem candidatos elegíveis; nunca apagar mídia protegida para forçar o limite. O status aparece em Armazenamento e a seleção continua excluindo metadados protegidos.
- [x] 2.9 Testar disco cheio, destino removido, falha de permissão, proteção concorrente e câmera gravando durante a limpeza. A suíte usa probes simulados para destinos degradados e valida que a política de retenção exclui itens protegidos ou ativos.

**Aceite:** retenção só opera após ativação explícita, respeita proteção e atividade, informa falhas e não interrompe o vídeo ao vivo por erro de armazenamento.

## Fase 3 — Gravação agendada e recuperação

**Prioridade:** alta. **Dependência:** comportamento de armazenamento e alertas da fase 2. Planejar em change própria antes da implementação.

- [x] 3.1 Definir regras de gravação manual, contínua e agendada, incluindo prioridade entre elas, sobreposição de horários e câmera desativada. Definidas em `docs/scheduled-recording-plan.md`.
- [x] 3.2 Persistir agenda semanal por câmera e implementar editor com períodos que atravessam a meia-noite.
- [x] 3.3 Implementar agendador no processo principal, independente da tela aberta, sem criar sessões duplicadas.
- [x] 3.4 Reconciliar a agenda ao iniciar o aplicativo, retornar de suspensão ou mudar o relógio/fuso; registrar intervalos não gravados.
- [x] 3.5 Recuperar catálogo e arquivos após encerramento inesperado, distinguindo segmentos válidos, incompletos e ausentes.
- [x] 3.6 Retomar gravações elegíveis após retorno da câmera ou do armazenamento, respeitando cancelamento manual e desativação.
- [x] 3.7 Exibir o motivo da gravação atual, próxima programação e motivo de impedimento; indicar que a agenda exige o aplicativo em execução.
- [x] 3.8 Testar mudanças de dia, suspensão, reinício, queda de rede e concorrência entre comandos manuais e agenda.

**Aceite:** a programação inicia e encerra gravações nos intervalos definidos, recupera o estado após interrupções e informa períodos sem captura. Execução com o aplicativo fechado exige uma futura solução específica.

## Fase 4 — Operação diária e PTZ

**Prioridade:** média. Pode avançar após a fase 0, independentemente do agendamento.

- [ ] 4.1 Integrar serviço, IPC, preload e interface dos presets PTZ já parcialmente preparados.
- [ ] 4.2 Permitir listar, salvar, substituir, remover e ir para posições nomeadas, conforme as capacidades efetivas da câmera.
- [ ] 4.3 Desabilitar ações não suportadas e preservar o bloqueio de novos movimentos enquanto uma parada estiver sem confirmação.
- [ ] 4.4 Criar grupos de câmeras e layouts nomeados, com persistência e tratamento de câmeras removidas ou desativadas.
- [ ] 4.5 Exibir métricas disponíveis de conexão, perfil, resolução, codec e quadros perdidos; sinalizar métricas indisponíveis sem inventar valores.
- [ ] 4.6 Validar uso de substream na grade, stream principal em tela cheia e liberação de recursos invisíveis, preservando a gravação.
- [ ] 4.7 Adicionar histórico local de quedas e falhas de gravação, com diagnóstico exportável sem senhas, tokens ou URLs autenticadas.
- [ ] 4.8 Validar presets em simulador e hardware compatível, além de mudanças de layout durante gravação.

**Aceite:** posições PTZ e layouts sobrevivem ao reinício; controles refletem as capacidades reais; mudanças de visualização não duplicam sessões nem interrompem gravações.

## Fase 5 — Eventos de movimento

**Prioridade:** média. **Dependência:** gravação, linha do tempo e alertas estabilizados. Planejar em change própria.

- [ ] 5.1 Verificar suporte a eventos ONVIF nos modelos disponíveis e documentar compatibilidade real.
- [ ] 5.2 Implementar assinatura, renovação e reconexão de eventos, com cancelamento ao desativar ou remover a câmera.
- [ ] 5.3 Normalizar e persistir eventos de início/fim de movimento, controlando duplicatas e diferenças de relógio.
- [ ] 5.4 Adicionar modo de gravação por evento, com intervalo mínimo e tempo configurável após o último movimento.
- [ ] 5.5 Implementar buffer limitado para pré-gravação e informar o custo de manter o stream ativo antes de eventos.
- [ ] 5.6 Exibir marcadores na linha do tempo e filtros por ocorrência, vinculando cada evento aos trechos disponíveis.
- [ ] 5.7 Testar eventos repetidos, ausência de evento de término, perda de assinatura e câmera sem suporte.

**Aceite:** um evento compatível gera gravação e marcador consultável, respeitando limites de recursos e sem afetar outras câmeras. Câmeras sem suporte continuam com gravação manual/agendada.

## Fase 6 — Evoluções posteriores

Cada item exige escopo e critérios de aceite próprios antes de começar.

- [ ] 6.1 Backup/restauração pela interface: configurações e catálogo, verificação de integridade, prévia de conflitos e estratégia explícita para credenciais vinculadas ao computador. Distinguir backup de configuração de backup dos vídeos.
- [ ] 6.2 Reprodução sincronizada: múltiplas câmeras no mesmo horário, com tratamento de lacunas, diferenças de relógio e limites de decodificação.
- [ ] 6.3 Avaliar detecção local de pessoas/veículos: medir consumo de CPU/GPU, compatibilidade e licença do modelo antes de escolher a implementação.
- [ ] 6.4 Se a avaliação for viável, implementar inferência com frequência e concorrência limitadas, zonas configuráveis e eventos pesquisáveis, mantendo funcionamento sem envio de imagens à nuvem.

## Validação de cada entrega

- [x] V.1 Executar testes de regressão pertinentes e adicionar cobertura para novos comportamentos e falhas relevantes. Inclui filtros de data/hora e sobreposição de gravações.
- [x] V.2 Executar `npm run build` e `npm run lint`; a compilação inclui a checagem de tipos.
- [ ] V.3 Executar testes de integração afetados: player, PTZ/ONVIF, segurança Electron e fluxos novos de biblioteca.
- [ ] V.4 Verificar IPC, caminhos, cancelamento, ausência de credenciais em logs e encerramento de processos/recursos temporários.
- [ ] V.5 Registrar resultados, limitações e mudanças de comportamento no changelog e na documentação pertinente.

Repetir esta validação para cada entrega; marcar uma fase como concluída somente após atender ao seu aceite.

## Aceite antes de disponibilizar uma versão

- [ ] R.1 Instalar o pacote em Windows suportado sem Node.js e verificar funcionamento local sem internet.
- [ ] R.2 Executar a matriz com câmeras reais RTSP, ONVIF e PTZ disponíveis; registrar modelo, firmware e limitações.
- [ ] R.3 Realizar teste prolongado de pelo menos 24 horas com múltiplas câmeras, gravação, queda/retorno e minimização/restauração.
- [ ] R.4 Comparar memória, CPU, processos e espaço em disco no início e no fim; investigar crescimento progressivo ou perda de gravações.
- [ ] R.5 Atualizar os itens de aceite pendentes na change do MVP com evidências, sem considerar testes simulados como substitutos dos testes físicos.
