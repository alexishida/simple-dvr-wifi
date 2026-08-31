## 1. Fundação e decisões executáveis

- [x] 1.1 Criar o projeto Electron com o template React + TypeScript do electron-vite, habilitar ESM e confirmar com `npm run dev` que main, preload e renderer iniciam.
- [x] 1.2 Fixar versões compatíveis de Electron, Node embarcado, React, TypeScript e electron-builder, adicionar lockfile e scripts `typecheck`, `lint`, `test`, `build` e verificar uma instalação limpa com `npm ci`.
- [x] 1.3 Configurar TypeScript estrito separado para Node e DOM, ESLint flat config e Prettier, e verificar `npm run typecheck`, `npm run lint` e `npm run format:check` sem erros.
- [x] 1.4 Criar os diretórios `main`, `preload`, `renderer`, `workers`, `shared`, `resources` e testes conforme o design, e verificar por teste arquitetural que renderer não importa módulos de Node/Electron.
- [x] 1.5 Definir contratos compartilhados, schemas de validação, códigos de erro, estados de câmera/gravação e envelopes de request/response; verificar testes unitários de serialização e rejeição de payloads inválidos.
- [x] 1.6 Executar spikes reproduzíveis no Windows para driver SQLite, biblioteca ONVIF, MediaMTX e FFmpeg, registrar versões, hashes, ABI, licença e limites de codec, e verificar um relatório de decisão aprovado antes de adicionar binários ao pacote.
- [x] 1.7 Configurar CI inicial em runner Windows para instalação, typecheck, lint, testes e build, e verificar o job verde em commit limpo.

## 2. Shell Electron seguro e IPC

- [x] 2.1 Implementar `BrowserWindow` com sandbox global, context isolation, Node desativado e webSecurity ativo, e verificar por teste Electron que `require`, `process` e APIs privilegiadas não existem no renderer.
- [x] 2.2 Registrar o protocolo seguro `app://`, carregar apenas assets empacotados e aplicar CSP restritiva, e verificar que scripts inline/não autorizados e recursos remotos são bloqueados.
- [x] 2.3 Bloquear navegação, novas janelas, webviews e permissões não autorizadas, validar URLs antes de `shell.openExternal` e verificar testes com esquemas e destinos maliciosos.
- [x] 2.4 Criar a API preload tipada com operações específicas por domínio e unsubscribe de eventos, e verificar que `ipcRenderer` e um método `invoke(channel, ...)` genérico não são expostos.
- [x] 2.5 Criar registro central de handlers IPC com validação de payload, sender, autorização e mapeamento de erro seguro, e verificar testes de canal desconhecido, sender inválido, excesso de tamanho e path traversal.
- [x] 2.6 Aplicar Electron fuses compatíveis com o baseline e verificar no artefato empacotado que opções de debug/execução não necessárias estão desabilitadas.
- [x] 2.7 Implementar encerramento coordenado do main, workers e sidecars com timeout e verificar por teste de processo que uma saída normal não deixa filhos órfãos.

## 3. Persistência local e vault

- [x] 3.1 Implementar worker SQLite com request/response assíncrono, health check e encerramento, e verificar operações concorrentes sem bloquear heartbeat da janela.
- [x] 3.2 Criar migração v1 para câmeras, endpoints, perfis, capacidades, credenciais cifradas, gravações, segmentos, snapshots, preferências e diagnósticos, e verificar o esquema em banco temporário vazio.
- [x] 3.3 Implementar repositórios e transações para o ciclo de vida das entidades, e verificar testes de integração com criação, atualização, consulta, desativação e remoção em cascata lógica.
- [x] 3.4 Implementar versionamento, backup pré-migração, rollback transacional e integrity check, e verificar uma migração falha que preserve a versão e o backup anteriores.
- [x] 3.5 Implementar chave mestra aleatória envolvida por `safeStorage` e criptografia AES-256-GCM por credencial com nonce único, e verificar round-trip, adulteração de tag e ausência de plaintext no banco.
- [x] 3.6 Detectar indisponibilidade de `safeStorage` no Windows, bloquear persistência de segredos e orientar o usuário; verificar o fluxo com backend seguro simulado e indisponível simulado.
- [x] 3.7 Implementar credenciais distintas por serviço, substituição sem revelar senha antiga e remoção junto à câmera, e verificar que a listagem do renderer contém apenas `hasCredential`.
- [x] 3.8 Implementar importação e backup seguros com schemas, limites e credenciais ainda cifradas, e verificar rejeição de esquema proibido, arquivo excessivo e exportação sem plaintext.

