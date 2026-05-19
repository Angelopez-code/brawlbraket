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
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">SIN JUGADORES INSCRITOS</td></tr>';
    updateGenerateButtonState();
    return;
  }
  tbody.innerHTML = '';
  currentTournament.players.forEach((p, idx) => {
    const row = tbody.insertRow();
    row.insertCell(0).innerText = idx+1;
    row.insertCell(1).innerText = p.name;
    row.insertCell(2).innerText = p.tiktok || '—';
    const descCell = row.insertCell(3);
    const descText = p.description || '—';
    descCell.innerText = descText.length > 20 ? descText.substring(0, 18)+'…' : descText;
    descCell.title = p.description || '';
    const eloCell = row.insertCell(4);
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
        updatePlayersUI();
      });
      eloCell.appendChild(eloInput);
    } else {
      eloCell.innerText = p.elo !== null ? p.elo : '—';
      eloCell.style.color = '#A0B0C8';
    }
    const delCell = row.insertCell(5);
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

function undoMatchWinner(matchId) {
  const match = currentTournament.matches.find(m => m.id === matchId);
  if (!match) return;
  if (!match.winner) return;
  match.winner = null;
  const matchesMap = new Map(currentTournament.matches.map(m => [m.id, m]));
  function clearParentWinners(m) {
    if (m.parentMatchId) {
      const parent = matchesMap.get(m.parentMatchId);
      if (parent) {
        parent.winner = null;
        updateMatchParticipants(parent, matchesMap);
        clearParentWinners(parent);
      }
    }
  }
  clearParentWinners(match);
  currentTournament.matches = Array.from(matchesMap.values());
  currentTournament.finalWinner = null;
  persistState();
  renderBrackets();
}

function clearAllWinners() {
  if (!currentTournament.bracketGenerated) return;
  currentTournament.matches.forEach(m => m.winner = null);
  currentTournament.finalWinner = null;
  persistState();
  renderBrackets();
}

function regenerateBrackets() {
  if (!currentTournament.bracketGenerated) return;
  const requiredSize = currentTournament.size;
  if (currentTournament.players.length !== requiredSize) {
    alert(`Debes tener exactamente ${requiredSize} jugadores inscritos.`);
    return;
  }
  const allHaveElo = currentTournament.players.every(p => p.elo !== null && p.elo > 0);
  if (!allHaveElo) {
    alert('Todos los jugadores deben tener un ELO asignado.');
    return;
  }
  const pairs = pairByClosestElo(currentTournament.players);
  const { matches, rounds } = buildMatchesFromPairs(pairs, requiredSize);
  currentTournament.matches = matches;
  currentTournament.roundsStructure = rounds;
  currentTournament.bracketGenerated = true;
  currentTournament.finalWinner = null;
  persistState();
  renderBrackets();
  updatePlayersUI();
}

function swapMatchPlayers(matchA, matchB) {
  if (!matchA || !matchB) return;
  if (matchA.round !== 0 || matchB.round !== 0) return;
  const tempP1 = matchA.player1;
  const tempP2 = matchA.player2;
  matchA.player1 = matchB.player1;
  matchA.player2 = matchB.player2;
  matchB.player1 = tempP1;
  matchB.player2 = tempP2;
  matchA.winner = null;
  matchB.winner = null;
  const matchesMap = new Map(currentTournament.matches.map(m => [m.id, m]));
  function updateParents(match) {
    if (match.parentMatchId) {
      const parent = matchesMap.get(match.parentMatchId);
      if (parent) {
        updateMatchParticipants(parent, matchesMap);
        parent.winner = null;
        updateParents(parent);
      }
    }
  }
  updateParents(matchA);
  updateParents(matchB);
  currentTournament.matches = Array.from(matchesMap.values());
  currentTournament.finalWinner = null;
  persistState();
  renderBrackets();
}

function escapeHtml(str) {
  if(!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if(m==='&') return '&amp;';
    if(m==='<') return '&lt;';
    if(m==='>') return '&gt;';
    return m;
  });
}

