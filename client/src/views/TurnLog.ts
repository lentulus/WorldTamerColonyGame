import type { TurnResolution } from '@worldtamer/shared';
import { rollTurn } from '../api/colonies.js';

function sign(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

function dmLabel(dm: number, adjusted: number): string {
  return `roll adjusted to ${adjusted} (DM ${sign(dm)})`;
}

function multStr(m: number): string {
  return `×${m.toFixed(2)}`;
}

function renderResolution(r: TurnResolution): string {
  // ── Step 1 ────────────────────────────────────────────────────────────────
  const wOutcome = r.weather.outcome.replace(/_/g, ' ');
  const wDetail = r.weather.dm !== 0
    ? ` &mdash; ${dmLabel(r.weather.dm, r.weather.adjusted)}`
    : '';

  let reLine: string;
  if (!r.random_event.triggered) {
    reLine = `Trigger roll ${r.random_event.trigger_roll} — no event`;
  } else {
    reLine = `Trigger roll ${r.random_event.trigger_roll} ≥ 16 → event roll ${r.random_event.event_roll}`;
  }

  const ptBefore  = r.political.new_track - r.political.track_movement;
  const ptChange  = r.political.track_movement !== 0
    ? ` &nbsp;·&nbsp; track ${sign(r.political.track_movement)}: ${sign(ptBefore)} → ${sign(r.political.new_track)}`
    : '';
  const pOutputNote = r.political.output_dm !== 0
    ? ` (output DM ${sign(r.political.output_dm)})`
    : '';
  const pDetail = r.political.dm !== 0
    ? ` &mdash; ${dmLabel(r.political.dm, r.political.adjusted)}`
    : '';

  // ── Step 2 ────────────────────────────────────────────────────────────────
  const ag  = r.output_rolls.agriculture;
  const ind = r.output_rolls.industry;
  const mat = r.output_rolls.materials;

  const agDetail  = ag.dm  !== 0 ? ` &mdash; ${dmLabel(ag.dm,  ag.adjusted)}`  : '';
  const indDetail = ind.dm !== 0 ? ` &mdash; ${dmLabel(ind.dm, ind.adjusted)}` : '';
  const matDetail = mat.dm !== 0 ? ` &mdash; ${dmLabel(mat.dm, mat.adjusted)}` : '';

  // ── Alerts ────────────────────────────────────────────────────────────────
  const weatherAlert = r.weather.outcome !== 'none'
    ? `<div class="turn-alert turn-alert--weather">${r.weather.description}</div>`
    : '';
  const eventAlert = r.random_event.triggered && r.random_event.description
    ? `<div class="turn-alert turn-alert--event">${r.random_event.description}</div>`
    : '';

  return `
    ${weatherAlert}${eventAlert}
    <div class="turn-section">
      <div class="turn-step-label">Step 1 — Events &amp; Politics (Month ${r.month})</div>
      <div class="turn-row">
        <span class="turn-key">Weather</span>
        <span>roll ${r.weather.roll}${wDetail} → <strong>${wOutcome}</strong></span>
      </div>
      <div class="turn-row">
        <span class="turn-key">Random event</span>
        <span>${reLine}</span>
      </div>
      <div class="turn-row">
        <span class="turn-key">Political</span>
        <span>roll ${r.political.roll}${pDetail} → <strong>${r.political.outcome}</strong>${pOutputNote}${ptChange}</span>
      </div>
    </div>

    <div class="turn-section">
      <div class="turn-step-label">Step 2 — Output Rolls</div>
      <div class="turn-row">
        <span class="turn-key">Agriculture</span>
        <span>roll ${ag.roll}${agDetail} → <strong>${multStr(ag.multiplier)}</strong></span>
      </div>
      <div class="turn-row">
        <span class="turn-key">Industry</span>
        <span>roll ${ind.roll}${indDetail} → <strong>${multStr(ind.multiplier)}</strong></span>
      </div>
      <div class="turn-row">
        <span class="turn-key">Materials</span>
        <span>roll ${mat.roll}${matDetail} → <strong>${multStr(mat.multiplier)}</strong></span>
      </div>
    </div>
  `;
}

export function TurnLog(
  colonyId: number,
  onTurnRolled: (res: TurnResolution) => void,
): HTMLElement {
  const root = document.createElement('div');
  root.className = 'turn-log';

  const header = document.createElement('div');
  header.className = 'turn-log-header';
  header.innerHTML = '<h3>Turn Resolution</h3>';

  const btn = document.createElement('button');
  btn.className = 'btn-roll';
  btn.textContent = 'Roll Turn';
  header.appendChild(btn);

  const body = document.createElement('div');
  body.className = 'turn-log-body';
  body.innerHTML = '<p class="muted">Press Roll Turn to begin the month.</p>';

  root.appendChild(header);
  root.appendChild(body);

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Rolling…';
    try {
      const res = await rollTurn(colonyId);
      body.innerHTML = renderResolution(res);
      onTurnRolled(res);
      btn.textContent = 'Turn rolled';
    } catch (err) {
      body.innerHTML = `<p class="error-msg">${(err as Error).message}</p>`;
      btn.disabled = false;
      btn.textContent = 'Roll Turn';
    }
  });

  return root;
}
