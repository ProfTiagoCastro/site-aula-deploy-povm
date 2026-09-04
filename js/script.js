// ---------------------------------------------------------
// Terminal de deploy — sequência digitada no hero
// ---------------------------------------------------------
(function initTerminal() {
  const body = document.getElementById('terminal-body');
  if (!body) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const lines = [
    { text: '$ ssh aluno@vm-ads-marica', cmd: true },
    { text: '$ sudo apt update && sudo apt install apache2 -y', cmd: true },
    { text: 'Apache2 instalado', ok: true },
    { text: '$ sudo systemctl enable --now apache2', cmd: true },
    { text: '$ scp -r site-aula-deploy/* aluno@vm:/var/www/html/', cmd: true },
    { text: 'Arquivos copiados', ok: true },
    { text: '$ curl -I http://<ip-da-vm>', cmd: true },
    { text: 'HTTP/1.1 200 OK — site no ar!', ok: true },
  ];

  if (reduceMotion) {
    body.innerHTML = lines.map(renderStaticLine).join('\n');
    return;
  }

  let lineIndex = 0;
  let charIndex = 0;
  let currentSpan = null;

  function renderStaticLine(line) {
    const cls = line.ok ? 'line-ok' : line.cmd ? 'line-cmd' : '';
    return `<span class="${cls}">${line.text}</span>`;
  }

  function typeNext() {
    if (lineIndex >= lines.length) {
      const cursor = document.createElement('span');
      cursor.className = 'cursor';
      body.appendChild(cursor);
      return;
    }

    const line = lines[lineIndex];

    if (charIndex === 0) {
      currentSpan = document.createElement('span');
      currentSpan.className = line.ok ? 'line-ok' : line.cmd ? 'line-cmd' : '';
      body.appendChild(currentSpan);
    }

    if (charIndex < line.text.length) {
      currentSpan.textContent += line.text[charIndex];
      charIndex++;
      setTimeout(typeNext, line.cmd ? 18 : 12);
    } else {
      body.appendChild(document.createTextNode('\n'));
      lineIndex++;
      charIndex = 0;
      setTimeout(typeNext, line.ok ? 260 : 160);
    }
  }

  typeNext();
})();