function drawBracketLines() {
  // No dibujar líneas en pantallas menores a 768px (tablets y móviles)
  if (window.innerWidth < 768) return;
  
  const container = document.querySelector('.bracket-tree-classic');
  if (!container) return;
  
  const oldSvg = container.querySelector('.bracket-lines-svg');
  if (oldSvg) oldSvg.remove();
  
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('bracket-lines-svg');
  svg.style.position = 'absolute';
  svg.style.top = '0';
  svg.style.left = '0';
  svg.style.width = '100%';
  svg.style.height = '100%';
  svg.style.pointerEvents = 'none';
  svg.style.zIndex = '5';
  container.style.position = 'relative';
  container.appendChild(svg);
  
  const containerRect = container.getBoundingClientRect();
  svg.setAttribute('width', containerRect.width);
  svg.setAttribute('height', containerRect.height);
  
  const matches = document.querySelectorAll('.match-item');
  const positions = new Map();
  matches.forEach(match => {
    const matchRect = match.getBoundingClientRect();
    positions.set(match.dataset.matchId, {
      right: matchRect.right - containerRect.left,
      left: matchRect.left - containerRect.left,
      top: matchRect.top - containerRect.top + (matchRect.height / 2)
    });
  });
  
  currentTournament.matches.forEach(match => {
    if (!match.parentMatchId) return;
    const from = positions.get(match.id);
    const to = positions.get(match.parentMatchId);
    if (!from || !to) return;
    
    const x1 = from.right;
    const y1 = from.top;
    const x2 = to.left;
    const y2 = to.top;
    if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) return;
    
    const midX = x1 + (x2 - x1) / 2;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const d = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
    path.setAttribute('d', d);
    const strokeColor = document.body.classList.contains('light-mode') ? '#0066cc' : '#00E5FF';
    path.setAttribute('stroke', strokeColor);
    path.setAttribute('stroke-width', '2');
    path.setAttribute('fill', 'none');
    svg.appendChild(path);
  });
}

function renderBrackets() {
  const container = document.getElementById('bracketContent');
  if (!currentTournament.bracketGenerated || !currentTournament.matches.length) {
    container.innerHTML = '<div class="empty-bracket">// GENERA EL BRACKET DESDE REGISTRO //</div>';
    return;
  }

  const roundsMap = new Map();
  currentTournament.matches.forEach(m => {
    if (!roundsMap.has(m.round)) roundsMap.set(m.round, []);
    roundsMap.get(m.round).push(m);
  });
  const sortedRounds = Array.from(roundsMap.keys()).sort((a,b)=>a-b);
  const totalPlayers = currentTournament.size;

  let roundNames = [];
  if (totalPlayers === 16) roundNames = ['Ronda 16', 'Cuartos de final', 'Semifinal', 'Final'];
  else if (totalPlayers === 8) roundNames = ['Cuartos de final', 'Semifinal', 'Final'];
  else roundNames = ['Semifinal', 'Final'];

  // Eliminamos el div .bracket-columns interno, las columnas van directamente dentro de .bracket-tree-classic
  let html = `<div class="bracket-tree-classic">`;
  
  sortedRounds.forEach((round, idx) => {
    const matches = roundsMap.get(round);
    const roundTitle = roundNames[idx];
    html += `<div class="bracket-column" data-round="${round}">
      <div class="column-title">${roundTitle}</div>
      <div class="column-matches">`;
    
    matches.forEach(match => {
      const p1 = match.player1;
      const p2 = match.player2;
      const hasWinner = !!match.winner;
      const isFinal = (round === sortedRounds[sortedRounds.length-1]);
      html += `<div class="match-item" data-match-id="${match.id}">
        <div class="match-teams">
          <div class="team ${match.winner && match.winner.id === p1?.id ? 'winner' : ''}">
            ${p1 ? `<span class="team-name" data-name="${escapeHtml(p1.name)}" data-tiktok="${escapeHtml(p1.tiktok || '')}" data-showing="name">${escapeHtml(p1.name)}</span> <span class="team-elo">${p1.elo}</span>` : '<span class="empty-slot">—</span>'}
            ${p1 && !hasWinner && !currentTournament.finalWinner ? `<button class="win-btn" data-match="${match.id}" data-player="${p1.id}">GANÓ</button>` : ''}
          </div>
          <div class="team ${match.winner && match.winner.id === p2?.id ? 'winner' : ''}">
            ${p2 ? `<span class="team-name" data-name="${escapeHtml(p2.name)}" data-tiktok="${escapeHtml(p2.tiktok || '')}" data-showing="name">${escapeHtml(p2.name)}</span> <span class="team-elo">${p2.elo}</span>` : '<span class="empty-slot">—</span>'}
            ${p2 && !hasWinner && !currentTournament.finalWinner ? `<button class="win-btn" data-match="${match.id}" data-player="${p2.id}">GANÓ</button>` : ''}
          </div>
        </div>
        ${hasWinner ? `<div class="match-winner">Ganador: ${escapeHtml(match.winner.name)} <button class="undo-win-btn" data-match-id="${match.id}">⟳ Deshacer</button></div>` : (p1 && p2 ? '<div class="match-status">⚔️ Selecciona ganador</div>' : '<div class="match-status">Esperando...</div>')}
        ${!isFinal && !hasWinner && p1 && p2 && round === 0 ? `<button class="swap-match-btn" data-match-id="${match.id}">⇄ Intercambiar</button>` : ''}
      </div>`;
    });
    html += `</div></div>`;
  });
  
  html += `</div>`;
  if (currentTournament.finalWinner) {
    html += `<div class="final-champion">🏆 CAMPEÓN: ${escapeHtml(currentTournament.finalWinner.name)} (ELO ${currentTournament.finalWinner.elo}) 🏆</div>`;
  }
  container.innerHTML = html;
  setTimeout(() => {
  if (window.innerWidth >= 768) {
    drawBracketLines();
  }
}, 50);
  
  // Eventos (igual que antes)
  document.querySelectorAll('.team-name').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const showing = el.getAttribute('data-showing');
      const name = el.getAttribute('data-name');
      const tiktok = el.getAttribute('data-tiktok');
      if (tiktok && tiktok !== '') {
        if (showing === 'name') {
          el.innerText = tiktok;
          el.setAttribute('data-showing', 'tiktok');
        } else {
          el.innerText = name;
          el.setAttribute('data-showing', 'name');
        }
      }
    });
  });
  
  document.querySelectorAll('.win-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const matchId = btn.dataset.match;
      const playerId = btn.dataset.player;
      const match = currentTournament.matches.find(m => m.id === matchId);
      if (!match) return;
      const player = match.player1?.id === playerId ? match.player1 : (match.player2?.id === playerId ? match.player2 : null);
      if (!player) return;
      if (match.winner || currentTournament.finalWinner) return;
      const matchesMapTemp = new Map(currentTournament.matches.map(m => [m.id, m]));
      propagateWinner(matchId, player, matchesMapTemp);
    });
  });
  
  document.querySelectorAll('.undo-win-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const matchId = btn.dataset.matchId;
      undoMatchWinner(matchId);
    });
  });
  
  if (!currentTournament.finalWinner && !currentTournament.matches.some(m => m.round === 0 && m.winner)) {
    document.querySelectorAll('.swap-match-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const matchId = btn.dataset.matchId;
        const currentMatch = currentTournament.matches.find(m => m.id === matchId);
        if (!currentMatch || currentMatch.round !== 0) return;
        const firstRound = currentTournament.matches.filter(m => m.round === 0 && m.id !== matchId);
        if (firstRound.length === 0) return;
        const select = document.createElement('select');
        select.style.position = 'absolute';
        select.style.background = '#1e2129';
        select.style.border = '1px solid #00E5FF';
        select.style.color = '#00E5FF';
        select.style.padding = '4px';
        select.style.zIndex = '1000';
        firstRound.forEach(m => {
          const option = document.createElement('option');
          option.value = m.id;
          option.textContent = `${m.player1?.name || '??'} vs ${m.player2?.name || '??'}`;
          select.appendChild(option);
        });
        const rect = btn.getBoundingClientRect();
        select.style.left = `${rect.left}px`;
        select.style.top = `${rect.bottom + window.scrollY}px`;
        select.addEventListener('change', (e2) => {
          const targetId = e2.target.value;
          const targetMatch = currentTournament.matches.find(m => m.id === targetId);
          if (targetMatch) swapMatchPlayers(currentMatch, targetMatch);
          select.remove();
        });
        document.body.appendChild(select);
        select.focus();
        select.addEventListener('blur', () => select.remove());
      });
    });
  }
}

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
  updatePlayersUI();
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
  document.getElementById('playerTikTok').value = '';
  document.getElementById('playerDesc').value = '';
}

