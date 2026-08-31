## Why

O projeto precisa transformar a documentação funcional existente em uma primeira versão executável e segura para monitoramento local de câmeras IP/Wi-Fi no Windows. A mudança estabelece o MVP que cobre descoberta e cadastro, interoperabilidade ONVIF/RTSP, vídeo ao vivo, PTZ, snapshots, gravações e recuperação de falhas sem depender de serviços externos.

## What Changes

- Criar a base de uma aplicação desktop Electron, React e TypeScript para Windows 10/11 de 64 bits, preservando fronteiras de arquitetura compatíveis com futura portabilidade para Linux.
- Oferecer descoberta ONVIF por WS-Discovery, cadastro manual, detecção de duplicidade, teste de conexão por serviço e gerenciamento do ciclo de vida das câmeras.
- Detectar capacidades e perfis reais de cada dispositivo, priorizando ONVIF e RTSP sem presumir compatibilidade completa de fabricante, codec ou serviço.
- Exibir vídeo ao vivo de uma ou várias câmeras em layouts 1, 4, 9 e 16, alternando entre main stream e substream e evitando transcodificação ou pipelines duplicados quando possível.
- Disponibilizar controles PTZ, incluindo parada de segurança e presets, somente quando as capacidades correspondentes forem confirmadas.
- Capturar snapshots e iniciar/parar gravações locais, preservando metadados, estados e arquivos recuperáveis diante de falhas.
- Persistir configurações em banco local e proteger credenciais com criptografia autenticada e chave vinculada ao sistema operacional, sem expor segredos à interface ou aos logs.
- Isolar interface, rede, mídia e operações privilegiadas; validar IPC, entradas, XML, URLs e caminhos; manter CSP e padrões seguros do Electron.
- Implementar estados claros, timeouts, reconexão progressiva, isolamento por câmera, diagnóstico sanitizado e encerramento coordenado de recursos.
- Entregar instalador Windows com dependências de execução incluídas, além de testes automatizados, ambiente simulado e matriz de validação com câmeras reais.
- Adiar para uma mudança posterior os pacotes, a validação e o suporte operacional para Linux; isso não altera a política local, a interoperabilidade de câmera ou a segurança do produto.
- Manter fora do MVP acesso remoto/nuvem, usuários e permissões, eventos ONVIF, gravação automática ou por movimento, NVR/NAS, timeline avançada, IA e integrações proprietárias; a arquitetura apenas preservará pontos de extensão para essas evoluções.

## Capabilities

### New Capabilities

- `desktop-runtime-and-navigation`: Inicialização desktop segura, navegação, dashboard, temas, configurações e funcionamento offline no Windows, com arquitetura preparada para futura portabilidade.
- `camera-onboarding-and-management`: Descoberta WS-Discovery, cadastro manual, teste de conexão, detecção de duplicidade e gerenciamento das câmeras.
- `camera-interoperability`: Protocolos HTTP(S), RTSP/RTP/RTCP e ONVIF, detecção de serviços, perfis, codecs e capacidades com tolerância a implementações incompletas.
- `live-video-monitoring`: Reprodução de baixa latência, seleção de main stream/substream, grids de até 16 câmeras, fullscreen e compartilhamento eficiente de pipelines.
- `ptz-control`: Controles ONVIF PTZ condicionados à capacidade, velocidades, movimentos, presets e parada de segurança.
- `media-capture-and-library`: Snapshots, gravação manual sem transcodificação quando possível, metadados, bibliotecas locais e preservação diante de falhas.
- `secure-local-data`: Banco local, criptografia de credenciais, gestão segura da chave, acesso de menor privilégio, remoção de segredos e migrações.
- `resilience-and-diagnostics`: Estados, timeouts, reconexão progressiva, isolamento de falhas, logs sanitizados, monitoramento de armazenamento e encerramento coordenado.
- `distribution-and-quality`: Empacotamento Windows autossuficiente, licenciamento de componentes, testes funcionais e de segurança, streams simulados e validação com hardware real.

### Modified Capabilities

Nenhuma. O projeto ainda não possui especificações principais existentes.

## Impact

- Introduz toda a base do aplicativo: processos main/preload/renderer, contratos IPC tipados, serviços de câmera e mídia, persistência local, telas e empacotamento.
- Exige componentes de ONVIF/WS-Discovery, banco local, armazenamento seguro do sistema operacional e um mecanismo de mídia distribuível capaz de tratar RTSP/RTP/RTCP e codecs suportados.
- Cria dados locais para câmeras, capacidades, perfis, credenciais cifradas, gravações, snapshots, preferências e migrações.
- Requer análise explícita de licenças e distribuição dos binários/codecs de mídia, além de pipeline de build e assinatura para Windows.
- Define superfícies privilegiadas novas; IPC, execução do processador de mídia, XML, rede, logs e acesso a arquivos passam a fazer parte da fronteira de segurança do produto.
