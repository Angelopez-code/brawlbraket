let currentTournament = {
  size: 8,
  players: [],        // cada jugador: { id, name, description, elo (null o número) }
  bracketGenerated: false,
  matches: [],
  roundsStructure: [],
  finalWinner: null
};

function generateId() { return Date.now() + '-' + Math.random().toString(36).substr(2, 6); }

function persistState() {
  const toStore = {
    size: currentTournament.size,
    players: currentTournament.players,
    bracketGenerated: currentTournament.bracketGenerated,
    matches: currentTournament.matches,
    roundsStructure: currentTournament.roundsStructure,
    finalWinner: currentTournament.finalWinner
  };
  localStorage.setItem('brawlTournament', JSON.stringify(toStore));
}

function loadPersistedState() {
  const raw = localStorage.getItem('brawlTournament');
  if (!raw) return false;
  try {
    const saved = JSON.parse(raw);
    currentTournament.size = saved.size;
    currentTournament.players = saved.players || [];
    currentTournament.bracketGenerated = saved.bracketGenerated || false;
    currentTournament.matches = saved.matches || [];
    currentTournament.roundsStructure = saved.roundsStructure || [];
    currentTournament.finalWinner = saved.finalWinner || null;
    document.getElementById('tournamentSizeSelect').value = currentTournament.size;
    updatePlayersUI();
    if (currentTournament.bracketGenerated && currentTournament.matches.length) {
      renderBrackets();
    } else {
      document.getElementById('bracketContent').innerHTML = '<div class="empty-bracket">// GENERA EL BRACKET CUANDO TODOS TENGAN ELO //</div>';
      updateGenerateButtonState();
    }
    return true;
  } catch(e) { return false; }
}

function updateGenerateButtonState() {
  const btn = document.getElementById('generateBracketBtn');
  if (!btn) return;
  const total = currentTournament.players.length;
  const required = currentTournament.size;
  const allHaveElo = total === required && currentTournament.players.every(p => p.elo !== null && p.elo > 0);
  if (total === required && allHaveElo && !currentTournament.bracketGenerated) {
    btn.disabled = false;
    btn.textContent = 'GENERAR BRACKETS (POR ELO)';
    btn.style.opacity = '1';
  } else {
    btn.disabled = true;
    if (total !== required) btn.textContent = `FALTAN ${required - total} INSCRIPCIONES`;
    else if (!allHaveElo) btn.textContent = `ASIGNAR ELO A ${currentTournament.players.filter(p => p.elo === null || p.elo <= 0).length} JUGADORES`;
    else btn.textContent = 'GENERAR BRACKETS (POR ELO)';
    btn.style.opacity = '0.6';
  }
}

function updatePlayersUI() {
  const tbody = document.getElementById('playersTbody');
  const countSpan = document.getElementById('playerCountInfo');
  const progressSpan = document.getElementById('eloProgressInfo');
  const totalPlayers = currentTournament.players.length;
  const required = currentTournament.size;
  countSpan.innerText = `${totalPlayers}/${required}`;
  const withElo = currentTournament.players.filter(p => p.elo !== null && p.elo > 0).length;
  progressSpan.innerText = `ELO: ${withElo}/${totalPlayers}`;

  if (totalPlayers === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">SIN JUGADORES INSCRITOS</td></tr>';
    updateGenerateButtonState();
    return;
  }
  tbody.innerHTML = '';
  currentTournament.players.forEach((p, idx) => {
    const row = tbody.insertRow();
    row.insertCell(0).innerText = idx+1;
    row.insertCell(1).innerText = p.name;
    // Descripción con tooltip si es larga
    const descCell = row.insertCell(2);
    const descText = p.description || '—';
    descCell.innerText = descText.length > 20 ? descText.substring(0, 18)+'…' : descText;
    descCell.title = p.description || '';
    // Celda ELO: editable si no hay torneo generado
    const eloCell = row.insertCell(3);
    if (!currentTournament.bracketGenerated) {
      const eloInput = document.createElement('input');
      eloInput.type = 'number';
      eloInput.placeholder = 'ELO';
      eloInput.value = p.elo !== null ? p.elo : '';
      eloInput.style.width = '80px';
      eloInput.style.background = 'transparent';
      eloInput.style.borderBottom = '1px solid #00E5FF';
      eloInput.style.color = '#00E5FF';
      eloInput.addEventListener('change', (e) => {
        let val = parseInt(e.target.value);
        if (isNaN(val) || val < 0) val = null;
        p.elo = val;
        persistState();
        updatePlayersUI(); // refresca para mostrar el valor y actualizar contador
      });
      eloCell.appendChild(eloInput);
    } else {
      eloCell.innerText = p.elo !== null ? p.elo : '—';
      eloCell.style.color = '#A0B0C8';
    }
    // Acciones (eliminar)
    const delCell = row.insertCell(4);
    const delBtn = document.createElement('button');
    delBtn.innerText = 'X';
    delBtn.className = 'delete-player';
    delBtn.onclick = () => {
      if (currentTournament.bracketGenerated) {
        alert('No puedes modificar jugadores una vez generado el torneo. Usa "REINICIAR TORNEO COMPLETO".');
        return;
      }
      currentTournament.players.splice(idx,1);
      updatePlayersUI();
      persistState();
      if(currentTournament.bracketGenerated) resetBracketState();
    };
    delCell.appendChild(delBtn);
  });
  updateGenerateButtonState();
  persistState();
}