// Tema claro/oscuro
const themeBtn = document.getElementById('themeSwitchBtn');
if (themeBtn) {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'light') {
    document.body.classList.add('light-mode');
    themeBtn.textContent = '☀️ Modo Oscuro';
  } else {
    themeBtn.textContent = '🌙 Modo Claro';
  }
  themeBtn.addEventListener('click', () => {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    themeBtn.textContent = isLight ? '☀️ Modo Oscuro' : '🌙 Modo Claro';
  });
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('addPlayerBtn').addEventListener('click', () => {
    if (currentTournament.bracketGenerated) {
      alert('Torneo ya generado. Usa "REINICIAR TORNEO COMPLETO" para empezar de nuevo.');
      return;
    }
    const name = document.getElementById('playerName').value.trim();
    if (!name) { alert('Nombre del jugador requerido'); return; }
    const tiktok = document.getElementById('playerTikTok').value.trim();
    if (!tiktok) { alert('El nombre de TikTok es obligatorio'); return; }
    const description = document.getElementById('playerDesc').value.trim() || '';
    if (currentTournament.players.length >= currentTournament.size) {
      alert(`Máximo ${currentTournament.size} jugadores. Elimina alguno o cambia tipo de torneo.`);
      return;
    }
    currentTournament.players.push({
      id: generateId(),
      name: name,
      tiktok: tiktok,
      description: description,
      elo: null
    });
    updatePlayersUI();
    document.getElementById('playerName').value = '';
    document.getElementById('playerTikTok').value = '';
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
  document.getElementById('clearWinnersBtn').addEventListener('click', clearAllWinners);
  document.getElementById('regenerateBracketBtn').addEventListener('click', regenerateBrackets);
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
  window.addEventListener('resize', () => {
  if (currentTournament.bracketGenerated) {
    if (window.innerWidth < 768) {
      const svg = document.querySelector('.bracket-lines-svg');
      if (svg) svg.remove();
    } else {
      setTimeout(drawBracketLines, 100);
    }
  }
});
});