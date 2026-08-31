# Matriz de validação com câmeras reais

Registro obrigatório para a tarefa 15.1 (e 15.2/15.3/15.5) do MVP. Cada
categoria abaixo deve ter ao menos um modelo validado antes da versão estável.
O objetivo não é promessa de compatibilidade universal, mas evidência por
categoria e plataforma, incluindo limitações conhecidas.

## Categorias obrigatórias

| #   | Categoria        | Critério mínimo                               | Modelos registrados | Status   |
| --- | ---------------- | --------------------------------------------- | ------------------- | -------- |
| C1  | Somente RTSP     | Sem ONVIF; cadastro manual por URL RTSP       | —                   | Pendente |
| C2  | ONVIF básica     | Descoberta/identidade/Media válidos           | —                   | Pendente |
| C3  | PTZ              | Capacidades PTZ confirmadas                   | —                   | Pendente |
| C4  | H.264            | Stream H.264 reproduzível                     | —                   | Pendente |
| C5  | H.265 aplicável  | H.265 quando a plataforma licenciada suportar | —                   | Pendente |
| C6  | Firmware antigo  | ONVIF antigo/incompleto tolerado              | —                   | Pendente |
| C7  | ONVIF incompleto | Respostas parciais normalizadas               | —                   | Pendente |

## Cobertura mínima da matriz

- Pelo menos **1 modelo por categoria** (C1–C7) com resultado registrado.
- Preferência por **fabricantes diversos** (>= 3 fabricantes distintos no total).
- Plataforma registrada: **Windows 10/11 x64**.

## Registro por dispositivo

| Modelo | Fabricante | Categoria(s) | Firmware | Descoberta | Cadastro | Auth | Perfis | Live view | Grid | PTZ | Snapshot | Gravação | Reconexão | Limitações | Evidência |
| ------ | ---------- | ------------ | -------- | ---------- | -------- | ---- | ------ | --------- | ---- | --- | -------- | -------- | --------- | ---------- | --------- |
|        |            |              |          |            |          |      |        |           |      |     |          |          |           |            |           |

Legenda: `ok` / `parcial` / `não suportado` / `n/a`.

## Limitações registradas

- Listar aqui, por dispositivo, qualquer funcionalidade não suportada ou
  divergência de implementação (ex.: PTZ ausente, snapshot sem URI, H.265 sem
  fallback licenciado, firmware sem Media/Media2).
- Essas limitações não impedem a versão quando estão **explicitamente
  permitidas pelas specs** (resultados parciais são parte do contrato).

## Evidência

- Screenshots, vídeos curtos, arquivos de diagnóstico sanitizados e capturas
  de tela devem ser anexados ou referenciados por caminho no registro acima.
