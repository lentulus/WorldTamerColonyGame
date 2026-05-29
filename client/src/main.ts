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
    const data = await fetchColony(colonyId) as any;
    const colony = data.colony;
    const turn: ColonyTurn = data.turn;
    const recentTurns = data.recent_turns ?? [];
    app.innerHTML = '';

    const layout = document.createElement('div');
    layout.className = 'colony-layout';

    const left = document.createElement('div');
    left.className = 'colony-left';
    left.appendChild(ColonyStatus(colony, turn, recentTurns));

    const centre = document.createElement('div');
    centre.className = 'colony-centre';

    const right = document.createElement('div');
    right.className = 'colony-right';

    let activeTurn: ColonyTurn = turn;
    let activeResolution: TurnResolution | null = null;

    async function refreshStatus() {
      try {
        const d = await fetchColony(colonyId) as any;
        activeTurn = d.turn;
        left.innerHTML = '';
        left.appendChild(ColonyStatus(d.colony, d.turn, d.recent_turns ?? []));
      } catch { /* silent */ }
    }

    function renderRight() {
      right.innerHTML = '';
      right.appendChild(AllocationPanel(
        activeResolution, activeTurn,
        (_sn) => { refreshStatus(); },
        (_ss, _slIndex) => { refreshStatus(); },
        () => {
          // Turn finalized — reset for next month
          activeResolution = null;
          refreshStatus();
          centre.innerHTML = '';
          renderCentre();
          renderRight();
        },
      ));
    }

    function renderCentre() {
      centre.appendChild(TurnLog(colonyId, (res: TurnResolution) => {
        activeResolution = res;
        renderRight();
        refreshStatus();
      }));
    }

    renderCentre();
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
