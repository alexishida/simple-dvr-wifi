import type { CameraSummary } from "../shared/contracts.js";

export function buildCameraSlots(
  cameras: CameraSummary[],
  savedSlots: Array<string | null>,
  columns: number,
): Array<CameraSummary | null> {
  const remaining = new Map(
    cameras
      .filter((camera) => camera.active)
      .map((camera) => [camera.id, camera]),
  );
  const slots = savedSlots.map((id) => {
    const camera = id ? remaining.get(id) : undefined;
    if (!camera) return null;
    remaining.delete(camera.id);
    return camera;
  });
  let nextEmpty = 0;
  for (const camera of remaining.values()) {
    while (nextEmpty < slots.length && slots[nextEmpty]) nextEmpty++;
    slots[nextEmpty++] = camera;
  }
  // Keep occupied saved positions even after other cameras are removed.
  let occupiedLength = slots.length;
  while (occupiedLength > 0 && !slots[occupiedLength - 1]) occupiedLength--;
  const count = Math.max(
    columns * columns,
    Math.ceil(occupiedLength / columns) * columns,
  );
  return Array.from({ length: count }, (_, index) => slots[index] ?? null);
}
