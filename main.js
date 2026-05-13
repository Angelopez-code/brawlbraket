let currentTournament = {
  size: 8,
  players: [],
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
      document.getElementById('bracketContent').innerHTML = '<div class="empty-bracket">Torneo no generado. Completa los jugadores y genera brackets.</div>';
    }
    return true;
  } catch(e) { return false; }
}

function updatePlayersUI() {
  const tbody = document.getElementById('playersTbody');
  const countSpan = document.getElementById('playerCountInfo');
  countSpan.innerText = `${currentTournament.players.length}/${currentTournament.size}`;
  if (currentTournament.players.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center">Sin jugadores aún</td></tr>';
    return;
  }
  tbody.innerHTML = '';
  currentTournament.players.forEach((p, idx) => {
    const row = tbody.insertRow();
    row.insertCell(0).innerText = idx+1;
    row.insertCell(1).innerText = p.name;
    row.insertCell(2).innerText = p.elo;
    const delCell = row.insertCell(3);
    const delBtn = document.createElement('button');
    delBtn.innerText = '❌';
    delBtn.className = 'delete-player';
    delBtn.onclick = () => {
      if (currentTournament.bracketGenerated) {
        alert('No puedes modificar jugadores una vez generado el torneo. Usa "Reiniciar torneo completo" para empezar de nuevo.');
        return;
      }
      currentTournament.players.splice(idx,1);
      updatePlayersUI();
      persistState();
      if(currentTournament.bracketGenerated) resetBracketState();
    };
    delCell.appendChild(delBtn);
  });
  persistState();
}

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

// 🔧 Función para obtener el nombre correcto de cada ronda según el tamaño del torneo
function getRoundName(roundIndex, totalPlayers) {
  const playersInThisRound = totalPlayers / Math.pow(2, roundIndex);
  switch (playersInThisRound) {
    case 2: return "🏆 Final";
    case 4: return "🥇 Semifinales";
    case 8: return "🥈 Cuartos de final";
    case 16: return "🥉 Octavos de final";
    default: return `Ronda ${roundIndex + 1}`;
  }
}

function renderBrackets() {
  const container = document.getElementById('bracketContent');
  if (!currentTournament.bracketGenerated || !currentTournament.matches.length) {
    container.innerHTML = '<div class="empty-bracket">🏟️ Genera el bracket para comenzar los enfrentamientos 🏟️</div>';
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
                <div class="player-slot" style="${match.winner && match.winner.id === p1?.id ? 'border:2px solid gold;' : ''}">
                  ${p1 ? `<span class="player-name">${escapeHtml(p1.name)}</span><span class="player-elo">${p1.elo}</span>` : '<span>— Esperando —</span>'}
                  ${p1 && !hasWinner && !finalWinnerGlobal ? `<button class="btn-win" data-match="${match.id}" data-player="${p1.id}">🏆 Ganó</button>` : ''}
                </div>
                <span style="font-weight:bold;"> VS </span>
                <div class="player-slot" style="${match.winner && match.winner.id === p2?.id ? 'border:2px solid gold;' : ''}">
                  ${p2 ? `<span class="player-name">${escapeHtml(p2.name)}</span><span class="player-elo">${p2.elo}</span>` : '<span>— Esperando —</span>'}
                  ${p2 && !hasWinner && !finalWinnerGlobal ? `<button class="btn-win" data-match="${match.id}" data-player="${p2.id}">🏆 Ganó</button>` : ''}
                </div>
              </div>
              <div class="match-status">
                ${hasWinner ? `✅ Ganador: ${escapeHtml(match.winner.name)} (${match.winner.elo})` : (p1 && p2 ? '⚔️ Selecciona al ganador' : '⏳ Esperando rivales')}
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    }).join('')}
    </div>${currentTournament.finalWinner ? `<div class="final-winner">🏆 CAMPEÓN: ${escapeHtml(currentTournament.finalWinner.name)} (ELO ${currentTournament.finalWinner.elo}) 🏆</div>` : ''}`;
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
}

function resetBracketState() {
  currentTournament.bracketGenerated = false;
  currentTournament.matches = [];
  currentTournament.roundsStructure = [];
  currentTournament.finalWinner = null;
  persistState();
  renderBrackets();
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
  document.getElementById('playerElo').value = '';
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('addPlayerBtn').addEventListener('click', () => {
    if (currentTournament.bracketGenerated) {
      alert('Torneo ya generado, no puedes añadir jugadores. Usa "Reiniciar torneo completo".');
      return;
    }
    const name = document.getElementById('playerName').value.trim();
    const eloRaw = document.getElementById('playerElo').value;
    if (!name) { alert('Nombre del jugador requerido'); return; }
    const elo = parseInt(eloRaw);
    if (isNaN(elo) || elo < 0) { alert('ELO válido (número positivo)'); return; }
    if (currentTournament.players.length >= currentTournament.size) {
      alert(`Máximo ${currentTournament.size} jugadores. Elimina alguno o cambia tipo de torneo.`);
      return;
    }
    currentTournament.players.push({ name: name, elo: elo, id: generateId() });
    updatePlayersUI();
    document.getElementById('playerName').value = '';
    document.getElementById('playerElo').value = '';
  });

  document.getElementById('resetPlayersBtn').addEventListener('click', () => {
    if (currentTournament.bracketGenerated) {
      alert('Torneo ya generado, usa "Reiniciar torneo completo" para borrar todo.');
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
  });

  if (!loadPersistedState()) {
    fullReset();
  }
  updatePlayersUI();
});