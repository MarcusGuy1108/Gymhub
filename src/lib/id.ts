let counter = 0;

/** Short unique id; collisions are practically impossible on one device. */
export function uid(): string {
  counter = (counter + 1) % 1679616;
  return (
    Date.now().toString(36) +
    counter.toString(36).padStart(4, '0') +
    Math.random().toString(36).slice(2, 8)
  );
}
