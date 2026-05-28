import type { Colony, ColonyTurn, FoundColonyRequest } from '@worldtamer/shared';

export async function foundColony(req: FoundColonyRequest): Promise<number> {
  const res = await fetch('/api/colonies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (res.status === 409) throw new Error('A colony already exists on this world.');
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `Server error ${res.status}`);
  }
  const { id } = await res.json() as { id: number };
  return id;
}

export async function fetchColony(id: number): Promise<{ colony: Colony; turn: ColonyTurn }> {
  const res = await fetch(`/api/colonies/${id}`);
  if (!res.ok) throw new Error(`Colony not found (${res.status})`);
  return res.json();
}
