import type { Colony, ColonyTurn, FoundColonyRequest, TurnResolution } from '@worldtamer/shared';

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

export interface SuggestionResponse {
  rations:    { to_population_frac: number; to_export_frac: number };
  materials:  { to_agriculture_frac: number; to_industry_frac: number; to_export_frac: number };
  industrial: { to_capital_frac: number; to_housing_frac: number; to_consumer_goods_frac: number; to_road_frac: number };
  labour:     { al_frac: number; il_frac: number; ml_frac: number };
}

export async function fetchSuggestion(id: number): Promise<SuggestionResponse> {
  const res = await fetch(`/api/colonies/${id}/suggest`);
  if (res.status === 503) throw new Error('503');
  if (!res.ok) throw new Error(`Server error ${res.status}`);
  return res.json();
}

export async function rollTurn(id: number): Promise<TurnResolution> {
  const res = await fetch(`/api/colonies/${id}/turn/start`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `Server error ${res.status}`);
  }
  return res.json();
}
