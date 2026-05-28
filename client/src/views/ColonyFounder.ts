import { foundColony } from '../api/colonies.js';
import type { WorldCandidate, FoundColonyRequest } from '@worldtamer/shared';

export function ColonyFounder(
  world: WorldCandidate,
  onFounded: (colonyId: number) => void,
  onBack: () => void,
): HTMLElement {
  const root = document.createElement('div');
  root.className = 'founder';

  root.innerHTML = `
    <div class="founder-header">
      <button id="cf-back">← Back</button>
      <h2>Found Colony — ${world.system_name} ${world.body_position}</h2>
      <div class="world-badge">${world.world_type} · Hab ${world.habitability} · RVM ${world.rvm >= 0 ? '+' : ''}${world.rvm} · ${world.dist_pc.toFixed(2)} pc</div>
    </div>

    <form id="cf-form" class="founder-form">
      <section>
        <h3>Colony</h3>
        <label>Name <input name="name" required placeholder="New Hope"></label>
        <label>Colony TL <input name="tech_level" type="number" min="0" max="15" value="8"></label>
        <label>Colonists' home TL <input name="home_tl" type="number" min="0" max="15" value="8"></label>
      </section>

      <section>
        <h3>Laborers</h3>
        <div class="grid-4">
          <label>Agricultural<input name="al" type="number" min="0" value="60"></label>
          <label>Industrial<input name="il" type="number" min="0" value="20"></label>
          <label>Materials<input name="ml" type="number" min="0" value="15"></label>
          <label>Armed Forces<input name="afl" type="number" min="0" value="5"></label>
        </div>
      </section>

      <section>
        <h3>Capital</h3>
        <div class="grid-3">
          <label>Ag. capital units<input name="ac" type="number" min="0" value="40"></label>
          <label>Light industry<input name="ic_light" type="number" min="0" value="10"></label>
          <label>Heavy industry<input name="ic_heavy" type="number" min="0" value="5"></label>
          <label>Construction<input name="ic_construction" type="number" min="0" value="5"></label>
          <label>Materials capital<input name="mc" type="number" min="0" value="10"></label>
          <label>Power (KW)<input name="power_kw" type="number" min="0" value="500"></label>
        </div>
      </section>

      <section>
        <h3>Stockpiles</h3>
        <div class="grid-3">
          <label>Rations<input name="rations" type="number" min="0" value="100"></label>
          <label>Raw materials (t)<input name="raw_materials_t" type="number" min="0" value="50"></label>
          <label>Housing (m³)<input name="housing_m3" type="number" min="0" value="10000"></label>
          <label>Debt (Cr)<input name="debt_cr" type="number" min="0" value="0"></label>
        </div>
      </section>

      <div id="cf-error" class="error-msg" style="display:none"></div>
      <button type="submit" id="cf-submit">Establish Colony</button>
    </form>`;

  root.querySelector('#cf-back')!.addEventListener('click', onBack);

  const form = root.querySelector<HTMLFormElement>('#cf-form')!;
  const errorEl = root.querySelector<HTMLDivElement>('#cf-error')!;
  const submitBtn = root.querySelector<HTMLButtonElement>('#cf-submit')!;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.style.display = 'none';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Establishing…';

    const fd = new FormData(form);
    const n = (k: string) => Number(fd.get(k));

    const req: FoundColonyRequest = {
      body_id:   world.body_id,
      system_id: world.system_id,
      name:      String(fd.get('name')).trim(),
      tech_level: n('tech_level'),
      home_tl:    n('home_tl'),
      al: n('al'), il: n('il'), ml: n('ml'), afl: n('afl'),
      ac: n('ac'), ic_light: n('ic_light'), ic_heavy: n('ic_heavy'),
      ic_construction: n('ic_construction'), mc: n('mc'),
      power_kw:        n('power_kw'),
      rations:         n('rations'),
      raw_materials_t: n('raw_materials_t'),
      housing_m3:      n('housing_m3'),
      debt_cr:         n('debt_cr'),
    };

    try {
      const id = await foundColony(req);
      onFounded(id);
    } catch (err) {
      errorEl.textContent = (err as Error).message;
      errorEl.style.display = '';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Establish Colony';
    }
  });

  return root;
}
