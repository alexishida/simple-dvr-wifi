# Requisitos de execução — Windows (MVP)

Este documento descreve o que o usuário precisa saber para executar o Simple DVR
Wi-Fi no Windows 10/11 x64, cobrindo rede (firewall, multicast, VLAN, VPN),
diretórios e limitações de codec/fabricante. Também registra a restrição de
portabilidade futura para Linux.

Aplicável à versão de release desta mudança (MVP Windows).

## Requisitos do sistema

- Windows 10 (64 bits) ou Windows 11 (64 bits).
- 4 GB de RAM recomendados (mínimo funcional medido em layouts até 16 streams).
- Disco com espaço para banco local, gravações e snapshots; 1 GB mínimo
  recomendado além do instalador.
- Nenhuma ferramenta de desenvolvimento é necessária: o pacote é autossuficiente
  e não requer Node.js, Python ou compiladores instalados.

## Rede e firewall

- WS-Discovery usa multicast UDP na porta `3702`, por interface de rede. Se a
  descoberta não encontrar câmeras, verificar:
  - Firewall do Windows liberando UDP `3702` na rede local (a descoberta também
    pode ser substituída pelo cadastro manual por URL RTSP/ONVIF).
  - Switches com IGMP snooping habilitado e multicast não bloqueado entre o
    host e as câmeras.
  - Interfaces Wi-Fi: alguns access points bloqueiam multicast entre clientes
    (isolamento de cliente/AP isolation). Nesse caso, usar Ethernet ou cadastro
    manual.
- O aplicativo, ao iniciar sessões de mídia, abre listeners **somente em
  loopback (`127.0.0.1`)**, com portas efêmeras. Nenhum listener usa endereço
  externo ou de rede local; não é necessário liberar portas de entrada no
  firewall para o aplicativo.
- Saída de rede do aplicativo: somente para as câmeras configuradas (RTSP,
  HTTP(S), ONVIF) na rede local. Não há telemetria nem chamadas de atualização.

## Multicast, VLAN e VPN

- VLANs: WS-Discovery não atravessa VLANs a menos que o roteamento multicast
  inter-VLAN esteja configurado. Câmeras em VLAN distinta devem ser cadastradas
  manualmente por endereço/URL.
- VPNs: interfaces VPN são enumeradas e identificáveis na tela de descoberta;
  o usuário pode restringir o escopo. Descoberta sobre túneis geralmente não
  alcança câmeras locais e deve ser evitada.
- Se o ambiente bloquear multicast, a descoberta retornará vazia sem erro; o
  cadastro manual permanece o caminho garantido.

## Diretórios

- Banco local, backup, gravações, snapshots e configurações de mídia ficam em
  diretórios sob o perfil de usuário, resolvidos pela camada de plataforma.
- O usuário pode selecionar diretórios de gravações/snapshots via diálogo nativo;
  o caminho é validado por raiz permitida, permissão, disponibilidade e espaço.
- Configurações temporárias de mídia (MediaMTX) ficam em diretório temporário
  restrito e são removidas no encerramento das sessões.

## Limitações de codec

- Preferência H.264 com encaminhamento direto (sem transcode) quando compatível
  com o player.
- H.265 e MJPEG dependem de fallback FFmpeg licenciado e suportado pela
  plataforma; quando indisponível, o estado `codec_error` é reportado. Não há
  garantia de H.265 em toda combinação de Electron/Windows/hardware.
- Codecs GPL/nonfree não são redistribuídos; builds FFmpeg LGPL sem
  `--enable-gpl`/`--enable-nonfree` são o único caminho aprovado.

## Limitações por fabricante/câmera

- ONVIF incompleto ou divergente: capacidades e perfis são normalizados com
  `supported`/`unsupported`/`unknown`/`error`; o cadastro pode funcionar com
  partes indisponíveis (ex.: PTZ ausente, snapshot ausente).
- Câmeras somente RTSP funcionam via cadastro manual com URL RTSP e credenciais
  separadas; sem descoberta WS-Discovery e sem ONVIF.
- Firmware antigo pode não expor Media/Media2 ou exigir autenticação por
  serviço; a matriz de validação registra essas limitações por dispositivo.

## Portabilidade futura (restrição registrada)

Esta entrega valida e distribui **somente Windows 10/11 x64**. A arquitetura
preserva fronteiras de plataforma (diretórios, permissões, processos,
`safeStorage` e aceleração atrás de interfaces), mas **não há promessa de
funcionamento em Linux nesta versão**. A porta Linux (pacotes, validação,
secret stores e aceleração) será tratada em mudança futura separada.

## Verificação pós-instalação

- O instalador (NSIS) permite escolher diretório de instalação e cria atalhos.
- Após instalar, abrir o aplicativo: a tela inicial (dashboard) deve carregar
  sem necessidade de configuração manual de mídia.
- O binário MediaMTX deve estar presente em `resources/mediamtx/win32/` dentro
  da instalação; se ausente, o aviso no smoke test indica bloqueio de release.
- Fluxo sem internet: o aplicativo só conversa com loopback e com as câmeras
  configuradas.
