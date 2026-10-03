# Plano de implementação

Criado em: 2026-09-30.

Este arquivo organiza seis funcionalidades solicitadas. As caixas representam
trabalho futuro; criar este plano não significa que os recursos foram implementados.

## Base existente e regras comuns

O projeto já possui cadastro manual, integração ONVIF/RTSP, vídeo ao vivo,
gravação manual e agendada, eventos de movimento ONVIF, pré-buffer, biblioteca,
linha do tempo, exportação de trechos e importação do cartão SD da Mibo iM4-C.
Reutilizar esses fluxos, distinguindo movimento informado pela câmera de detecção
realizada pela IA. Suporte implementado deve ser separado de suporte validado em
câmeras físicas.

- [ ] Seguir `.ai-framework/RULES.md` e, nas telas, `.ai-framework/DESIGN.md`; incluir ícone em todo botão com texto.
- [ ] Preservar a separação entre main, preload, renderer e workers, com contratos IPC específicos e validados.
- [ ] Manter credenciais cifradas e fora dos logs; executar análise de imagens localmente por padrão.
- [ ] Usar migrações compatíveis com os dados atuais e revisar backup/restauração quando novos dados persistidos forem adicionados.
- [ ] Registrar compatibilidade por modelo, firmware, codec e hardware, sem presumir recursos pela marca ou pela presença de ONVIF.

## 1. Descoberta automática na rede

Objetivo: localizar câmeras ONVIF e aproveitar o formulário existente para cadastrá-las.

- [x] Implementar descoberta WS-Discovery com prazo máximo, cancelamento e limites de respostas.
- [x] Enumerar interfaces IPv4 de rede e permitir selecionar uma interface ou todas; VPNs e interfaces virtuais aparecem somente se fornecerem IPv4 não interno.
- [x] Validar e normalizar respostas e endpoints anunciados antes de realizar consultas adicionais.
- [x] Deduplicar dispositivos encontrados por identificador e endpoint e indicar endereços já cadastrados.
- [x] Adicionar a ação "Buscar câmeras", com estados de busca, resultado vazio, falha e cancelamento.
- [x] Preencher o cadastro ao selecionar um dispositivo; o formulário continua permitindo informar credenciais e testar a conexão antes de salvar.
- [x] Na edição, testar com a credencial salva quando a senha estiver vazia, exigir senha para outro endereço/usuário e validar digitação e envio de uma nova senha pelo formulário.
- [x] No teste de conexão, usar identidade e GetStreamUri ONVIF para preencher uma URL RTSP validada; tentar a referência por marca/modelo somente para correspondências específicas.
- [x] Manter cadastro manual e explicar limitações de multicast, VLAN e firewall sem alterar regras do sistema silenciosamente.
- [x] Testar automaticamente múltiplas interfaces, respostas duplicadas ou inválidas, cancelamento e ausência de dispositivos.
- [ ] Validar com câmera física múltiplas interfaces, respostas duplicadas ou inválidas, cancelamento e ausência de dispositivos.

**Concluído quando:** uma câmera compatível aparece na busca, pode ser cadastrada
e conectada sem digitar seu endereço, e buscas sem resultado não bloqueiam o app.

## 2. Ouvir e gravar áudio

Objetivo: reproduzir e preservar áudio disponível nas câmeras. Comunicação por
microfone/interfone fica fora desta etapa.

- [x] Registrar o codec de áudio anunciado pelos perfis ONVIF e documentar a matriz de compatibilidade do pipeline de mídia.
- [ ] Confirmar presença e codec efetivos em cada stream com câmeras físicas.
- [x] Corrigir leitura de perfis ONVIF sem `AudioEncoderConfiguration`: campos opcionais ausentes não descartam os perfis nem ocultam PTZ; regressão cobre URIs e token usado nos comandos. Evidências em `docs/intelbras-im4-c-validation.md`.
- [x] Definir passagem direta ou conversão de áudio conforme compatibilidade; limitar conversões simultâneas e verificar dependências de distribuição.
- [x] Habilitar recepção de áudio no player e adicionar volume e mute por câmera, respeitando a interação exigida para reprodução.
- [x] Iniciar câmeras silenciadas e definir qual câmera pode ser ouvida na grade, tela cheia e reprodução sincronizada.
- [ ] Separar a preferência de ouvir da preferência de gravar áudio; silenciar o player não deve modificar uma gravação.
- [x] Preservar áudio nas gravações manuais, agendadas e por evento, nos segmentos e no pré-buffer quando habilitado.
- [x] Preservar áudio na exportação de trechos quando a origem o fornecer; a gravação original e a importação dependem de a origem entregar uma faixa compatível.
- [x] Tratar câmera sem áudio ou codec incompatível sem interromper o vídeo, mostrando a limitação na interface.
- [ ] Testar sincronismo de áudio/vídeo, reconexão, mudança de stream, continuidade entre segmentos e reprodução dos arquivos exportados.

