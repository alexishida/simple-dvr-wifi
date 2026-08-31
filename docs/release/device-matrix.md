# Matriz de validação com câmeras reais

Registro obrigatório para a tarefa 15.1 (e 15.2/15.3/15.5) do MVP. Cada
categoria abaixo deve ter ao menos um modelo validado antes da versão estável.
O objetivo não é promessa de compatibilidade universal, mas evidência por
categoria e plataforma, incluindo limitações conhecidas.

## Categorias obrigatórias

| #   | Categoria        | Critério mínimo                               | Modelos registrados                        | Status    |
| --- | ---------------- | --------------------------------------------- | ------------------------------------------ | --------- |
| C1  | Somente RTSP     | Sem ONVIF; cadastro manual por URL RTSP       | Tapo (modelo a confirmar)                  | Em teste  |
| C2  | ONVIF básica     | Descoberta/identidade/Media válidos           | Intelbras iM4-C; Tapo se aplicar           | Testado ✔ |
| C3  | PTZ              | Capacidades PTZ confirmadas                   | Intelbras iM4-C (PTZ configurado)          | Em teste  |
| C4  | H.264            | Stream H.264 reproduzível                     | Intelbras iM4-C; Tapo                      | Testado ✔ |
| C5  | H.265 aplicável  | H.265 quando a plataforma licenciada suportar | Tapo (confirmar se expõe H.265)            | Em teste  |
| C6  | Firmware antigo  | ONVIF antigo/incompleto tolerado              | —                                          | Pendente  |
| C7  | ONVIF incompleto | Respostas parciais normalizadas               | Intelbras iM4-C (sem Media XAddr/snapshot) | Testado ✔ |

## Cobertura mínima da matriz

- Pelo menos **1 modelo por categoria** (C1–C7) com resultado registrado.
- Preferência por **fabricantes diversos** (>= 3 fabricantes distintos no total).
- Plataforma registrada: **Windows 10/11 x64**.

**Cobertura atual:** 2 fabricantes (Intelbras, Tapo) → falta modelo para C6
(firmware antigo); C1/C5 dependem da Tapo.

## Registro por dispositivo

| Modelo                    | Fabricante     | Categoria(s)   | Firmware                     | Descoberta | Cadastro | Auth        | Perfis                                | Live view | Grid      | PTZ         | Snapshot      | Gravação  | Reconexão | Limitações                                                                               | Evidência                |
| ------------------------- | -------------- | -------------- | ---------------------------- | ---------- | -------- | ----------- | ------------------------------------- | --------- | --------- | ----------- | ------------- | --------- | --------- | ---------------------------------------------------------------------------------------- | ------------------------ |
| Intelbras iM4-C           | Intelbras      | C2, C3, C4, C7 | 2.800.00IB003.0.R 2026-06-10 | a validar  | ok       | ok (digest) | 2 (main 1920x1080@20, sub 640x480@15) | a validar | a validar | configurado | n/d (sem URI) | a validar | a validar | Snapshot não declarado via ONVIF; Media XAddr ausente; digest HTTP em vez de WS-Security | `results/intelbras.json` |
| Tapo (modelo a confirmar) | Tapo (TP-Link) | C1, C4, C5     |                              |            |          |             |                                       |           |           |             |               |           |           |                                                                                          |                          |

Legenda: `ok` / `parcial` / `não suportado` / `n/a`.

## Limitações registradas

- **Intelbras iM4-C:** não expõe `GetSnapshotUri` via ONVIF (fallback FFmpeg será
  usado); `GetCapabilities` não retorna Media XAddr, mas os streams RTSP são
  descobertos via `GetStreamUri`; usa Digest HTTP no ONVIF e no RTSP (não
  WS-Security/UsernameToken).
- Listar aqui, por dispositivo, qualquer funcionalidade não suportada ou
  divergência de implementação (ex.: PTZ ausente, snapshot sem URI, H.265 sem
  fallback licenciado, firmware sem Media/Media2).
- Essas limitações não impedem a versão quando estão **explicitamente
  permitidas pelas specs** (resultados parciais são parte do contrato).

## Evidência

- Screenshots, vídeos curtos, arquivos de diagnóstico sanitizados e capturas
  de tela devem ser anexados ou referenciados por caminho no registro acima.
