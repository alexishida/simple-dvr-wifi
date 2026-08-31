# Design System

Este arquivo define o padrão visual do projeto.
Use estas diretrizes como referência ao criar ou alterar CSS, componentes e telas, mantendo consistência de layout, tipografia, cores, espaçamento e comportamento responsivo.

## Princípios

- **Tema escuro por padrão**, foco em monitoramento de longa duração.
- **Estados visuais sempre com ícone + cor + texto**, nunca apenas cor.
- **Vídeo protegido**: o grid de câmeras é a área central; controles aparecem por hover/foco.
- **Hierarquia clara**: navegação lateral compacta, dashboard como rota inicial.
- **Acessibilidade básica**: foco visível, labels, contraste adequado, alvos utilizáveis por teclado.

## Tokens

Todos os tokens estão centralizados em `src/renderer/styles.css` como variáveis CSS (`:root`).

### Cor

| Token                        | Valor            | Uso                                            |
| ---------------------------- | ---------------- | ---------------------------------------------- |
| `--color-bg`                 | `#0d1117`        | Fundo da aplicação                             |
| `--color-surface`            | `#151b23`        | Superfícies (sidebar, painéis)                 |
| `--color-surface-raised`     | `#1c2430`        | Cards, overlays                                |
| `--color-surface-hover`      | `#232d3a`        | Hover em superfícies interativas               |
| `--color-border`             | `#2d3743`        | Bordas                                          |
| `--color-border-strong`      | `#3d4a5a`        | Bordas de destaque                             |
| `--color-text`               | `#e6edf3`        | Texto primário                                 |
| `--color-text-secondary`     | `#9da7b3`        | Texto secundário                               |
| `--color-text-muted`         | `#6e7681`        | Texto discreto / placeholders                  |
| `--color-accent`             | `#58c4ff`        | Ação primária, links, foco                     |
| `--color-accent-strong`      | `#7dd3fc`        | Hover do accent                                |
| `--color-on-accent`          | `#0b1e2e`        | Texto sobre accent                             |
| `--color-success`            | `#3fb950`        | Conectado, operação ok                         |
| `--color-warning`            | `#d29922`        | Atenção, reconexão                             |
| `--color-danger`             | `#f85149`        | Erro, auth, storage                            |
| `--color-info`               | `#58c4ff`        | Informativo                                    |

### Tipografia

| Token                 | Valor                                     |
| --------------------- | ----------------------------------------- |
| `--font-sans`         | `Inter, ui-sans-serif, system-ui, ...`    |
| `--font-mono`         | `ui-monospace, SFMono-Regular, Consolas, monospace` |
| `--text-xs`           | `0.75rem / 1.4`                           |
| `--text-sm`           | `0.875rem / 1.5`                          |
| `--text-base`         | `1rem / 1.5`                              |
| `--text-lg`           | `1.125rem / 1.4`                          |
| `--text-xl`           | `1.5rem / 1.3`                            |
| `--text-2xl`          | `2rem / 1.2`                              |

### Espaçamento e raio

| Token             | Valor    |
| ----------------- | -------- |
| `--space-1`       | `0.25rem` |
| `--space-2`       | `0.5rem`  |
| `--space-3`       | `0.75rem` |
| `--space-4`       | `1rem`    |
| `--space-6`       | `1.5rem`  |
| `--space-8`       | `2rem`    |
| `--radius-sm`     | `6px`     |
| `--radius-md`     | `10px`    |
| `--radius-lg`     | `14px`    |
| `--radius-full`   | `999px`   |

### Foco, sombra e transição

| Token                   | Valor                                   |
| ----------------------- | --------------------------------------- |
| `--focus-ring`          | `0 0 0 3px rgba(88, 196, 255, 0.35)`    |
| `--shadow-card`         | `0 1px 2px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.25)` |
| `--transition-fast`     | `120ms ease`                            |
| `--transition-base`     | `180ms ease`                            |

## Componentes

- **Status badge**: `--color-status-*` + texto legível (ex.: "Conectado", "Erro de rede").
- **Camera card**: superfície elevada, nome, host, badge de status, indicadores de credencial/PTZ/gravação.
- **Sidebar**: largura compacta (240px), navegação por seção com estado ativo, recolhível em janelas pequenas.
- **Botões**: accent para ação primária, ghost para secundária; foco visível.