// ---------------------------------------------------------
// Jogo do Dado da Sorte — multiplayer via Neon Postgres
//
// Conta gratuita do Neon criada só pra esta aula (sem dados
// pessoais/pagamento) — a chave fica exposta de propósito,
// pois o site é 100% estático e cada aluno publica a mesma
// cópia; não há backend para escondê-la.
// ---------------------------------------------------------
(function initDiceGame() {
  const NEON_HOST = 'ep-aged-poetry-acez9gq2-pooler.sa-east-1.aws.neon.tech';
  const NEON_CONNECTION_STRING =
    'postgresql://neondb_owner:npg_BjU6RLaSlbY8@' + NEON_HOST +
    '/neondb?sslmode=require&channel_binding=require';

  async function dbQuery(query, params) {
    const res = await fetch(`https://${NEON_HOST}/sql`, {
      method: 'POST',
      headers: {
        // text/plain evita o preflight de CORS travar em "content-type"
        // (o endpoint do Neon não lista esse header em Access-Control-Allow-Headers).
        'Content-Type': 'text/plain',
        'Neon-Connection-String': NEON_CONNECTION_STRING,
      },
      body: JSON.stringify({ query, params: params || [] }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Erro ao falar com o banco.');
    return data.rows;
  }

  const screens = {
    join: document.getElementById('screen-join'),
    identify: document.getElementById('screen-identify'),
    rooms: document.getElementById('screen-rooms'),
    lobby: document.getElementById('screen-lobby'),
    result: document.getElementById('screen-result'),
  };

  const btnOpen = document.getElementById('btn-open');

  const inputName = document.getElementById('input-name');
  const inputMatricula = document.getElementById('input-matricula');
  const btnJoin = document.getElementById('btn-join');
  const identifyError = document.getElementById('identify-error');

  const btnCreateRoom = document.getElementById('btn-create-room');
  const roomsList = document.getElementById('rooms-list');
  const roomsEmpty = document.getElementById('rooms-empty');
  const roomsError = document.getElementById('rooms-error');

  const lobbyTitle = document.getElementById('lobby-title');
  const lobbyCount = document.getElementById('lobby-count');
  const lobbyList = document.getElementById('lobby-list');
  const selectDice = document.getElementById('select-dice');
  const btnLaunch = document.getElementById('btn-launch');
  const lobbyHint = document.getElementById('lobby-hint');

  const diceFace = document.getElementById('dice-face');
  const resultMsg = document.getElementById('result-msg');
  const btnAgain = document.getElementById('btn-again');

  const rankingList = document.getElementById('ranking-list');
  const rankingEmpty = document.getElementById('ranking-empty');

  const PIP_LAYOUT = {
    1: [5],
    2: [3, 7],
    3: [3, 5, 7],
    4: [1, 3, 7, 9],
    5: [1, 3, 5, 7, 9],
    6: [1, 3, 4, 6, 7, 9],
  };

  const HEARTBEAT_MS = 5000;
  const STALE_SECONDS = 30;

  const state = {
    name: localStorage.getItem('dado_nome') || '',
    matricula: localStorage.getItem('dado_matricula') || '',
    sessionId: null,
    isCreator: false,
    pollTimer: null,
    roomsPollTimer: null,
    heartbeatTimer: null,
    lobbySnapshot: [],
  };

  // Se quem criou a sala fechar/recarregar a aba, avisa o banco na hora
  // (best-effort — o fallback é o heartbeat expirar em poucos segundos).
  window.addEventListener('pagehide', () => {
    if (!state.isCreator || !state.sessionId) return;
    fetch(`https://${NEON_HOST}/sql`, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'text/plain',
        'Neon-Connection-String': NEON_CONNECTION_STRING,
      },
      body: JSON.stringify({
        query: 'DELETE FROM sessions WHERE id = $1 AND status = $2',
        params: [state.sessionId, 'waiting'],
      }),
    });
  });

  function showScreen(name) {
    Object.values(screens).forEach((s) => s.classList.add('hidden'));
    screens[name].classList.remove('hidden');
  }

  function renderDiceFace(value) {
    diceFace.innerHTML = '';
    const active = PIP_LAYOUT[value] || [];
    for (let cell = 1; cell <= 9; cell++) {
      const pip = document.createElement('div');
      if (active.includes(cell)) pip.className = 'pip';
      diceFace.appendChild(pip);
    }
  }
  renderDiceFace(1);

  // ---------------------------------------------------------
  // Ranking geral — sempre visível, atualizado periodicamente
  // ---------------------------------------------------------
  async function refreshRanking() {
    try {
      const rows = await dbQuery(`
        SELECT matricula,
               (ARRAY_AGG(name ORDER BY won_at DESC))[1] AS name,
               COUNT(*)::int AS vitorias
        FROM wins
        GROUP BY matricula
        ORDER BY vitorias DESC, MIN(won_at) ASC
        LIMIT 10
      `);
      renderRanking(rows);
    } catch (e) {
      console.error('Falha ao carregar ranking:', e);
    }
  }

  function renderRanking(rows) {
    rankingList.innerHTML = '';
    rankingEmpty.classList.toggle('hidden', rows.length > 0);
    rows.forEach((r, i) => {
      const li = document.createElement('li');
      li.className = 'ranking-item' + (i < 3 ? ' ranking-top' : '');

      const place = document.createElement('span');
      place.className = 'ranking-place';
      place.textContent = `${i + 1}º`;

      const name = document.createElement('span');
      name.className = 'ranking-name';
      name.textContent = r.name;

      const count = document.createElement('span');
      count.className = 'ranking-count';
      count.textContent = `${r.vitorias} vitória${r.vitorias === 1 ? '' : 's'}`;

      li.appendChild(place);
      li.appendChild(name);
      li.appendChild(count);
      rankingList.appendChild(li);
    });
  }

  refreshRanking();
  setInterval(refreshRanking, 6000);

  // ---------------------------------------------------------
  // Entrar na sala / identificação
  // ---------------------------------------------------------
  btnOpen.addEventListener('click', () => {
    if (state.name && state.matricula) {
      showRooms();
    } else {
      inputName.value = state.name;
      inputMatricula.value = state.matricula;
      showScreen('identify');
    }
  });

  btnJoin.addEventListener('click', () => {
    const name = inputName.value.trim();
    const matricula = inputMatricula.value.trim();

    if (!name || !matricula) {
      identifyError.textContent = 'Preenche nome e matrícula pra continuar.';
      return;
    }

    identifyError.textContent = '';
    state.name = name;
    state.matricula = matricula;
    localStorage.setItem('dado_nome', name);
    localStorage.setItem('dado_matricula', matricula);
    showRooms();
  });

  // ---------------------------------------------------------
  // Lista de salas — criar ou entrar numa sala existente
  // ---------------------------------------------------------
  function showRooms() {
    stopHeartbeat();
    state.isCreator = false;
    resultMsg.textContent = '';
    btnAgain.classList.add('hidden');
    roomsError.textContent = '';
    showScreen('rooms');
    startRoomsPolling();
  }

  function startRoomsPolling() {
    stopRoomsPolling();
    pollRooms();
    state.roomsPollTimer = setInterval(pollRooms, 2000);
  }

  function stopRoomsPolling() {
    if (state.roomsPollTimer) clearInterval(state.roomsPollTimer);
    state.roomsPollTimer = null;
  }

  // Aproveita qualquer poll (de qualquer aluno) pra recolher salas cujo
  // criador sumiu sem avisar (fechou/travou sem disparar o pagehide).
  async function cleanupStaleRooms() {
    try {
      await dbQuery(
        `DELETE FROM sessions
         WHERE status = 'waiting'
           AND creator_last_seen < now() - ($1 || ' seconds')::interval`,
        [STALE_SECONDS]
      );
    } catch (e) {
      console.error('Falha ao limpar salas abandonadas:', e);
    }
  }

  function startHeartbeat(sessionId) {
    stopHeartbeat();
    state.heartbeatTimer = setInterval(() => {
      dbQuery(
        `UPDATE sessions SET creator_last_seen = now() WHERE id = $1 AND status = 'waiting'`,
        [sessionId]
      ).catch((e) => console.error('Falha no heartbeat da sala:', e));
    }, HEARTBEAT_MS);
  }

  function stopHeartbeat() {
    if (state.heartbeatTimer) clearInterval(state.heartbeatTimer);
    state.heartbeatTimer = null;
  }

  async function pollRooms() {
    await cleanupStaleRooms();
    let rows;
    try {
      rows = await dbQuery(`
        SELECT s.id, s.room_number, s.created_by_name,
               COUNT(sp.matricula)::int AS players
        FROM sessions s
        LEFT JOIN session_players sp ON sp.session_id = s.id
        WHERE s.status = 'waiting'
        GROUP BY s.id, s.room_number, s.created_by_name, s.created_at
        HAVING COUNT(sp.matricula) < 6
        ORDER BY s.created_at ASC
      `);
    } catch (e) {
      console.error('Falha ao listar salas:', e);
      return;
    }
    renderRooms(rows);
  }

  function renderRooms(rooms) {
    roomsList.innerHTML = '';
    roomsEmpty.classList.toggle('hidden', rooms.length > 0);

    rooms.forEach((room) => {
      const li = document.createElement('li');

      const info = document.createElement('div');
      info.className = 'room-info';

      const name = document.createElement('span');
      name.className = 'room-name';
      name.textContent = `Sala de ${room.created_by_name || 'Anônimo'}`;

      const meta = document.createElement('span');
      meta.className = 'room-meta';
      meta.textContent = `sala #${room.room_number} · ${room.players}/6 jogadores`;

      info.appendChild(name);
      info.appendChild(meta);

      const btn = document.createElement('button');
      btn.className = 'btn-enter-room';
      btn.textContent = 'Entrar';
      btn.addEventListener('click', () => enterRoom(room.id));

      li.appendChild(info);
      li.appendChild(btn);
      roomsList.appendChild(li);
    });
  }

  btnCreateRoom.addEventListener('click', async () => {
    btnCreateRoom.disabled = true;
    roomsError.textContent = '';
    try {
      const created = await dbQuery(
        `INSERT INTO sessions (created_by_name, created_by_matricula)
         VALUES ($1, $2) RETURNING id`,
        [state.name, state.matricula]
      );
      await enterRoom(created[0].id, { isCreator: true });
    } catch (e) {
      roomsError.textContent = e.message;
    } finally {
      btnCreateRoom.disabled = false;
    }
  });

  async function joinSession(sessionId) {
    await dbQuery(
      `INSERT INTO session_players (session_id, matricula, name)
       VALUES ($1, $2, $3)
       ON CONFLICT (session_id, matricula) DO UPDATE SET name = EXCLUDED.name`,
      [sessionId, state.matricula, state.name]
    );
  }

  async function enterRoom(sessionId, options) {
    try {
      await joinSession(sessionId);
    } catch (e) {
      if (String(e.message).includes('session_full')) {
        roomsError.textContent = 'Essa sala encheu bem na hora — escolhe outra ou crie a sua.';
        pollRooms();
        return;
      }
      roomsError.textContent = e.message;
      return;
    }
    stopRoomsPolling();
    state.sessionId = sessionId;
    state.isCreator = !!(options && options.isCreator);
    if (state.isCreator) startHeartbeat(sessionId);
    showScreen('lobby');
    startLobbyPolling();
  }

  // ---------------------------------------------------------
  // Sala de espera
  // ---------------------------------------------------------
  function startLobbyPolling() {
    stopLobbyPolling();
    pollLobby();
    state.pollTimer = setInterval(pollLobby, 1500);
  }

  function stopLobbyPolling() {
    if (state.pollTimer) clearInterval(state.pollTimer);
    state.pollTimer = null;
  }

  async function pollLobby() {
    if (!state.sessionId) return;
    if (!state.isCreator) await cleanupStaleRooms();
    const sessionIdAtRequest = state.sessionId;
    let rows;
    try {
      rows = await dbQuery(
        `SELECT sp.matricula, sp.name, sp.dice_value, s.status, s.roll_result, s.created_by_name
         FROM sessions s
         LEFT JOIN session_players sp ON sp.session_id = s.id
         WHERE s.id = $1
         ORDER BY sp.joined_at ASC NULLS LAST`,
        [sessionIdAtRequest]
      );
    } catch (e) {
      console.error('Falha ao atualizar a sala:', e);
      return;
    }
    // A sala pode ter sido fechada ou trocada enquanto a consulta estava em voo.
    if (state.sessionId !== sessionIdAtRequest) return;

    if (!rows.length) {
      stopLobbyPolling();
      stopHeartbeat();
      state.sessionId = null;
      showRooms();
      roomsError.textContent = 'Essa sala foi encerrada porque quem criou saiu ou recarregou a página.';
      return;
    }

    const { status, roll_result: rollResult, created_by_name: createdByName } = rows[0];
    lobbyTitle.textContent = `Sala de ${createdByName || 'Anônimo'}`;
    state.lobbySnapshot = rows.filter((r) => r.matricula);

    if (status === 'finished') {
      stopLobbyPolling();
      handleFinished(rollResult);
      return;
    }

    renderLobby(state.lobbySnapshot);
  }

  function renderLobby(players) {
    lobbyCount.textContent = players.length;
    lobbyList.innerHTML = '';

    players.forEach((p) => {
      const li = document.createElement('li');
      const isMe = p.matricula === state.matricula;
      if (isMe) li.classList.add('me');

      const name = document.createElement('span');
      name.textContent = p.name + (isMe ? ' (você)' : '');

      const badge = document.createElement('span');
      badge.className = 'lobby-badge' + (p.dice_value ? ' picked' : '');
      badge.textContent = p.dice_value ? `Nº ${p.dice_value}` : 'escolhendo…';

      li.appendChild(name);
      li.appendChild(badge);
      lobbyList.appendChild(li);
    });

    const me = players.find((p) => p.matricula === state.matricula);
    const takenByOthers = players
      .filter((p) => p.matricula !== state.matricula && p.dice_value)
      .map((p) => p.dice_value);
    renderDiceOptions(takenByOthers, me ? me.dice_value : null);

    const chosenCount = players.filter((p) => p.dice_value).length;
    const allReady = players.length === 6 && chosenCount === 6;
    btnLaunch.disabled = !allReady;
    lobbyHint.textContent = allReady
      ? 'Todo mundo escolheu! Alguém clica em INICIAR pra rolar o dado.'
      : `Aguardando: ${chosenCount}/${players.length} já escolheram um número (precisa de 6 jogadores).`;
  }

  function renderDiceOptions(takenByOthers, myValue) {
    const previousValue = selectDice.value;
    selectDice.innerHTML = '';

    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = 'Nº';
    selectDice.appendChild(blank);

    for (let n = 1; n <= 6; n++) {
      const opt = document.createElement('option');
      opt.value = String(n);
      opt.textContent = String(n);
      if (takenByOthers.includes(n) && n !== myValue) opt.disabled = true;
      selectDice.appendChild(opt);
    }

    selectDice.value = myValue ? String(myValue) : previousValue || '';
  }

  selectDice.addEventListener('change', async () => {
    const value = selectDice.value;
    if (!value || !state.sessionId) return;
    try {
      await dbQuery(
        `UPDATE session_players SET dice_value = $1 WHERE session_id = $2 AND matricula = $3`,
        [Number(value), state.sessionId, state.matricula]
      );
    } catch (e) {
      lobbyHint.textContent = 'Esse número já foi escolhido por outra pessoa — escolhe outro.';
      selectDice.value = '';
    }
    pollLobby();
  });

  btnLaunch.addEventListener('click', async () => {
    if (!state.sessionId) return;
    btnLaunch.disabled = true;
    try {
      await dbQuery(
        `WITH updated AS (
           UPDATE sessions s
           SET status = 'finished',
               roll_result = (floor(random() * 6) + 1)::int,
               finished_at = now()
           WHERE s.id = $1
             AND s.status = 'waiting'
             AND (SELECT COUNT(*) FROM session_players sp
                  WHERE sp.session_id = s.id AND sp.dice_value IS NOT NULL) = 6
           RETURNING id, roll_result
         )
         INSERT INTO wins (session_id, matricula, name, dice_value)
         SELECT u.id, sp.matricula, sp.name, sp.dice_value
         FROM updated u
         JOIN session_players sp ON sp.session_id = u.id AND sp.dice_value = u.roll_result
         RETURNING matricula`,
        [state.sessionId]
      );
    } catch (e) {
      console.error('Falha ao iniciar a rodada:', e);
    }
    pollLobby();
  });

  // ---------------------------------------------------------
  // Resultado
  // ---------------------------------------------------------
  function handleFinished(rollResult) {
    stopHeartbeat();
    showScreen('result');
    animateDiceTo(rollResult, () => {
      renderDiceFace(rollResult);
      const winner = state.lobbySnapshot.find((p) => p.dice_value === rollResult);
      resultMsg.textContent = winner
        ? `Saiu ${rollResult} — ${winner.name} venceu essa rodada! 🏆`
        : `Saiu ${rollResult}.`;
      resultMsg.classList.remove('pop');
      void resultMsg.offsetWidth;
      resultMsg.classList.add('pop');
      btnAgain.classList.remove('hidden');
      refreshRanking();
    });
  }

  function animateDiceTo(finalValue, done) {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      done();
      return;
    }
    let ticks = 0;
    const maxTicks = 14;
    diceFace.classList.add('rolling');
    const timer = setInterval(() => {
      renderDiceFace(1 + Math.floor(Math.random() * 6));
      ticks++;
      if (ticks >= maxTicks) {
        clearInterval(timer);
        diceFace.classList.remove('rolling');
        done();
      }
    }, 90);
  }

  btnAgain.addEventListener('click', () => {
    state.sessionId = null;
    showRooms();
  });
})();
