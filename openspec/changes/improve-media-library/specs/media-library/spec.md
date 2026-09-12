## Purpose

Permitir localizar, examinar, organizar e exportar mídia local por câmera e horário, com limpeza opcional controlada pelo usuário.

## ADDED Requirements

### Requirement: Busca temporal e apresentação
The system SHALL provide camera/date/time filters, today/yesterday/last-seven-days shortcuts, sort direction, day grouping, grid/list views, thumbnail sizing, configurable pagination and automatic refresh preserving navigation.

#### Scenario: Buscar um acontecimento
- **WHEN** a user selects a camera and time interval
- **THEN** matching snapshots and recordings overlapping that interval are shown in the selected order and layout, with explicit empty/error states.

### Requirement: Inspeção interna
The system SHALL provide snapshot zoom, pan, fullscreen, keyboard navigation and two-image comparison, plus playable recording thumbnails, status icons and text, start/end times and a per-camera day timeline with gaps.

#### Scenario: Examinar mídia
- **WHEN** a user opens a snapshot or selects an available timeline segment
- **THEN** the corresponding internal viewer opens and the recording seeks to the selected time when applicable.

### Requirement: Organização e exportação
The system SHALL persist favorites, tags, notes and explicit protection, support confirmed multi-delete and multi-export with partial-failure feedback, and provide save-copy and reveal-in-folder actions.

#### Scenario: Operação em lote
- **WHEN** a user acts on selected items
- **THEN** only selected items are processed, protected/active files cannot be deleted, and successes and failures are reported separately.

### Requirement: Derivar imagens e trechos
The system SHALL save a playback frame linked to its source recording and offset and export a user-selected valid time range without modifying the original.

#### Scenario: Capturar momento
- **WHEN** a user captures a decoded playback frame
- **THEN** a new snapshot is catalogued with the source recording and corresponding timestamp.

### Requirement: Retenção opcional
The system SHALL default retention to disabled, allow age and/or storage limits, preserve protected items and active recordings, and indicate errors or limits that cannot be satisfied.

#### Scenario: Aplicar limpeza
- **WHEN** enabled retention runs
- **THEN** oldest eligible files are removed under the configured limits, without deleting outside the library or following unsafe links.
