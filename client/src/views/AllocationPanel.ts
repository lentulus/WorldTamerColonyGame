import type { TurnResolution, ColonyTurn } from '@worldtamer/shared';
import { allocateRations, allocateMaterials, allocateIndustrial, finalizeTurn } from '../api/turns.js';
import { fetchSuggestion } from '../api/colonies.js';

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
    <label class="alloc-label" for="${id}">${label} <span id="${id}-badge" class="suggested-badge" style="display:none">suggested</span></label>
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

// ── Industrial output section ─────────────────────────────────────────────────

function buildIndustrialSection(
  resolution: TurnResolution,
  onAllocated: (ss: number, slIndex: number) => void,
): HTMLElement {
  const qi = resolution.q_i;

  const section = document.createElement('div');
  section.className = 'alloc-section';
  section.innerHTML = `
    <div class="alloc-header">Industrial Output</div>
    <div class="alloc-info">
      <div class="alloc-row alloc-total"><span>Available</span><span>${fmt(qi)} Cr</span></div>
    </div>
    <div class="alloc-fields">
      ${numInput('in-cap', 'New capital',    qi)}
      ${numInput('in-hou', 'Housing (100Cr/m³)', qi)}
      ${numInput('in-cg',  'Consumer goods', qi)}
      ${numInput('in-afl', 'Armed forces',   qi)}
      ${numInput('in-exp', 'Export',         qi)}
      ${numInput('in-rd',  'Road network',   qi)}
    </div>
    <div class="alloc-balance">
      Remaining: <span id="in-remaining">${fmt(qi)} Cr</span>
    </div>
    <div id="in-housing-preview" class="alloc-sn-preview" style="display:none"></div>
    <div id="in-error" class="error-msg" style="display:none"></div>
    <button id="in-submit" class="btn-alloc">Submit Industrial</button>
  `;

  const inputs   = section.querySelectorAll<HTMLInputElement>('.alloc-input');
  const remEl    = section.querySelector<HTMLSpanElement>('#in-remaining')!;
  const preview  = section.querySelector<HTMLDivElement>('#in-housing-preview')!;
  const errEl    = section.querySelector<HTMLDivElement>('#in-error')!;
  const submitBtn = section.querySelector<HTMLButtonElement>('#in-submit')!;

  function updateBalance() {
    const cap = Number(section.querySelector<HTMLInputElement>('#in-cap')!.value) || 0;
    const hou = Number(section.querySelector<HTMLInputElement>('#in-hou')!.value) || 0;
    const cg  = Number(section.querySelector<HTMLInputElement>('#in-cg')!.value)  || 0;
    const afl = Number(section.querySelector<HTMLInputElement>('#in-afl')!.value) || 0;
    const exp = Number(section.querySelector<HTMLInputElement>('#in-exp')!.value) || 0;
    const rd  = Number(section.querySelector<HTMLInputElement>('#in-rd')!.value)  || 0;
    const rem = qi - cap - hou - cg - afl - exp - rd;
    remEl.textContent = `${fmt(rem)} Cr`;
    remEl.style.color = rem < -0.01 ? 'var(--color-warn)' : '';

    if (hou > 0) {
      preview.style.display = 'block';
      preview.textContent = `+${fmt(hou / 100, 0)} m³ housing from construction`;
    } else {
      preview.style.display = 'none';
    }
  }

  inputs.forEach(inp => inp.addEventListener('input', updateBalance));
  updateBalance();

  submitBtn.addEventListener('click', async () => {
    errEl.style.display = 'none';
    const cap = Number(section.querySelector<HTMLInputElement>('#in-cap')!.value) || 0;
    const hou = Number(section.querySelector<HTMLInputElement>('#in-hou')!.value) || 0;
    const cg  = Number(section.querySelector<HTMLInputElement>('#in-cg')!.value)  || 0;
    const afl = Number(section.querySelector<HTMLInputElement>('#in-afl')!.value) || 0;
    const exp = Number(section.querySelector<HTMLInputElement>('#in-exp')!.value) || 0;
    const rd  = Number(section.querySelector<HTMLInputElement>('#in-rd')!.value)  || 0;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';
    try {
      const result = await allocateIndustrial(resolution.colony_id, {
        to_capital_cr: cap, to_housing_cr: hou, to_consumer_goods_cr: cg,
        to_armed_forces_cr: afl, to_export_cr: exp, to_road_network_cr: rd,
      });
      submitBtn.textContent =
        `Submitted — SS ${result.ss.toFixed(0)} m³ · SL ${result.sl_index >= 0 ? '+' : ''}${result.sl_index}`;
      inputs.forEach(inp => { inp.disabled = true; });
      onAllocated(result.ss, result.sl_index);
    } catch (err) {
      errEl.textContent = (err as Error).message;
      errEl.style.display = 'block';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Industrial';
    }
  });

  return section;
}