// --- Funciones de emparejamiento y torneo (sin cambios, solo adaptadas a que el ELO puede ser null, pero se llama cuando todos tienen ELO) ---
function pairByClosestElo(playersList) {
  if (!playersList.length) return [];
  const sorted = [...playersList].sort((a,b) => a.elo - b.elo);
  const pairs = [];
  for (let i = 0; i < sorted.length; i += 2) {
    if (i+1 < sorted.length) pairs.push([sorted[i], sorted[i+1]]);
    else pairs.push([sorted[i], null]);
  }
  return pairs;
}

function buildMatchesFromPairs(pairs, totalSize) {
  const matches = [];
  const rounds = [];
  const firstRoundMatches = pairs.map((pair, idx) => {
    const p1 = pair[0] ? { ...pair[0], id: pair[0].id } : null;
    const p2 = pair[1] ? { ...pair[1], id: pair[1].id } : null;
    return {
      id: generateId(),
      round: 0,
      matchOrder: idx,
      player1: p1,
      player2: p2,
      winner: null,
      childLeftId: null,
      childRightId: null,
      parentMatchId: null
    };
  });
  matches.push(...firstRoundMatches);
  rounds.push(firstRoundMatches.map(m => m.id));

  let currentRoundMatches = firstRoundMatches;
  let roundNum = 1;
  while (currentRoundMatches.length > 1) {
    const nextRound = [];
    for (let i = 0; i < currentRoundMatches.length; i += 2) {
      const leftMatch = currentRoundMatches[i];
      const rightMatch = currentRoundMatches[i+1];
      const parentMatch = {
        id: generateId(),
        round: roundNum,
        matchOrder: i/2,
        player1: null,
        player2: null,
        winner: null,
        childLeftId: leftMatch.id,
        childRightId: rightMatch ? rightMatch.id : null,
        parentMatchId: null
      };
      leftMatch.parentMatchId = parentMatch.id;
      if (rightMatch) rightMatch.parentMatchId = parentMatch.id;
      nextRound.push(parentMatch);
      matches.push(parentMatch);
    }
    rounds.push(nextRound.map(m => m.id));
    currentRoundMatches = nextRound;
    roundNum++;
  }
  return { matches, rounds };
}

function updateMatchParticipants(match, matchesMap) {
  if (match.childLeftId === null && match.childRightId === null) return;
  const leftChild = matchesMap.get(match.childLeftId);
  const rightChild = match.childRightId ? matchesMap.get(match.childRightId) : null;
  const leftWinner = leftChild?.winner || null;
  const rightWinner = rightChild?.winner || null;
  if (leftWinner !== match.player1) match.player1 = leftWinner;
  if (rightWinner !== match.player2) match.player2 = rightWinner;
}