## 4. Configuração, logs e diagnóstico base

- [x] 4.1 Criar configuração tipada com defaults e persistência para tema, diretórios, reconexão, streams, aceleração e nível de log, e verificar restauração após reinício.
- [x] 4.2 Implementar resolução segura de diretórios sob raízes autorizadas e seleção por diálogo nativo, e verificar rejeição de path traversal, arquivo no lugar de diretório e falta de permissão.
- [x] 4.3 Implementar logger estruturado com UTC, correlation id, camera id, códigos de erro, rotação e limite de tamanho, e verificar níveis e formato em teste.
- [x] 4.4 Criar sanitizador central para URLs, Authorization, senha, token, chave e saída de sidecars, e verificar fixtures que nunca gravem os segredos canários.
- [x] 4.5 Implementar agregação de erros repetidos e modelo de diagnóstico exportável sem banco, credenciais ou mídia, e verificar que falhas idênticas são consolidadas.

## 5. Descoberta e interoperabilidade de câmera

- [x] 5.1 Implementar enumeração de interfaces Ethernet, Wi-Fi, VPN e virtuais com seleção do usuário, e verificar fixtures Windows e exclusão de interfaces inválidas.
- [x] 5.2 Implementar worker WS-Discovery por interface com progresso, timeout, `AbortController` e deduplicação por EPR/XAddr, e verificar descoberta encontrada, vazia, duplicada e cancelada.
- [x] 5.3 Implementar parser XML/SOAP com entidades externas desabilitadas, limites de bytes/profundidade e timeout, e verificar XXE, entity expansion, XML truncado e payload excessivo.
- [x] 5.4 Implementar `CameraAdapter` e adaptador ONVIF para Device Management, Media/Media2, identidade e capacidades parciais, e verificar fixtures completas, incompletas e com declarações incorretas.
- [x] 5.5 Implementar consulta e normalização de perfis, main/substream, resolução, FPS, H.264, H.265 e MJPEG, e verificar seleção contextual sobre fixtures de múltiplos perfis.
- [x] 5.6 Implementar clientes HTTP(S)/RTSP probe com DNS e timeouts, autenticação por serviço e URLs manuais, e verificar câmera somente RTSP, hostname inválido e credenciais separadas.
- [x] 5.7 Implementar validação TLS padrão e exceção por câmera/fingerprint, e verificar que certificado autoassinado falha antes da aprovação, funciona depois dela e exige nova aprovação quando muda.
- [x] 5.8 Implementar orquestrador de teste segmentado com concorrência limitada e resultados independentes de alcance, autenticação, ONVIF, mídia, RTSP, snapshot, PTZ e codec; verificar cenário ONVIF falho com RTSP válido.

## 6. Onboarding e gerenciamento de câmeras