// ── Labor reassignment + Advance Turn ────────────────────────────────────────

function buildLaborSection(
  resolution: TurnResolution,
  turn: ColonyTurn,
  onFinalized: () => void,
): HTMLElement {
  const section = document.createElement('div');
  section.className = 'alloc-section';

  section.innerHTML = `
    <div class="alloc-header">Labour (next month)</div>
    <div class="alloc-fields">
      ${numInput('lb-al',  'Agriculture', turn.total_laborers)}
      ${numInput('lb-il',  'Industry',    turn.total_laborers)}
      ${numInput('lb-ml',  'Materials',   turn.total_laborers)}
      ${numInput('lb-afl', 'Armed Forces',turn.total_laborers)}
    </div>
    <div class="alloc-balance">
      Unassigned: <span id="lb-remaining">${fmt(turn.total_laborers, 0)}</span>
    </div>
    <div id="lb-error" class="error-msg" style="display:none"></div>
    <button id="lb-advance" class="btn-advance">Advance Turn</button>
  `;

  // Pre-fill current values
  (section.querySelector<HTMLInputElement>('#lb-al')!).value  = String(turn.al);
  (section.querySelector<HTMLInputElement>('#lb-il')!).value  = String(turn.il);
  (section.querySelector<HTMLInputElement>('#lb-ml')!).value  = String(turn.ml);
  (section.querySelector<HTMLInputElement>('#lb-afl')!).value = String(turn.afl);

  const remEl    = section.querySelector<HTMLSpanElement>('#lb-remaining')!;
  const errEl    = section.querySelector<HTMLDivElement>('#lb-error')!;
  const advBtn   = section.querySelector<HTMLButtonElement>('#lb-advance')!;

  function updateBalance() {
    const a = Number(section.querySelector<HTMLInputElement>('#lb-al')!.value)  || 0;
    const i = Number(section.querySelector<HTMLInputElement>('#lb-il')!.value)  || 0;
    const m = Number(section.querySelector<HTMLInputElement>('#lb-ml')!.value)  || 0;
    const f = Number(section.querySelector<HTMLInputElement>('#lb-afl')!.value) || 0;
    const rem = turn.total_laborers - a - i - m - f;
    remEl.textContent = fmt(rem, 0);
    remEl.style.color = rem < 0 ? 'var(--color-warn)' : '';
  }

  section.querySelectorAll<HTMLInputElement>('.alloc-input')
    .forEach(inp => inp.addEventListener('input', updateBalance));
  updateBalance();

  advBtn.addEventListener('click', async () => {
    errEl.style.display = 'none';
    const al  = Number(section.querySelector<HTMLInputElement>('#lb-al')!.value)  || 0;
    const il  = Number(section.querySelector<HTMLInputElement>('#lb-il')!.value)  || 0;
    const ml  = Number(section.querySelector<HTMLInputElement>('#lb-ml')!.value)  || 0;
    const afl = Number(section.querySelector<HTMLInputElement>('#lb-afl')!.value) || 0;

    advBtn.disabled = true;
    advBtn.textContent = 'Finalizing…';
    try {
      await finalizeTurn(resolution.colony_id, { al, il, ml, afl });
      advBtn.textContent = 'Turn advanced';
      onFinalized();
    } catch (err) {
      errEl.textContent = (err as Error).message;
      errEl.style.display = 'block';
      advBtn.disabled = false;
      advBtn.textContent = 'Advance Turn';
    }
  });

  return section;
}