function propagateWinner(matchId, winnerObj, matchesMap) {
  const match = matchesMap.get(matchId);
  if (!match) return;
  match.winner = winnerObj;
  if (match.parentMatchId) {
    const parent = matchesMap.get(match.parentMatchId);
    if (parent) {
      updateMatchParticipants(parent, matchesMap);
      persistState();
      renderBrackets();
    }
  }
  const finalMatch = [...matchesMap.values()].find(m => m.round > 0 && !m.parentMatchId);
  if (finalMatch && finalMatch.winner) {
    currentTournament.finalWinner = finalMatch.winner;
  } else {
    currentTournament.finalWinner = null;
  }
  persistState();
  renderBrackets();
}

function getRoundName(roundIndex, totalPlayers) {
  const playersInThisRound = totalPlayers / Math.pow(2, roundIndex);
  switch (playersInThisRound) {
    case 2: return "FINAL";
    case 4: return "SEMIFINALES";
    case 8: return "CUARTOS DE FINAL";
    case 16: return "OCTAVOS DE FINAL";
    default: return `RONDA ${roundIndex + 1}`;
  }
}

function renderBrackets() {
  const container = document.getElementById('bracketContent');
  if (!currentTournament.bracketGenerated || !currentTournament.matches.length) {
    container.innerHTML = '<div class="empty-bracket">// GENERA EL BRACKET CUANDO TODOS TENGAN ELO //</div>';
    return;
  }
  const matchesMap = new Map();
  currentTournament.matches.forEach(m => matchesMap.set(m.id, m));
  const roundsMap = new Map();
  currentTournament.matches.forEach(m => {
    if (!roundsMap.has(m.round)) roundsMap.set(m.round, []);
    roundsMap.get(m.round).push(m);
  });
  const sortedRounds = Array.from(roundsMap.keys()).sort((a,b)=>a-b);
  const totalPlayers = currentTournament.size;

  const bracketHtml = `<div class="bracket-rounds">
    ${sortedRounds.map(round => {
      const roundMatches = roundsMap.get(round);
      const roundTitle = getRoundName(round, totalPlayers);
      return `<div class="round">
        <div class="round-title">${roundTitle}</div>
        <div class="matches">
          ${roundMatches.map(match => {
            const p1 = match.player1;
            const p2 = match.player2;
            const hasWinner = !!match.winner;
            const finalWinnerGlobal = currentTournament.finalWinner;
            return `<div class="match-card">
              <div class="match-players">
                <div class="player-slot" style="${match.winner && match.winner.id === p1?.id ? 'border:2px solid #00E5FF; background:#00E5FF20;' : ''}">
                  ${p1 ? `<span class="player-name">${escapeHtml(p1.name)}</span><span class="player-elo">${p1.elo}</span>` : '<span>— ESPERANDO —</span>'}
                  ${p1 && !hasWinner && !finalWinnerGlobal ? `<button class="btn-win" data-match="${match.id}" data-player="${p1.id}">GANO</button>` : ''}
                </div>
                <span style="font-weight:bold;"> VS </span>
                <div class="player-slot" style="${match.winner && match.winner.id === p2?.id ? 'border:2px solid #00E5FF; background:#00E5FF20;' : ''}">
                  ${p2 ? `<span class="player-name">${escapeHtml(p2.name)}</span><span class="player-elo">${p2.elo}</span>` : '<span>— ESPERANDO —</span>'}
                  ${p2 && !hasWinner && !finalWinnerGlobal ? `<button class="btn-win" data-match="${match.id}" data-player="${p2.id}">GANO</button>` : ''}
                </div>
              </div>
              <div class="match-status">
                ${hasWinner ? `GANADOR: ${escapeHtml(match.winner.name)} (${match.winner.elo})` : (p1 && p2 ? 'SELECCIONA GANADOR' : 'ESPERANDO RIVALES')}
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    }).join('')}
    </div>${currentTournament.finalWinner ? `<div class="final-winner">CAMPEON: ${escapeHtml(currentTournament.finalWinner.name)} (ELO ${currentTournament.finalWinner.elo})</div>` : ''}`;
  container.innerHTML = bracketHtml;

  document.querySelectorAll('.btn-win').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const matchId = btn.dataset.match;
      const playerId = btn.dataset.player;
      const match = currentTournament.matches.find(m => m.id === matchId);
      if (!match) return;
      const player = match.player1?.id === playerId ? match.player1 : (match.player2?.id === playerId ? match.player2 : null);
      if (!player) return;
      if (match.winner || currentTournament.finalWinner) {
        alert('Este enfrentamiento ya tiene ganador o el torneo ha finalizado.');
        return;
      }
      const matchesMapTemp = new Map(currentTournament.matches.map(m => [m.id, m]));
      propagateWinner(matchId, player, matchesMapTemp);
    });
  });
}