- [x] 6.1 Criar tela de descoberta com interface selecionável, iniciar, cancelar, atualizar, resultados incrementais e explicação de multicast/firewall/VLAN/VPN, e verificar o fluxo com simulador.
- [x] 6.2 Criar wizard compartilhado para câmera descoberta ou manual com campos opcionais, credenciais, teste segmentado, capacidades, perfil e confirmação, e verificar cadastro ONVIF e somente RTSP.
- [x] 6.3 Implementar detecção de duplicidade por endereço, EPR e número de série com override confirmado, e verificar bloqueio inicial e persistência separada após confirmação.
- [x] 6.4 Criar tela de câmeras com nome, endereço, fabricante, modelo, status, capacidades e ações adicionar/editar/testar/ativar/desativar/remover, e verificar cada transição no teste de UI.
- [x] 6.5 Implementar edição que preserva credencial quando o campo fica vazio e fluxo de atualização após `auth_error`, e verificar que a senha original nunca retorna ao DOM.
- [x] 6.6 Implementar remoção confirmada que encerra sessões, cancela retries e remove credenciais sem afetar outras câmeras, e verificar o cenário e2e com duas câmeras.

## 7. Sessões e gateway de mídia

- [x] 7.1 Empacotar MediaMTX por plataforma fora do asar, validar hash antes da execução e iniciar um sidecar por câmera em loopback com portas efêmeras, auth e configuração temporária restrita; verificar que nenhum listener usa endereço externo.
- [x] 7.2 Implementar `MediaSessionSupervisor` com lifecycle, health check, logs sanitizados, circuit breaker e limpeza de config/portas, e verificar crash/restart de uma câmera sem encerrar a outra.
- [x] 7.3 Implementar paths main/substream e contador de referências por câmera/perfil, e verificar dois consumidores compartilhando um path e encerramento após o último release.
- [x] 7.4 Integrar WHEP/WebRTC no renderer com token por sessão, cleanup e probe de codec, e verificar vídeo H.264 de baixa latência no simulador sem expor a API de controle.
- [x] 7.5 Implementar runner FFmpeg sem shell, com argumentos permitidos, timeout, output limitado, diretórios confinados e kill supervisionado; verificar metacaracteres em URL e encerramento forçado.
- [x] 7.6 Implementar estratégia direct/remux/transcode e fallback H.265/MJPEG conforme capacidade licenciada da plataforma, e verificar H.264 sem transcode, fallback disponível e `codec_error` quando indisponível.
- [x] 7.7 Implementar política de perfil e recursos para grid, fullscreen, minimização e itens invisíveis, sem interromper gravação, e verificar trocas main/substream e liberação de buffers.
- [x] 7.8 Medir latência, CPU, memória, portas e rede nos layouts 1/4/9/16, corrigir vazamentos ou limites inviáveis e registrar baseline reproduzível por plataforma.

## 8. Dashboard e experiência de monitoramento

- [x] 8.1 Criar tokens semânticos de cor, tipografia, espaçamento, foco e estados no design system do projeto, e verificar contraste, tema escuro e consistência no catálogo de componentes.
- [x] 8.2 Implementar shell responsivo e navegação para dashboard, câmeras, descoberta, gravações, snapshots, diagnóstico e configurações, e verificar navegação por teclado em janela normal e reduzida.
- [x] 8.3 Implementar grid 1/4/9/16 com cards de câmera, nome, player, estado, gravação, fullscreen, snapshot e ações condicionais, e verificar falha isolada em um card.
- [x] 8.4 Implementar fullscreen com troca opcional para main stream e retorno ao perfil do grid, e verificar que referências e sessões não se duplicam.
- [x] 8.5 Integrar Zustand aos eventos tipados do main para hidratação e reconciliação de estados, e verificar rollback visual quando uma mutação persistente falha.
- [x] 8.6 Implementar acessibilidade básica com labels, foco visível, atalhos seguros e estados não dependentes apenas de cor, e verificar auditoria automatizada e roteiro de teclado.

## 9. Estados, reconexão e isolamento

