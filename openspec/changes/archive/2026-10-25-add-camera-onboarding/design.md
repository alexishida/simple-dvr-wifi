# Design

## Context

O cadastro atual já descobre dispositivos ONVIF na rede, consulta identidade e
URI de stream, valida RTSP e possui fallbacks de marca/modelo. Porém, o
formulário inicial expõe campos de URL e o teste exige que uma URL ONVIF ou
RTSP já tenha sido informada. Consulte `proposal.md` para a motivação.

## Goals / Non-Goals

**Goals:**

- Tornar URL RTSP e ONVIF detalhes avançados no fluxo usual.
- Reaproveitar descoberta, adaptador ONVIF, validação RTSP e presets já
  existentes.
- Oferecer uma rota segura e limitada de detecção a partir de IP ou hostname.
- Preservar o cadastro manual para todos os equipamentos incompatíveis.

**Non-Goals:**

- Fazer varredura de portas ou hosts além do endereço explicitamente informado.
- Garantir compatibilidade com câmeras sem ONVIF ou sem um fallback validado.
- Alterar as credenciais ou a configuração da câmera física.

## Decisions

### Separar o cadastro em uma tela de escolha e fluxos especializados

A tela inicial oferece os três modos definidos na especificação. Detecção na
rede segue para a lista ONVIF existente; por IP segue para credenciais e
configuração automática; URL manual abre o formulário técnico. Isso reduz a
carga cognitiva sem remover o escape hatch para integrações legadas.

Alternativa: manter um único formulário e ocultar URLs dinamicamente. Foi
descartada porque ainda mistura decisões de método, credenciais e detalhes
avançados na primeira interação.

### Criar uma operação de configuração automática por endereço

O processo principal recebe endereço e credenciais, cria candidatos ONVIF a
partir de caminhos e portas conhecidos e tenta-os com limites de tempo. Cada
candidato permanece no host fornecido. Ao encontrar ONVIF acessível, reutiliza
a detecção atual para obter identidade, `GetStreamUri`, fallback de modelo e
probe RTSP. A resposta retorna o resultado validado e dados que podem preencher
o rascunho do formulário.

Alternativa: derivar uma URL ONVIF fixa por fabricante. Foi descartada porque o
fabricante ainda é desconhecido antes da primeira conexão e variações de modelo
ou firmware tornam esse método pouco confiável.

### Só concluir automaticamente após validação de stream

O fluxo automático habilita salvar apenas depois de um probe RTSP bem-sucedido.
Falhas levam ao formulário manual pré-preenchido, em vez de criar um registro
sem stream funcional. Credenciais continuam armazenadas pelos mecanismos atuais
e não são colocadas em mensagens, logs ou URLs exibidas.

Alternativa: salvar um registro pendente após achar ONVIF. Foi descartada para
evitar câmeras aparentemente cadastradas que não funcionam na área Live.

### Manter configuração manual como fluxo de primeira classe

O modo manual permanece diretamente acessível, além de ser o fallback dos
outros modos. Dados não sensíveis já obtidos (endereço, fabricante, modelo e
endpoint ONVIF) são carregados para reduzir retrabalho; senhas não são exibidas
ou replicadas em URLs.

## Risks / Trade-offs

- [Alguns dispositivos não respondem a multicast ONVIF] → O modo por IP evita
  depender de multicast e tenta somente o host indicado.
- [Caminhos e portas ONVIF variam por fabricante] → Usar uma lista curta,
  versionada e coberta por testes; manter fallback manual.
- [Várias tentativas podem deixar o fluxo lento] → Limitar candidatos,
  concorrência e timeout total, cancelando tentativas restantes após sucesso.
- [Credenciais erradas podem acionar bloqueio temporário da câmera] → Fazer no
  máximo uma tentativa autenticada por candidato e apresentar falha acionável.
- [Fallback de marca pode apontar para caminho incorreto] → Exigir probe RTSP
  bem-sucedido antes de liberar o cadastro automático.

## Migration Plan

1. Introduzir a nova tela de escolha e manter o formulário manual intacto.
2. Adicionar a operação de configuração por IP e testes com simuladores.
3. Conectar os fluxos automáticos ao rascunho de cadastro e ao fallback manual.
4. Executar as regressões de formulário, ONVIF, RTSP, tipos, lint e build.

Rollback: restaurar o acesso direto ao formulário manual; a mudança não exige
migração de banco e não modifica câmeras já cadastradas.
