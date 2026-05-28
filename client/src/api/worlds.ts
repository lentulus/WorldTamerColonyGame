import type { WorldCandidate, WorldListParams } from '@worldtamer/shared';

export async function fetchWorlds(params: WorldListParams): Promise<WorldCandidate[]> {
  const q = new URLSearchParams();
  q.set('max_dist_pc', String(params.max_dist_pc));
  if (params.center_x_pc != null) q.set('center_x_pc', String(params.center_x_pc));
  if (params.center_y_pc != null) q.set('center_y_pc', String(params.center_y_pc));
  if (params.center_z_pc != null) q.set('center_z_pc', String(params.center_z_pc));
  if (params.min_habitability != null) q.set('min_habitability', String(params.min_habitability));
  if (params.limit != null) q.set('limit', String(params.limit));
  if (params.offset != null) q.set('offset', String(params.offset));

  const res = await fetch(`/api/worlds?${q}`);
  if (!res.ok) throw new Error(`World list failed: ${res.status}`);
  return res.json();
}