- [x] 9.1 Implementar máquina de estados serializada por câmera e mapeamento de falhas para autenticação, rede, protocolo, mídia, codec, banco e armazenamento, e verificar transições válidas/inválidas.
- [x] 9.2 Implementar backoff exponencial com jitter, teto configurável, reset após estabilidade e cancelamento por disable/remove, e verificar com relógio falso a sequência e ausência de timer órfão.
- [x] 9.3 Integrar reconexão ao MediaSession com descarte de pipeline inválido e retomada automática, e verificar queda/retorno do RTSP sem recarregar a tela.
- [x] 9.4 Aplicar concorrência limitada e abort signals a DNS, HTTP(S), ONVIF, RTSP, snapshot e PTZ, e verificar que câmera travada não bloqueia heartbeat nem outra câmera.
- [x] 9.5 Implementar monitor de diretórios, espaço e permissões, e verificar disco cheio, mídia removida e destino inacessível sem interromper live view.

## 10. Controle PTZ

- [x] 10.1 Implementar comandos ONVIF ContinuousMove, RelativeMove, AbsoluteMove, Zoom e Stop condicionados às capacidades, e verificar que operações não suportadas não chegam ao adaptador.
- [x] 10.2 Implementar validação e normalização de velocidades pelos limites da câmera, e verificar rejeição de NaN, infinito e valores fora da faixa vindos do IPC.
- [x] 10.3 Implementar lease renovável de movimento e parada em pointer/key release, blur, unmount, troca de câmera, falha e shutdown, e verificar todos os gatilhos com testes de relógio e UI.
- [x] 10.4 Bloquear novos movimentos após falha de Stop até retry limitado ou reconciliação, e verificar estado inseguro sem travar o vídeo.
- [x] 10.5 Implementar listar, ir, criar, substituir e remover presets conforme capacidades, e verificar fixtures com suporte completo, parcial e ausente.
- [x] 10.6 Criar painel PTZ responsivo e acessível com direções, diagonais, zoom, velocidades e presets, e verificar controle por mouse, toque e teclado.

## 11. Snapshots, gravação e bibliotecas

- [x] 11.1 Implementar snapshot via endpoint ONVIF/HTTP com autenticação e validação de tipo/tamanho, e verificar arquivo salvo e metadados UTC.
- [x] 11.2 Implementar fallback de snapshot por frame do stream via FFmpeg, e verificar uso somente quando endpoint falha ou é ausente.
- [x] 11.3 Implementar início/parada de gravação fMP4 segmentada no MediaSession com cópia do stream e estados persistidos, e verificar transições completas e indicador no card.
- [x] 11.4 Catalogar segmentos como sessão lógica com início, fim, duração, path e estado, e verificar sessões concluída, interrompida e falha em banco temporário.
- [x] 11.5 Implementar finalização e recuperação após queda de câmera, sidecar ou aplicativo, e verificar que apenas a última parte dentro do RPO pode ser perdida.
- [x] 11.6 Implementar tratamento de falta de espaço/permissão durante captura e gravação, e verificar erro visível, arquivo válido preservado e nenhuma falsa indicação de gravação.
- [x] 11.7 Criar tela de snapshots por câmera/data/hora com abertura segura do arquivo, e verificar que paths fora da biblioteca não podem ser solicitados pelo renderer.
- [x] 11.8 Criar tela de gravações por câmera/data/hora/duração/estado com reprodução fMP4/MP4 suportada, e verificar item parcial claramente identificado.
- [x] 11.9 Interceptar fechamento com gravações ativas, aguardar flush até timeout e pedir confirmação quando houver risco, e verificar saída limpa e saída forçada confirmada.

## 12. Configurações e diagnóstico final

- [x] 12.1 Criar tela de configurações para tema, diretórios, reconexão, comportamento de streams, aceleração e logs, e verificar persistência e validação de cada campo.
- [x] 12.2 Criar tela de diagnóstico por câmera com estados, últimas transições, tentativas e erros sanitizados, e verificar ausência de senha, token, Authorization e URL autenticada.
- [x] 12.3 Implementar aviso consolidado para problemas persistentes e toasts somente para ações pontuais, e verificar que dez retries iguais geram um problema agrupado.
- [x] 12.4 Implementar funcionamento totalmente local sem telemetria ou chamadas de update, e verificar em teste de rede que o app ocioso só acessa loopback e câmeras configuradas.