**Concluído quando:** é possível ouvir uma câmera compatível e reproduzir/exportar
suas gravações com áudio sincronizado, mantendo funcionamento de câmeras só com vídeo.

## 3. Cartão SD de outros modelos

Objetivo: ampliar a consulta e importação existentes, preservando o funcionamento
da Intelbras Mibo iM4-C.

- [x] Definir os próximos modelos e firmwares a validar; avaliar a Tapo C200 mencionada no README como candidata, sem presumir acesso ao histórico.
- [x] Investigar, por modelo, os serviços de busca e reprodução disponíveis, priorizando padrões interoperáveis quando suportados.
- [x] Identificar requisitos de autenticação e se o acesso pode funcionar localmente; documentar limitações antes de implementar cada integração.
- [x] Consultar os serviços anunciados pela C200 física (firmware 1.3.17 informado): RTSP acessível com autenticação; ONVIF sem Recording/Search/Replay nas respostas não autenticadas. Evidências em `docs/sd-card-support-plan.md`.
- [x] Confirmar com o usuário a existência de gravações no microSD da C200 (2026-10-03).
- [x] Repetir a consulta autenticada na C200: identidade e firmware `1.3.17 Build 260112 Rel.54862n(4555)` confirmados, RTSP principal acessível e Recording/Search/Replay ausentes.
- [ ] Confirmar a revisão de hardware da C200 e validar um caminho de acesso ao histórico antes de anunciar suporte ao cartão SD.
- [x] Separar a integração Mibo existente em um adaptador e estabelecer um contrato comum para capacidades, listagem e importação.
- [x] Consultar a iM4-C física com credenciais salvas: identidade/firmware, dois perfis H.264 na resposta XML e RTSP principal autenticado confirmados; histórico ONVIF não anunciado. Não inclui teste da API Mibo de cartão SD.
- [ ] Implementar um novo adaptador por vez, selecionado por capacidades ou identificação validada, com indicação explícita de modelo não suportado.
- [x] Permitir credenciais específicas do serviço quando necessárias, mantendo-as cifradas e separadas de ONVIF/RTSP.
- [ ] Normalizar datas, fuso horário, duração e identificadores; impedir duplicação de importações na biblioteca.
- [ ] Adicionar progresso, cancelamento, limites de tamanho e concorrência; tratar perda de conexão, falta de espaço e arquivos parciais.
- [ ] Integrar conversão/importação ao catálogo atual, preservando áudio quando disponível e suportado pelo item 2.
- [ ] Criar testes dos adaptadores e validar busca por dia, importação e reprodução com cada modelo físico anunciado como suportado.

**Concluído quando:** pelo menos um modelo adicional validado permite buscar e
importar vídeos pela aba Cartão SD, sem regressão da Mibo iM4-C. Registrar exatamente
quais modelos e firmwares foram testados.

## 4. IA: detectar pessoas e veículos

Objetivo: analisar vídeo no computador e registrar pessoas e veículos, sem exigir
IA embarcada na câmera.

- [ ] Registrar hardware-alvo, quantidade de câmeras, resolução e orçamento de CPU, GPU, memória e latência.
- [ ] Reavaliar `docs/local-ai-evaluation.md` e selecionar modelo e runtime com origem, versão, classes e condições de redistribuição verificadas.
- [ ] Fazer uma prova de conceito local com vídeos representativos antes de integrar o recurso ao aplicativo.
- [ ] Definir instalação e versionamento do modelo, validação de integridade e comportamento quando arquivos estiverem ausentes ou incompatíveis.
- [ ] Executar inferência em processo separado, com tempo limite, recuperação de falhas e sem bloquear interface, vídeo ou gravação.
- [ ] Extrair quadros preferencialmente do substream, reutilizando sessões quando possível; limitar frequência, resolução, fila e concorrência, descartando quadros atrasados.
- [ ] Começar o benchmark com uma câmera e amostragem configurável de 1–3 quadros por segundo; ajustar conforme medições, sem prometer capacidade antes dos testes.
- [ ] Adicionar ativação por câmera, classes desejadas e limiar de confiança; mapear explicitamente quais classes contam como veículos.
- [ ] Persistir eventos com câmera, classe, confiança, horário do quadro analisado, horário de processamento e região detectada; consolidar detecções repetidas.
- [ ] Exibir marcações opcionais no vídeo e filtros/eventos na biblioteca, distinguindo IA de movimento ONVIF.
- [ ] Medir precisão, falsos positivos, objetos não detectados e consumo em cenas diurnas/noturnas, múltiplas câmeras e reconexões.

