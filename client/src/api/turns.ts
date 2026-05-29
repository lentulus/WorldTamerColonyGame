import type { RationAllocation, MaterialsAllocation } from '@worldtamer/shared';

export async function allocateRations(
  colonyId: number,
  allocation: RationAllocation,
): Promise<{ q_a: number; rations_available: number; sn: number }> {
  const res = await fetch(`/api/colonies/${colonyId}/turn/allocate-rations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(allocation),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `Server error ${res.status}`);
  }
  return res.json();
}

export async function allocateMaterials(
  colonyId: number,
  allocation: MaterialsAllocation,
): Promise<{ q_m: number; raw_materials_available: number }> {
  const res = await fetch(`/api/colonies/${colonyId}/turn/allocate-materials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(allocation),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `Server error ${res.status}`);
  }
  return res.json();
}
