## Context

See proposal.md. Electron isolates filesystem operations in main and SQLite in a utility process. Existing library requests return complete catalog lists; recording paths reference segments and previews use a dedicated directory.

## Goals / Non-Goals

**Goals:** additive compatibility, typed validated IPC, bounded exports, coherent dark UI, preservation of original media.

**Non-Goals:** cloud uploads, motion detection, new dependencies or changing camera capture protocols.

## Decisions

- Add a media metadata table via the existing migration system, with kind/id keys, favorite/protection/tags/notes and optional recording source. Persist via database worker rather than renderer storage.
- Filter catalog metadata in renderer initially; paginate preview loading and poll every ten seconds only while visible. Reconcile selection and keep existing page on background updates.
- Use separate reusable dialog, media viewer and timeline components. Local calendar boundaries define filters; recordings use interval overlap. Timeline is grouped per local day and camera.
- Resolve catalog IDs in main and validate real paths for filesystem actions. Native save/directory dialogs choose export destinations; exclusive copies prevent accidental overwrite. Reuse bundled FFmpeg for precise MP4 clip export with a single job and timeout.
- Retention defaults off; zero age/size means that individual constraint is disabled. Run periodically while app is open, oldest first, with non-reentrant execution. Serialize destructive operations against protection updates, preserve active and protected media and report last result.
- Keep favorites distinct from explicit protection. Metadata is also searchable by text. Viewer dialogs manage focus and keyboard shortcuts.

## Risks / Trade-offs

- Large catalogs require metadata reads → no media bytes are loaded until visible; server pagination can follow separately.
- Export encoding consumes CPU → one clip job at a time, bounded duration and runtime.
- User-selected retention deletes data → disabled by default, explicit save confirmation and persistent protection controls.
- External file removal or filesystem errors → validate paths, report failures and never claim an operation succeeded without confirmation.

## Migration Plan

Additive SQLite migration creates metadata storage without changing existing records. Existing configuration receives disabled retention defaults. Rollback application code can ignore the extra table/config keys; deleted media cannot be restored, so retention requires explicit activation.