function escapeHtml(str) { if(!str) return ''; return str.replace(/[&<>]/g, function(m){if(m==='&') return '&amp;'; if(m==='<') return '&lt;'; if(m==='>') return '&gt;'; return m;}); }

function generateBracket() {
  const requiredSize = currentTournament.size;
  if (currentTournament.players.length !== requiredSize) {
    alert(`Debes tener exactamente ${requiredSize} jugadores inscritos. Actualmente: ${currentTournament.players.length}`);
    return;
  }
  const allHaveElo = currentTournament.players.every(p => p.elo !== null && p.elo > 0);
  if (!allHaveElo) {
    alert('Todos los jugadores deben tener un ELO asignado antes de generar el bracket.');
    return;
  }
  const pairs = pairByClosestElo(currentTournament.players);
  if (pairs.length !== requiredSize/2) {
    alert('Error en el número de enfrentamientos iniciales');
    return;
  }
  const { matches, rounds } = buildMatchesFromPairs(pairs, requiredSize);
  currentTournament.matches = matches;
  currentTournament.roundsStructure = rounds;
  currentTournament.bracketGenerated = true;
  currentTournament.finalWinner = null;
  persistState();
  renderBrackets();
  updatePlayersUI(); // para que los campos ELO se vuelvan solo texto
}

function resetBracketState() {
  currentTournament.bracketGenerated = false;
  currentTournament.matches = [];
  currentTournament.roundsStructure = [];
  currentTournament.finalWinner = null;
  persistState();
  renderBrackets();
  updatePlayersUI();
}

function fullReset() {
  currentTournament = {
    size: parseInt(document.getElementById('tournamentSizeSelect').value),
    players: [],
    bracketGenerated: false,
    matches: [],
    roundsStructure: [],
    finalWinner: null
  };
  persistState();
  updatePlayersUI();
  renderBrackets();
  document.getElementById('playerName').value = '';
  document.getElementById('playerDesc').value = '';
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('addPlayerBtn').addEventListener('click', () => {
    if (currentTournament.bracketGenerated) {
      alert('Torneo ya generado. Usa "REINICIAR TORNEO COMPLETO" para empezar de nuevo.');
      return;
    }
    const name = document.getElementById('playerName').value.trim();
    if (!name) { alert('Nombre del jugador requerido'); return; }
    const description = document.getElementById('playerDesc').value.trim() || '';
    if (currentTournament.players.length >= currentTournament.size) {
      alert(`Máximo ${currentTournament.size} jugadores. Elimina alguno o cambia tipo de torneo.`);
      return;
    }
    currentTournament.players.push({
      id: generateId(),
      name: name,
      description: description,
      elo: null
    });
    updatePlayersUI();
    document.getElementById('playerName').value = '';
    document.getElementById('playerDesc').value = '';
  });

  document.getElementById('resetPlayersBtn').addEventListener('click', () => {
    if (currentTournament.bracketGenerated) {
      alert('Torneo ya generado. Usa "REINICIAR TORNEO COMPLETO".');
      return;
    }
    currentTournament.players = [];
    updatePlayersUI();
    persistState();
  });

  document.getElementById('generateBracketBtn').addEventListener('click', generateBracket);
  document.getElementById('fullResetBtn').addEventListener('click', fullReset);
  document.getElementById('tournamentSizeSelect').addEventListener('change', (e) => {
    if (currentTournament.bracketGenerated) {
      alert('No puedes cambiar el tamaño si ya hay torneo activo. Reinicia primero.');
      e.target.value = currentTournament.size;
      return;
    }
    currentTournament.size = parseInt(e.target.value);
    if (currentTournament.players.length > currentTournament.size) {
      currentTournament.players = currentTournament.players.slice(0, currentTournament.size);
      updatePlayersUI();
    }
    persistState();
    updateGenerateButtonState();
  });

  if (!loadPersistedState()) {
    fullReset();
  }
  updatePlayersUI();
});