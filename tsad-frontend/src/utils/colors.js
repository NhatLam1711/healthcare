// Deterministic, well-spread color per feature index (golden-angle hue rotation)
// so the same feature always gets the same color across re-renders and reloads.
export function getFeatureColor(index) {
  const hue = (index * 137.508) % 360;
  return `hsl(${hue}, 70%, 45%)`;
}