**Concluído quando:** uma câmera pode gerar eventos locais de pessoa/veículo,
consultáveis na biblioteca, e falhas ou sobrecarga da IA não interrompem o DVR.
Publicar os limites medidos e atualizar a avaliação de IA com o resultado.

## 5. IA: cruzamento de linha

Dependência: detecção e horários de eventos do item 4.

Objetivo: gerar eventos quando pessoas ou veículos atravessarem uma linha definida
na imagem, com indicação de direção.

- [ ] Implementar rastreamento temporal para associar detecções ao mesmo objeto, com expiração de trajetórias e limites de memória.
- [ ] Adicionar editor de linha por câmera, com pontos em coordenadas normalizadas e indicação visual das direções A → B e B → A.
- [ ] Permitir selecionar classes e direção de interesse, além de ativar/desativar cada regra.
- [ ] Definir o ponto de referência do objeto e detectar cruzamento do segmento desenhado, não de sua extensão infinita.
- [ ] Aplicar margem e confirmação temporal para reduzir eventos duplicados causados por oscilação junto à linha.
- [ ] Tratar perda de rastreamento, oclusão e reconexão sem criar cruzamentos artificiais; reiniciar trajetórias quando necessário.
- [ ] Invalidar trajetórias durante movimentação PTZ e definir como revalidar linhas após mudança de enquadramento ou perfil de vídeo.
- [ ] Persistir câmera, regra, classe, direção e instante do cruzamento e apresentar o evento na biblioteca.
- [ ] Testar as duas direções, aproximação sem cruzamento, objetos simultâneos, baixa frequência de quadros e movimentos rápidos.

**Concluído quando:** cruzamentos válidos geram eventos com direção correta,
sem repetição por oscilação, e limitações por enquadramento/amostragem ficam documentadas.

## 6. IA: gravação por detecção

Dependências: item 4; item 5 para gatilhos de cruzamento de linha.

Objetivo: iniciar e prolongar gravações a partir dos eventos de IA, aproveitando
o gravador, o pré-buffer e o catálogo existentes.

- [ ] Adicionar regras por câmera para gravar por pessoa, veículo ou cruzamento de linha, com ativação explícita.
- [ ] Definir horários de atividade, pré-gravação, pós-gravação e intervalo de consolidação por regra/câmera.
- [ ] Adaptar o pré-buffer existente para funcionar com IA mesmo quando o movimento ONVIF estiver desativado, evitando buffers duplicados.
- [ ] Encaminhar gatilhos ao controle central de gravação, garantindo uma sessão por câmera e associação dos diferentes motivos à mesma gravação.
- [ ] Definir precedência entre manual, agenda, movimento ONVIF e IA; um gatilho encerrado não pode parar uma gravação ainda necessária por outro motivo.
- [ ] Prolongar gravações enquanto houver detecções relevantes e encerrar após o período configurado, tratando perda da câmera ou do processo de IA.
- [ ] Usar o horário dos quadros para vincular eventos aos segmentos, considerando atraso de inferência e cobertura real do pré-buffer.
- [ ] Vincular eventos a gravações e permitir abrir o instante correspondente; indicar eventos sem vídeo ou com lacunas.
- [ ] Aplicar os controles existentes de espaço livre, retenção, arquivos protegidos e recuperação após encerramento inesperado.
- [ ] Testar eventos simultâneos e repetidos, sobreposição com agenda/manual, mudança de configuração, disco cheio e reinício do app.

**Concluído quando:** uma detecção habilitada gera vídeo anterior/posterior ao evento
conforme a cobertura disponível, acessível pela biblioteca, sem sessões duplicadas
ou interrupção indevida de gravações manuais/agendadas.

## Sequência sugerida e validação de entrega

Os itens 1, 2 e 3 podem ser entregues separadamente. Para IA, executar a prova de
conceito do item 4 primeiro; depois integrar detecção, gravação por pessoa/veículo
e cruzamento de linha. Por último, habilitar cruzamento como gatilho de gravação.

- [ ] Para cada entrega, executar `npm run typecheck`, `npm run lint` e os testes de regressão pertinentes; executar `npm run test:player` nas alterações do player.
- [ ] Validar telas modificadas, acessibilidade, responsividade e consistência visual.
- [ ] Fazer testes com dispositivos físicos e documentar resultados separados dos testes com simuladores.
- [ ] Verificar instalação e empacotamento em máquina limpa quando houver novos modelos, runtimes ou binários de mídia.
- [ ] Atualizar README, CHANGELOG e documentação de compatibilidade a cada recurso entregue, marcando apenas tarefas verificadas como concluídas.