## 13. Simuladores e automação de testes

- [x] 13.1 Criar simulador WS-Discovery/ONVIF com identidade, Media/Media2, PTZ, snapshot, respostas parciais e autenticação, e verificar fixtures determinísticas.
- [x] 13.2 Criar streams simulados H.264, H.265 quando licenciado e MJPEG com comandos para queda, retorno e credencial inválida, e verificar execução sem hardware físico.
- [x] 13.3 Cobrir serviços, repositórios, vault, sanitização, estados, backoff e validações com testes unitários, e verificar relatório de cobertura focado nos ramos de erro definidos nas specs.
- [x] 13.4 Cobrir SQLite, workers, ONVIF, MediaMTX, FFmpeg, gravação e recuperação com testes de integração isolados, e verificar teardown sem processo ou arquivo temporário órfão.
- [x] 13.5 Criar testes Playwright Electron para descoberta, cadastro manual, reinício, grid, fullscreen, PTZ, snapshot, gravação, reconexão e remoção, e verificar a suíte em CI Windows.
- [x] 13.6 Criar suíte de segurança para IPC, navegação, CSP, XML, URLs, command injection, paths, logs e credenciais no banco/DOM, e verificar todos os segredos canários ausentes dos artefatos.

## 14. Empacotamento, licença e release

- [x] 14.1 Configurar electron-builder para NSIS com recursos Windows, asar e unpack somente dos binários necessários, e verificar geração local/CI do artefato.
- [x] 14.2 Automatizar rebuild do driver SQLite para a ABI Electron e validação de hashes de MediaMTX/FFmpeg, e verificar smoke test do pacote Windows.
- [x] 14.3 Gerar SBOM, inventário de licenças, avisos e fontes/configurações correspondentes dos binários redistribuídos, e verificar que o job de release bloqueia componente não aprovado.
- [x] 14.4 Documentar requisitos de firewall, multicast, VLAN, VPN, diretórios e limitações de codec/fabricante para Windows, e registrar a restrição de portabilidade futura.
- [x] 14.5 Preparar assinatura Windows parametrizada por segredos de CI e metadados neutros para nome/appId/ícone pendentes, e verificar build sem segredo no repositório e build assinado quando credenciais existirem.
- [ ] 14.6 Instalar os pacotes em máquinas limpas suportadas sem Node.js e executar smoke test de abertura, componentes de mídia, banco e ausência de internet, registrando evidência por plataforma.

## 15. Aceite do MVP com hardware real

- [ ] 15.1 Definir e registrar modelos disponíveis para as categorias somente RTSP, ONVIF básica, PTZ, H.264, H.265 aplicável, firmware antigo e ONVIF incompleto, e verificar cobertura mínima da matriz.
- [ ] 15.2 Executar testes de descoberta/cadastro, autenticação, perfis, live view, grid, PTZ, snapshot, gravação e reconexão em cada categoria, e registrar resultados e limitações por dispositivo.
- [ ] 15.3 Executar soak test com múltiplas câmeras e ciclos de queda/retorno, minimizar/restaurar e gravação prolongada, e verificar ausência de crash, vazamento progressivo ou processos órfãos.
- [x] 15.4 Executar checklist de segurança e privacidade no build candidato, incluindo inspeção de banco, logs, DOM, listeners e tráfego externo, e bloquear release diante de qualquer segredo ou listener não autorizado.
- [ ] 15.5 Executar o roteiro completo dos critérios de aceitação do MVP no Windows, anexar evidências e considerar a versão pronta somente quando todos os itens obrigatórios passarem ou tiverem limitação explicitamente permitida pelas specs.
