import { WorldList } from './views/WorldList.js';
import { ColonyFounder } from './views/ColonyFounder.js';
import { ColonyStatus } from './views/ColonyStatus.js';
import { TurnLog } from './views/TurnLog.js';
import { fetchColony } from './api/colonies.js';
import type { WorldCandidate } from '@worldtamer/shared';

import './style.css';

const app = document.getElementById('app')!;

function showWorldList() {
  app.innerHTML = '';
  app.appendChild(WorldList(showFounder));
}

function showFounder(world: WorldCandidate) {
  app.innerHTML = '';
  app.appendChild(ColonyFounder(world, showColony, showWorldList));
}

async function showColony(colonyId: number) {
  app.innerHTML = '<p class="loading">Loading colony…</p>';
  try {
    const { colony, turn } = await fetchColony(colonyId);
    app.innerHTML = '';

    const layout = document.createElement('div');
    layout.className = 'colony-layout';

    const left = document.createElement('div');
    left.className = 'colony-left';
    left.appendChild(ColonyStatus(colony, turn));

    async function refreshStatus() {
      try {
        const { colony: c2, turn: t2 } = await fetchColony(colonyId);
        left.innerHTML = '';
        left.appendChild(ColonyStatus(c2, t2));
      } catch { /* silent — stale display is acceptable */ }
    }

    const centre = document.createElement('div');
    centre.className = 'colony-centre';
    centre.appendChild(TurnLog(colonyId, () => { refreshStatus(); }));

    const right = document.createElement('div');
    right.className = 'colony-right';
    right.innerHTML = `<h3>Actions</h3><p class="muted">Allocation controls arrive in Slice 4.</p>`;

    layout.appendChild(left);
    layout.appendChild(centre);
    layout.appendChild(right);
    app.appendChild(layout);
  } catch (err) {
    app.innerHTML = `<p class="error-msg">${(err as Error).message}</p>`;
  }
}

showWorldList();
