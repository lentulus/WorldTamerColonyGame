import type { TurnResolution, ColonyTurn } from '@worldtamer/shared';
import { allocateRations, allocateMaterials } from '../api/turns.js';

function fmt(n: number, dp = 1): string {
  return n.toLocaleString('en', { maximumFractionDigits: dp });
}

function snColour(sn: number): string {
  if (sn < 0.85) return 'var(--color-warn)';
  if (sn < 0.95) return '#c8a000';
  return '#4caf50';
}

function numInput(id: string, label: string, max: number): string {
  return `
    <label class="alloc-label" for="${id}">${label}</label>
    <input id="${id}" class="alloc-input" type="number" min="0" step="1"
           value="0" data-max="${max}">`;
}

// ── Rations section ───────────────────────────────────────────────────────────

function buildRationsSection(
  resolution: TurnResolution,
  turn: ColonyTurn,
  onAllocated: (sn: number) => void,
): HTMLElement {
  const avail = resolution.rations_available;
  const produced = resolution.q_a;
  const stockpile = turn.rations;

  const section = document.createElement('div');
  section.className = 'alloc-section';
  section.innerHTML = `
    <div class="alloc-header">Rations</div>
    <div class="alloc-info">
      <div class="alloc-row"><span>Produced</span><span>${fmt(produced)}</span></div>
      <div class="alloc-row"><span>Stockpile</span><span>${fmt(stockpile)}</span></div>
      <div class="alloc-row alloc-total"><span>Available</span><span>${fmt(avail)}</span></div>
    </div>
    <div class="alloc-fields">
      ${numInput('ra-pop', 'To population', avail)}
      ${numInput('ra-stk', 'To stockpile', avail)}
      ${numInput('ra-exp', 'To export', avail)}
      ${numInput('ra-ani', 'To animals', avail)}
    </div>
    <div class="alloc-balance">
      Remaining: <span id="ra-remaining">${fmt(avail)}</span>
    </div>
    <div id="ra-sn-preview" class="alloc-sn-preview" style="display:none"></div>
    <div id="ra-error" class="error-msg" style="display:none"></div>
    <button id="ra-submit" class="btn-alloc">Submit Rations</button>
  `;

  const inputs = section.querySelectorAll<HTMLInputElement>('.alloc-input');
  const remainEl = section.querySelector<HTMLSpanElement>('#ra-remaining')!;
  const snPreview = section.querySelector<HTMLDivElement>('#ra-sn-preview')!;
  const errEl = section.querySelector<HTMLDivElement>('#ra-error')!;
  const submitBtn = section.querySelector<HTMLButtonElement>('#ra-submit')!;

  function updateBalance() {
    const pop  = Number(section.querySelector<HTMLInputElement>('#ra-pop')!.value) || 0;
    const stk  = Number(section.querySelector<HTMLInputElement>('#ra-stk')!.value) || 0;
    const exp  = Number(section.querySelector<HTMLInputElement>('#ra-exp')!.value) || 0;
    const ani  = Number(section.querySelector<HTMLInputElement>('#ra-ani')!.value) || 0;
    const used = pop + stk + exp + ani;
    const remaining = avail - used;
    remainEl.textContent = fmt(remaining);
    remainEl.style.color = remaining < -0.01 ? 'var(--color-warn)' : '';

    const sn = turn.total_laborers > 0 ? pop / turn.total_laborers : 0;
    snPreview.style.display = 'block';
    snPreview.innerHTML = `SN preview: <strong style="color:${snColour(sn)}">${sn.toFixed(2)}</strong>`;
    if (sn < 1.0 && pop > 0) {
      snPreview.innerHTML += ` <span class="alloc-warn">⚠ below subsistence</span>`;
    }
  }

  inputs.forEach(inp => inp.addEventListener('input', updateBalance));
  updateBalance();

  submitBtn.addEventListener('click', async () => {
    errEl.style.display = 'none';
    const pop = Number(section.querySelector<HTMLInputElement>('#ra-pop')!.value) || 0;
    const stk = Number(section.querySelector<HTMLInputElement>('#ra-stk')!.value) || 0;
    const exp = Number(section.querySelector<HTMLInputElement>('#ra-exp')!.value) || 0;
    const ani = Number(section.querySelector<HTMLInputElement>('#ra-ani')!.value) || 0;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';
    try {
      const result = await allocateRations(resolution.colony_id, {
        to_population: pop, to_stockpile: stk,
        to_export: exp, to_animals: ani,
      });
      submitBtn.textContent = `Submitted — SN ${result.sn.toFixed(2)}`;
      inputs.forEach(inp => { inp.disabled = true; });
      onAllocated(result.sn);
    } catch (err) {
      errEl.textContent = (err as Error).message;
      errEl.style.display = 'block';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Rations';
    }
  });

  return section;
}