// ── AllocationPanel ───────────────────────────────────────────────────────────

export function AllocationPanel(
  colonyId: number,
  resolution: TurnResolution | null,
  turn: ColonyTurn,
  onSnUpdated: (sn: number) => void,
  onIndustrialAllocated?: (ss: number, slIndex: number) => void,
  onTurnFinalized?: () => void,
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

  // Suggest button — fetches policy suggestion and pre-fills all fields
  const suggestBtn = document.createElement('button');
  suggestBtn.className = 'btn-suggest';
  suggestBtn.textContent = 'Suggest allocations';
  root.appendChild(suggestBtn);

  // Clear badge when user manually edits a field (isTrusted = false for programmatic events)
  root.addEventListener('input', (e) => {
    if (!(e as InputEvent).isTrusted) return;
    const input = e.target as HTMLInputElement;
    const badge = root.querySelector<HTMLSpanElement>(`#${input.id}-badge`);
    if (badge) badge.style.display = 'none';
  });

  function fill(selector: string, value: number) {
    const input = root.querySelector<HTMLInputElement>(selector);
    if (!input) return;
    input.value = String(value);
    const badge = root.querySelector<HTMLSpanElement>(`#${input.id}-badge`);
    if (badge) badge.style.display = '';
  }

  suggestBtn.addEventListener('click', async () => {
    suggestBtn.disabled = true;
    suggestBtn.textContent = 'Loading…';
    try {
      const s = await fetchSuggestion(colonyId);
      const availR = resolution.rations_available;
      const availM = resolution.raw_materials_available;
      const qi     = resolution.q_i;
      const total  = turn.total_laborers;

      fill('#ra-pop', Math.floor(s.rations.to_population_frac * availR));
      fill('#ra-exp', Math.floor(s.rations.to_export_frac * availR));

      fill('#rm-ag',  Math.floor(s.materials.to_agriculture_frac * availM));
      fill('#rm-ind', Math.floor(s.materials.to_industry_frac * availM));
      fill('#rm-exp', Math.floor(s.materials.to_export_frac * availM));

      fill('#in-cap', Math.floor(s.industrial.to_capital_frac * qi));
      fill('#in-hou', Math.floor(s.industrial.to_housing_frac * qi));
      fill('#in-cg',  Math.floor(s.industrial.to_consumer_goods_frac * qi));
      fill('#in-rd',  Math.floor(s.industrial.to_road_frac * qi));

      const al  = Math.floor(s.labour.al_frac * total);
      const il  = Math.floor(s.labour.il_frac * total);
      const ml  = Math.floor(s.labour.ml_frac * total);
      const afl = Math.max(0, total - al - il - ml);
      fill('#lb-al',  al);
      fill('#lb-il',  il);
      fill('#lb-ml',  ml);
      fill('#lb-afl', afl);

      // Trigger balance-display updates in every section
      root.querySelectorAll<HTMLInputElement>('.alloc-input').forEach(inp =>
        inp.dispatchEvent(new Event('input', { bubbles: true }))
      );

      suggestBtn.textContent = 'Suggest allocations';
      suggestBtn.disabled = false;
    } catch (err) {
      const msg = (err as Error).message === '503'
        ? 'No trained policy'
        : 'Suggestion failed';
      suggestBtn.textContent = msg;
      setTimeout(() => {
        suggestBtn.textContent = 'Suggest allocations';
        suggestBtn.disabled = false;
      }, 3000);
    }
  });

  root.appendChild(buildRationsSection(resolution, turn, onSnUpdated));
  root.appendChild(buildMaterialsSection(resolution, turn));
  root.appendChild(buildIndustrialSection(resolution, (ss, slIndex) => {
    onIndustrialAllocated?.(ss, slIndex);
  }));
  root.appendChild(buildLaborSection(resolution, turn, () => {
    onTurnFinalized?.();
  }));

  return root;
}
