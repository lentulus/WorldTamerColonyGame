import type { Colony, ColonyTurn } from '@worldtamer/shared';

const PT_LABELS: Record<number, string> = {
  3: 'Excellent', 2: 'Very Good', 1: 'Good', 0: 'Fair',
  '-1': 'Marginal', '-2': 'Poor', '-3': 'Terrible',
};

function snColour(sn: number): string {
  if (sn < 0.85) return 'var(--color-warn)';
  if (sn < 0.95) return '#c8a000';
  return '#4caf50';
}

function ssColour(ss: number): string {
  if (ss < 51)  return 'var(--color-warn)';
  if (ss < 81)  return '#c8a000';
  return '#4caf50';
}

function slColour(sl: number): string {
  if (sl < 0.85) return 'var(--color-warn)';
  if (sl < 0.95) return '#c8a000';
  return '#4caf50';
}

function fmt(n: number, dp = 0): string {
  return n.toLocaleString('en', { maximumFractionDigits: dp });
}

export function ColonyStatus(colony: Colony, turn: ColonyTurn): HTMLElement {
  const root = document.createElement('div');
  root.className = 'status-panel';

  const totalPeople = turn.total_laborers * 4;
  const ptLabel = PT_LABELS[turn.political_track] ?? `${turn.political_track}`;

  root.innerHTML = `
    <h3>${colony.name}</h3>
    <div class="status-meta">${colony.system_name} ${colony.world_type}</div>
    <div class="status-meta">Month ${colony.current_month} · TL ${colony.tech_level}</div>

    <div class="status-section">
      <div class="status-label">Population</div>
      <div class="status-row"><span>Total</span><span>~${fmt(totalPeople)}</span></div>
      <div class="status-row"><span>Laborers</span><span>${fmt(turn.total_laborers)}</span></div>
    </div>

    <div class="status-section">
      <div class="status-label">Laborers by sector</div>
      <div class="status-row"><span>Agriculture</span><span>${turn.al}</span></div>
      <div class="status-row"><span>Industry</span><span>${turn.il}</span></div>
      <div class="status-row"><span>Materials</span><span>${turn.ml}</span></div>
      <div class="status-row"><span>Armed Forces</span><span>${turn.afl}</span></div>
    </div>

    <div class="status-section">
      <div class="status-label">Capital</div>
      <div class="status-row"><span>Ag. capital</span><span>${turn.ac}</span></div>
      <div class="status-row"><span>Light industry</span><span>${turn.ic_light}</span></div>
      <div class="status-row"><span>Heavy industry</span><span>${turn.ic_heavy}</span></div>
      <div class="status-row"><span>Construction</span><span>${turn.ic_construction}</span></div>
      <div class="status-row"><span>Materials capital</span><span>${turn.mc}</span></div>
      <div class="status-row"><span>Power</span><span>${fmt(turn.power_kw)} KW</span></div>
    </div>

    <div class="status-section">
      <div class="status-label">Stockpiles</div>
      <div class="status-row"><span>Rations</span><span>${fmt(turn.rations)}</span></div>
      <div class="status-row"><span>Raw materials</span><span>${fmt(turn.raw_materials_t)} t</span></div>
      <div class="status-row"><span>Housing</span><span>${fmt(turn.housing_m3)} m³</span></div>
      <div class="status-row"><span>Debt</span><span>${fmt(turn.debt_cr)} Cr</span></div>
    </div>

    <div class="status-section">
      <div class="status-label">Satisfaction</div>
      <div class="status-row">
        <span>Nutrition (SN)</span>
        <span style="color:${snColour(turn.sn)}">${turn.sn.toFixed(2)}</span>
      </div>
      <div class="status-row">
        <span>Shelter (SS)</span>
        <span style="color:${ssColour(turn.ss)}">${turn.ss.toFixed(0)} m³/lab</span>
      </div>
      <div class="status-row">
        <span>Living (SL)</span>
        <span style="color:${slColour(turn.sl)}">${turn.sl.toFixed(2)}</span>
      </div>
    </div>

    <div class="status-section">
      <div class="status-label">Politics</div>
      <div class="status-row"><span>Political track</span><span>${ptLabel} (${turn.political_track >= 0 ? '+' : ''}${turn.political_track})</span></div>
      <div class="status-row"><span>Acclimatization</span><span>Stage ${colony.acclimatization_stage}/5</span></div>
    </div>`;

  return root;
}