// ── Raw materials section ─────────────────────────────────────────────────────

function buildMaterialsSection(
  resolution: TurnResolution,
  turn: ColonyTurn,
): HTMLElement {
  const avail = resolution.raw_materials_available;
  const produced = resolution.q_m;
  const stockpile = turn.raw_materials_t;

  const section = document.createElement('div');
  section.className = 'alloc-section';
  section.innerHTML = `
    <div class="alloc-header">Raw Materials</div>
    <div class="alloc-info">
      <div class="alloc-row"><span>Produced</span><span>${fmt(produced)} t</span></div>
      <div class="alloc-row"><span>Stockpile</span><span>${fmt(stockpile)} t</span></div>
      <div class="alloc-row alloc-total"><span>Available</span><span>${fmt(avail)} t</span></div>
    </div>
    <div class="alloc-fields">
      ${numInput('rm-ag',  'Agriculture', avail)}
      ${numInput('rm-ind', 'Industry',    avail)}
      ${numInput('rm-nrg', 'Energy',      avail)}
      ${numInput('rm-stk', 'Stockpile',   avail)}
      ${numInput('rm-exp', 'Export',      avail)}
    </div>
    <div class="alloc-balance">
      Remaining: <span id="rm-remaining">${fmt(avail)} t</span>
    </div>
    <div id="rm-error" class="error-msg" style="display:none"></div>
    <button id="rm-submit" class="btn-alloc">Submit Materials</button>
  `;

  const inputs = section.querySelectorAll<HTMLInputElement>('.alloc-input');
  const remainEl = section.querySelector<HTMLSpanElement>('#rm-remaining')!;
  const errEl = section.querySelector<HTMLDivElement>('#rm-error')!;
  const submitBtn = section.querySelector<HTMLButtonElement>('#rm-submit')!;

  function updateBalance() {
    const ag  = Number(section.querySelector<HTMLInputElement>('#rm-ag')!.value)  || 0;
    const ind = Number(section.querySelector<HTMLInputElement>('#rm-ind')!.value) || 0;
    const nrg = Number(section.querySelector<HTMLInputElement>('#rm-nrg')!.value) || 0;
    const stk = Number(section.querySelector<HTMLInputElement>('#rm-stk')!.value) || 0;
    const exp = Number(section.querySelector<HTMLInputElement>('#rm-exp')!.value) || 0;
    const remaining = avail - ag - ind - nrg - stk - exp;
    remainEl.textContent = `${fmt(remaining)} t`;
    remainEl.style.color = remaining < -0.01 ? 'var(--color-warn)' : '';
  }

  inputs.forEach(inp => inp.addEventListener('input', updateBalance));
  updateBalance();

  submitBtn.addEventListener('click', async () => {
    errEl.style.display = 'none';
    const ag  = Number(section.querySelector<HTMLInputElement>('#rm-ag')!.value)  || 0;
    const ind = Number(section.querySelector<HTMLInputElement>('#rm-ind')!.value) || 0;
    const nrg = Number(section.querySelector<HTMLInputElement>('#rm-nrg')!.value) || 0;
    const stk = Number(section.querySelector<HTMLInputElement>('#rm-stk')!.value) || 0;
    const exp = Number(section.querySelector<HTMLInputElement>('#rm-exp')!.value) || 0;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';
    try {
      await allocateMaterials(resolution.colony_id, {
        to_agriculture: ag, to_industry: ind, to_energy: nrg,
        to_stockpile: stk, to_export: exp,
      });
      submitBtn.textContent = 'Submitted';
      inputs.forEach(inp => { inp.disabled = true; });
    } catch (err) {
      errEl.textContent = (err as Error).message;
      errEl.style.display = 'block';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Materials';
    }
  });

  return section;
}

// ── AllocationPanel ───────────────────────────────────────────────────────────

export function AllocationPanel(
  resolution: TurnResolution | null,
  turn: ColonyTurn,
  onSnUpdated: (sn: number) => void,
): HTMLElement {
  const root = document.createElement('div');
  root.className = 'alloc-panel';

  const header = document.createElement('h3');
  header.textContent = 'Allocation';
  root.appendChild(header);

  if (!resolution) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'Roll the turn to begin allocation.';
    root.appendChild(p);
    return root;
  }

  root.appendChild(buildRationsSection(resolution, turn, onSnUpdated));
  root.appendChild(buildMaterialsSection(resolution, turn));

  const future = document.createElement('p');
  future.className = 'muted';
  future.style.marginTop = '0.75rem';
  future.style.fontSize = '0.8em';
  future.textContent = 'Industrial allocation and labour reassignment arrive in Slice 5–6.';
  root.appendChild(future);

  return root;
}
