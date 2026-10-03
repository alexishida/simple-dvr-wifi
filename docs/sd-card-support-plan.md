# Plano de validação: cartão SD adicional

Data da revisão: 2026-10-03.

## Consulta à unidade física em 2026-10-03

Unidade disponibilizada pelo usuário: TP-Link Tapo C200, firmware confirmado via
ONVIF **1.3.17 Build 260112 Rel.54862n(4555)**. Revisão de hardware ainda não
confirmada. Esta unidade passa a ser
o primeiro alvo de validação; V3.20 e V5 abaixo são apenas candidatos documentais.

O usuário confirmou a existência de gravações no microSD em 2026-10-03.
Essa confirmação ainda não representa validação de listagem ou reprodução pelo DVR.

Na primeira etapa foram feitas consultas locais de leitura, sem credenciais e sem alterar
configurações ou iniciar reprodução:

| Consulta | Resultado observado |
| --- | --- |
| RTSP `DESCRIBE /stream1`, porta 554 | `401 Unauthorized`; serviço acessível, autenticação necessária. |
| ONVIF `GetServices`, porta 2020 | HTTP 200; anunciou Device, Media, Events, Analytics, Imaging e PTZ. Não anunciou Recording, Search ou Replay. |
| ONVIF `GetCapabilities(All)` | HTTP 200; sem capacidades Recording, Search ou Replay. |
| ONVIF `GetDeviceInformation` | HTTP 400 com indicação `NotAuthorized`; identidade e firmware ainda não conferidos por consulta autenticada. |

### Resultado autenticado

Após o usuário salvar a senha, a consulta foi repetida com as credenciais locais
de ONVIF e RTSP, lidas do banco em modo somente leitura e abertas em memória
com a proteção do sistema operacional. Nenhuma senha foi exibida ou gravada em
texto puro. Nenhuma configuração da câmera ou gravação foi alterada.

| Consulta | Resultado observado |
| --- | --- |
| `GetDeviceInformation` | HTTP 200; fabricante `tp-link`, modelo `Tapo C200`, firmware completo acima. |
| `GetServices` | HTTP 200; Recording, Search e Replay continuam ausentes. |
| `GetCapabilities` (Media e PTZ) | HTTP 200 em ambas as consultas. |
| `GetProfiles` | HTTP 200; principal H.264, 1920 × 1080, 15 fps; secundário H.264, 640 × 360, 15 fps. Ambos anunciam G.711 como áudio. |
| `GetStreamUri` | HTTP 200 para ambos os perfis. |
| Teste RTSP autenticado do stream principal | `ok` pelo probe do aplicativo. Não foi feito ensaio de reprodução contínua. |
| `GetSnapshotUri` | HTTP 500 nas duas tentativas do adaptador; snapshot ONVIF não validado. |

Conclusão para esta unidade: a senha permite autenticar e consultar os streams,
mas os serviços de histórico ONVIF continuam ausentes. A integração atual de
cartão SD do DVR não oferece acesso às gravações desta C200. Isso não comprova
ausência de uma interface proprietária nem permite generalizar para outras
revisões/firmwares. G.711 é o codec anunciado, sem confirmação do áudio efetivo,
sincronismo ou continuidade. Listagem, download e reprodução do cartão ainda não
foram validados. Endereço local, usuário e número de série foram omitidos deste
relatório versionado.

## Próximo candidato

O próximo candidato é a **TP-Link Tapo C200**, começando por uma unidade com
cartão microSD funcional e uma revisão de hardware/firmware identificada na tela
de informações do dispositivo. A página oficial do produto declara slot microSD,
RTSP e ONVIF; isso não prova acesso ao histórico gravado nem uma API local para
listá-lo. Portanto, a C200 não aparece como suportada no aplicativo até concluir
os testes abaixo.

As revisões a priorizar são C200 V3.20 e C200 V5, por constarem em páginas
oficiais atuais de produto e suporte. Para cada unidade, registrar no relatório:

- região, revisão de hardware e versão completa do firmware;
- capacidade, marca e sistema de arquivos do cartão;
- modo de gravação (contínua ou por evento), fuso configurado e hora mostrada;
- Tapo Care, RTSP e ONVIF ativados ou desativados durante o teste;
- codec de vídeo/áudio e duração de pelo menos três gravações de referência.

## Hipóteses a testar

1. Descobrir com credencial de câmera específica criada no aplicativo Tapo, sem
   usar a conta de nuvem Tapo como credencial do DVR.
2. Consultar serviços ONVIF de busca e replay primeiro. Só implementar um
   adaptador se a C200 expuser uma capacidade de histórico autenticada e estável.
3. Se não houver busca/replay ONVIF, identificar um protocolo local documentado
   ou autorizado pelo fabricante antes de chamar endpoints específicos.
4. Comparar data, hora, duração e áudio da listagem contra a reprodução no
   aplicativo Tapo; não inferir fuso pelo computador.
5. Importar o mesmo item duas vezes e confirmar uma única entrada na biblioteca,
   sem arquivo parcial após perda de rede ou cancelamento.

## Investigação concluída

| Área | Resultado | Decisão |
| --- | --- | --- |
| Stream ao vivo | A documentação declara RTSP em `/stream1` e `/stream2`, e ONVIF na porta 2020. | Reutilizar o cadastro ONVIF/RTSP existente somente para vídeo ao vivo. |
| Perfil ONVIF | A C200 é declarada como Profile S. Não há declaração de Profile G, busca de gravações ou replay. | Não usar ONVIF como base do adaptador de cartão até um dispositivo real anunciar e responder a esses serviços. |
| Histórico no microSD | O produto declara o cartão e gravação local, mas não publica protocolo de listagem/download dos arquivos. | Não fazer engenharia reversa nem chamar endpoints privados; solicitar ou localizar documentação autorizada antes de implementar. |
| Autenticação | Integrações de terceiros requerem uma **Camera Account**, diferente da conta Tapo. | Guardar essa credencial cifrada no campo de serviço de cartão SD; nunca reutilizar nem registrar a senha da conta de nuvem. |
| Rede | ONVIF/RTSP são orientados à rede local; a fabricante recomenda VPN para acesso remoto. | Adaptador, se aprovado, será exclusivamente local e não abrirá portas nem ativará encaminhamento no roteador. |

O resultado é negativo para um adaptador interoperável neste momento: a API
oficial confirma transporte ao vivo, não acesso ao arquivo histórico do microSD.
Isso é uma limitação documentada, não uma falha da C200 ou do aplicativo.

## Limitações conhecidas

A TP-Link informa que armazenamento microSD, Tapo Care e gravação por
NVR/NAS/ONVIF compartilham recursos limitados: apenas duas dessas opções podem
funcionar ao mesmo tempo. O ensaio deve repetir a busca com cada combinação
relevante e anotar a que desabilita a gravação/stream de terceiros.

Não há confirmação do fabricante de que ONVIF Profile S da C200 ofereça acesso
ao catálogo ou replay do microSD. RTSP/ONVIF comprovam o stream ao vivo, não o
histórico. Se essa hipótese falhar, o resultado será registrado como “modelo não
suportado para importação de cartão SD”, preservando o adaptador da Mibo iM4-C.

## Fontes

- [Especificações da Tapo C200](https://www.tp-link.com/us/home-networking/cloud-camera/tapo-c200/)
- [RTSP/ONVIF em câmeras Tapo](https://www.tp-link.com/us/support/faq/2680/)
- [Limites entre microSD, Tapo Care e ONVIF](https://www.tp-link.com/us/support/faq/4465/)
