import { WorldList } from './views/WorldList.js';
import type { WorldCandidate } from '@worldtamer/shared';

import './style.css';

const app = document.getElementById('app')!;

function showWorldList() {
  app.innerHTML = '';
  const view = WorldList((world: WorldCandidate) => {
    app.innerHTML = `<p>Selected: <strong>${world.system_name} ${world.body_position}</strong> — ${world.world_type} (founding form coming in Slice 2)</p>
                     <button id="back">← Back to world list</button>`;
    document.getElementById('back')!.addEventListener('click', showWorldList);
  });
  app.appendChild(view);
}

showWorldList();
