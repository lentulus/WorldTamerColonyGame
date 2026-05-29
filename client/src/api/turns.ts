import type { RationAllocation, MaterialsAllocation, IndustrialAllocation, FinalizeRequest, ColonyTurn } from '@worldtamer/shared';

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

export async function finalizeTurn(
  colonyId: number,
  req: FinalizeRequest,
): Promise<{ month: number; turn: ColonyTurn }> {
  const res = await fetch(`/api/colonies/${colonyId}/turn/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `Server error ${res.status}`);
  }
  return res.json();
}

export async function allocateIndustrial(
  colonyId: number,
  allocation: IndustrialAllocation,
): Promise<{ q_i: number; new_housing_m3: number; ss: number; sl_value: number; sl_index: number }> {
  const res = await fetch(`/api/colonies/${colonyId}/turn/allocate-industrial`, {
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
