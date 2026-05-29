import { WorldList } from './views/WorldList.js';
import { ColonyFounder } from './views/ColonyFounder.js';
import { ColonyStatus } from './views/ColonyStatus.js';
import { TurnLog } from './views/TurnLog.js';
import { AllocationPanel } from './views/AllocationPanel.js';
import { fetchColony } from './api/colonies.js';
import type { WorldCandidate, TurnResolution, ColonyTurn } from '@worldtamer/shared';

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

    const right = document.createElement('div');
    right.className = 'colony-right';

    // Mutable state shared between TurnLog and AllocationPanel
    let activeTurn: ColonyTurn = turn;
    let activeResolution: TurnResolution | null = null;

    function renderRight() {
      right.innerHTML = '';
      right.appendChild(AllocationPanel(
        activeResolution, activeTurn,
        (_sn) => { refreshStatus(); },
        (_ss, _slIndex) => { refreshStatus(); },
      ));
    }

    async function refreshStatus() {
      try {
        const { colony: c2, turn: t2 } = await fetchColony(colonyId);
        activeTurn = t2;
        left.innerHTML = '';
        left.appendChild(ColonyStatus(c2, t2));
      } catch { /* silent */ }
    }

    const centre = document.createElement('div');
    centre.className = 'colony-centre';
    centre.appendChild(TurnLog(colonyId, (res: TurnResolution) => {
      activeResolution = res;
      renderRight();
      refreshStatus();
    }));

    renderRight();

    layout.appendChild(left);
    layout.appendChild(centre);
    layout.appendChild(right);
    app.appendChild(layout);
  } catch (err) {
    app.innerHTML = `<p class="error-msg">${(err as Error).message}</p>`;
  }
}

showWorldList();
