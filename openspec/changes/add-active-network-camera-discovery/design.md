# Design

## Context

A descoberta atual usa somente WS-Discovery ONVIF multicast, limitada a duas
tentativas por interface e a cem respostas. A configuração por IP já conhece
alguns endpoints ONVIF e valida RTSP, mas exige um endereço informado. Consulte
`proposal.md` para a motivação e as specs para o comportamento esperado.

## Goals / Non-Goals

**Goals:**

- Descobrir hosts ativos na sub-rede IPv4 escolhida antes de sondar protocolos.
- Identificar serviços de câmera com sondagem limitada, cancelável e segura.
- Reaproveitar a configuração automática e o fallback manual existentes.

**Non-Goals:**

- Descobrir ou suportar universalmente protocolos proprietários sem uma
  especificação pública ou adaptador aprovado.
- Fazer varredura fora da sub-rede selecionada, abrir portas ou modificar
  configuração de dispositivos.
- Tentar combinações de credenciais, caminhos RTSP arbitrários ou força bruta.

## Decisions

### Descoberta em duas fases

Primeiro, enumerar uma faixa IPv4 derivada da máscara da interface e identificar
hosts ativos com concorrência e timeout limitados. Segundo, somente nesses hosts,
sondar portas de câmera predefinidas. Isso reduz tráfego e evita tratar toda a
sub-rede como possíveis serviços de vídeo.

Alternativa: sondar portas em todos os endereços. Foi descartada por produzir
muito mais conexões, ser mais lenta e aumentar falsos alertas de segurança.

### Fingerprints sem credenciais, autenticação apenas na configuração

A sondagem usa conexões TCP e requisições seguras/limitadas para detectar a
presença de HTTP(S), RTSP e ONVIF. Respostas de autenticação são evidência de um
serviço, não motivo para repetir tentativas. Credenciais só são solicitadas
depois que a pessoa seleciona um resultado, mantendo o fluxo atual.

Alternativa: pedir uma credencial global antes da busca. Foi descartada porque
ela não é necessária para localizar hosts e aumenta a chance de bloqueio de
contas em equipamentos desconhecidos.

### Resultados normalizados por host

Cada resultado agrupa os serviços reconhecidos e identidade parcial do mesmo
host, com uma origem de descoberta. ONVIF multicast continua como fonte rápida;
a varredura ativa complementa dispositivos que não respondem a multicast. A UI
nunca apresenta um host sem serviço reconhecido como câmera configurável.

### Limites operacionais explícitos

O scanner usará uma lista curta e versionada de portas de câmera comuns,
concorrência limitada, tempo máximo por host e tempo máximo por busca. O
cancelamento propaga um `AbortSignal` a cada operação e descarta resultados
tardios. A lista e os limites serão centralizados para testes determinísticos.

## Risks / Trade-offs

- [Sub-redes grandes demoram e geram tráfego] → Limitar hosts, concorrência e
  duração; informar que faixas maiores podem exigir confirmação futura.
- [Firewall bloqueia ICMP ou TCP] → Tratar ausência de resposta como
  inconclusiva e manter descoberta ONVIF multicast e configuração por IP.
- [Porta aberta não identifica uma câmera] → Exigir fingerprint de protocolo
  antes de listar um resultado como câmera.
- [Equipamentos podem bloquear após autenticação inválida] → Não autenticar na
  sondagem e executar no máximo uma tentativa após seleção do usuário.
- [Protocolos proprietários] → Exibir como não reconhecidos e manter URL/manual
  até existir um adaptador documentado.

## Migration Plan

1. Adicionar scanner de hosts e serviço de sondagem com simuladores.
2. Estender o contrato IPC e a UI de descoberta para resultados normalizados,
   progresso e cancelamento.
3. Direcionar resultados reconhecidos ao fluxo existente de credenciais e
   configuração automática.
4. Executar regressões de descoberta, formulário, segurança, tipos, lint e
   build.

Rollback: manter a descoberta multicast ONVIF existente e desabilitar a fase
ativa; não há migração de banco ou alterações em câmeras cadastradas.
