import { fetchWorlds } from '../api/worlds.js';
import type { WorldCandidate } from '@worldtamer/shared';

export function WorldList(onSelect: (world: WorldCandidate) => void): HTMLElement {
  const root = document.createElement('div');
  root.className = 'world-list';

  root.innerHTML = `
    <h2>Select a World</h2>
    <div class="wl-filters">
      <label>Max distance from Sol (pc)
        <input id="wl-dist" type="number" value="20" min="1" max="500" step="1">
      </label>
      <label>Min habitability (0–19)
        <input id="wl-hab" type="number" value="1" min="0" max="19" step="1">
      </label>
      <button id="wl-search">Search</button>
    </div>
    <div id="wl-status" class="wl-status"></div>
    <table id="wl-table" class="wl-table" style="display:none">
      <thead>
        <tr>
          <th>World</th>
          <th>Type</th>
          <th>Atmosphere</th>
          <th>Hab</th>
          <th>RVM</th>
          <th>Dist (pc)</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="wl-body"></tbody>
    </table>`;

  const distInput    = root.querySelector<HTMLInputElement>('#wl-dist')!;
  const habInput     = root.querySelector<HTMLInputElement>('#wl-hab')!;
  const searchBtn    = root.querySelector<HTMLButtonElement>('#wl-search')!;
  const statusEl     = root.querySelector<HTMLDivElement>('#wl-status')!;
  const tableEl      = root.querySelector<HTMLTableElement>('#wl-table')!;
  const tbodyEl      = root.querySelector<HTMLTableSectionElement>('#wl-body')!;

  function setStatus(msg: string, isError = false) {
    statusEl.textContent = msg;
    statusEl.style.color = isError ? 'var(--color-warn, #c04)' : '';
  }

  async function doSearch() {
    const max_dist_pc     = Number(distInput.value);
    const min_habitability = Number(habInput.value);

    if (isNaN(max_dist_pc) || max_dist_pc <= 0) {
      setStatus('Enter a valid distance.', true);
      return;
    }

    searchBtn.disabled = true;
    tableEl.style.display = 'none';
    setStatus('Searching Meridian…');

    try {
      const worlds = await fetchWorlds({ max_dist_pc, min_habitability });
      tbodyEl.innerHTML = '';

      if (worlds.length === 0) {
        setStatus(`No habitable worlds found within ${max_dist_pc} pc.`);
      } else {
        setStatus(`${worlds.length} world${worlds.length === 1 ? '' : 's'} found.`);
        for (const w of worlds) {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${w.system_name} ${w.body_position}</td>
            <td>${w.world_type}</td>
            <td>${w.atmosphere_code}</td>
            <td>${w.habitability}</td>
            <td>${w.rvm >= 0 ? '+' : ''}${w.rvm}</td>
            <td>${w.dist_pc.toFixed(2)}</td>
            <td><button class="wl-select-btn">Select</button></td>`;
          tr.querySelector('.wl-select-btn')!.addEventListener('click', () => onSelect(w));
          tbodyEl.appendChild(tr);
        }
        tableEl.style.display = '';
      }
    } catch (err) {
      setStatus(`Error: ${(err as Error).message}`, true);
    } finally {
      searchBtn.disabled = false;
    }
  }

  searchBtn.addEventListener('click', doSearch);
  // Run an initial search on load
  doSearch();

  return root;
}
