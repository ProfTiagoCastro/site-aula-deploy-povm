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
// Jogo do Dado da Sorte
// ---------------------------------------------------------
(function initDiceGame() {
  const startScreen = document.getElementById('start-screen');
  const setupScreen = document.getElementById('setup-screen');
  const playScreen = document.getElementById('play-screen');

  const btnStart = document.getElementById('btn-start');
  const playerCountInput = document.getElementById('player-count');
  const btnGenerate = document.getElementById('btn-generate');
  const playersForm = document.getElementById('players-form');
  const btnConfirm = document.getElementById('btn-confirm');
  const setupError = document.getElementById('setup-error');

  const diceFace = document.getElementById('dice-face');
  const btnRoll = document.getElementById('btn-roll');
  const playersList = document.getElementById('players-list');
  const roundMsg = document.getElementById('round-msg');
  const btnRestart = document.getElementById('btn-restart');

  const btnHistory = document.getElementById('btn-history');
  const historyPanel = document.getElementById('history-panel');
  const historyList = document.getElementById('history-list');
  const historyEmpty = document.getElementById('history-empty');
  const historyCount = document.getElementById('history-count');

  const PIP_LAYOUT = {
    1: [5],
    2: [3, 7],
    3: [3, 5, 7],
    4: [1, 3, 7, 9],
    5: [1, 3, 5, 7, 9],
    6: [1, 3, 4, 6, 7, 9],
  };

  let players = [];
  let gameOver = false;
  let rollTimer = null;
  const winnersHistory = [];

  function showScreen(screen) {
    [startScreen, setupScreen, playScreen].forEach((s) => s.classList.add('hidden'));
    screen.classList.remove('hidden');
  }

  function addToHistory(name, value) {
    winnersHistory.unshift({ name, value });
    historyCount.textContent = winnersHistory.length;

    historyList.innerHTML = '';
    winnersHistory.forEach((entry, i) => {
      const li = document.createElement('li');

      const label = document.createElement('span');
      const rank = document.createElement('span');
      rank.className = 'history-rank';
      rank.textContent = `#${winnersHistory.length - i}`;
      label.appendChild(rank);
      label.appendChild(document.createTextNode(entry.name));

      const badge = document.createElement('span');
      badge.className = 'history-num';
      badge.textContent = entry.value;

      li.appendChild(label);
      li.appendChild(badge);
      historyList.appendChild(li);
    });

    historyEmpty.classList.toggle('hidden', winnersHistory.length > 0);
  }

  btnHistory.addEventListener('click', () => {
    const isHidden = historyPanel.classList.toggle('hidden');
    btnHistory.setAttribute('aria-expanded', String(!isHidden));
  });

  function renderDiceFace(value) {
    diceFace.innerHTML = '';
    const active = PIP_LAYOUT[value] || [];
    for (let cell = 1; cell <= 9; cell++) {
      const pip = document.createElement('div');
      if (active.includes(cell)) pip.className = 'pip';
      diceFace.appendChild(pip);
    }
  }

  function updateSelectAvailability() {
    const selects = Array.from(playersForm.querySelectorAll('select'));
    const chosen = selects.map((s) => s.value).filter(Boolean);

    selects.forEach((select) => {
      const current = select.value;
      Array.from(select.options).forEach((opt) => {
        if (!opt.value) return;
        opt.disabled = chosen.includes(opt.value) && opt.value !== current;
      });
    });
  }

  function buildPlayerRows(count) {
    playersForm.innerHTML = '';
    for (let i = 1; i <= count; i++) {
      const row = document.createElement('div');
      row.className = 'player-row';

      const tag = document.createElement('span');
      tag.className = 'player-tag';
      tag.textContent = i;

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.placeholder = `Jogador ${i}`;
      nameInput.maxLength = 24;
      nameInput.setAttribute('aria-label', `Nome do jogador ${i}`);

      const select = document.createElement('select');
      select.setAttribute('aria-label', `Número escolhido pelo jogador ${i}`);
      const blank = document.createElement('option');
      blank.value = '';
      blank.textContent = 'Nº';
      select.appendChild(blank);
      for (let n = 1; n <= 6; n++) {
        const opt = document.createElement('option');
        opt.value = n;
        opt.textContent = n;
        select.appendChild(opt);
      }
      select.addEventListener('change', updateSelectAvailability);

      row.appendChild(tag);
      row.appendChild(nameInput);
      row.appendChild(select);
      playersForm.appendChild(row);
    }
    btnConfirm.classList.remove('hidden');
    setupError.textContent = '';
  }

  btnStart.addEventListener('click', () => {
    showScreen(setupScreen);
  });

  btnGenerate.addEventListener('click', () => {
    let count = parseInt(playerCountInput.value, 10);
    if (Number.isNaN(count)) count = 2;
    count = Math.min(6, Math.max(2, count));
    playerCountInput.value = count;
    buildPlayerRows(count);
  });

  btnConfirm.addEventListener('click', () => {
    const rows = Array.from(playersForm.querySelectorAll('.player-row'));
    const collected = [];

    for (const row of rows) {
      const nameInput = row.querySelector('input[type="text"]');
      const select = row.querySelector('select');
      const name = nameInput.value.trim() || nameInput.placeholder;
      const value = select.value;

      if (!value) {
        setupError.textContent = 'Todo mundo precisa escolher um número do dado.';
        return;
      }
      collected.push({ name, value: parseInt(value, 10) });
    }

    const values = collected.map((p) => p.value);
    if (new Set(values).size !== values.length) {
      setupError.textContent = 'Cada jogador precisa de um número diferente.';
      return;
    }

    players = collected;
    setupError.textContent = '';
    startGame();
  });

  function startGame() {
    gameOver = false;
    renderDiceFace(1);
    btnRoll.textContent = 'Rolar o Dado';
    btnRoll.disabled = false;
    btnRestart.classList.add('hidden');
    roundMsg.textContent = 'Cliquem em "Rolar o Dado" pra começar!';
    renderPlayersList(null);
    showScreen(playScreen);
  }

  function renderPlayersList(winningValue) {
    playersList.innerHTML = '';
    players.forEach((p) => {
      const li = document.createElement('li');
      if (winningValue && p.value === winningValue) li.classList.add('winner');

      const name = document.createElement('span');
      name.textContent = p.name + (winningValue && p.value === winningValue ? ' 🏆' : '');

      const badge = document.createElement('span');
      badge.className = 'num-badge';
      badge.textContent = p.value;

      li.appendChild(name);
      li.appendChild(badge);
      playersList.appendChild(li);
    });
  }

  btnRoll.addEventListener('click', () => {
    if (gameOver) return;
    btnRoll.disabled = true;
    roundMsg.textContent = '';
    diceFace.classList.add('rolling');

    let ticks = 0;
    const maxTicks = 14;
    rollTimer = setInterval(() => {
      renderDiceFace(1 + Math.floor(Math.random() * 6));
      ticks++;
      if (ticks >= maxTicks) {
        clearInterval(rollTimer);
        finishRoll();
      }
    }, 90);
  });

  function finishRoll() {
    diceFace.classList.remove('rolling');
    const result = 1 + Math.floor(Math.random() * 6);
    renderDiceFace(result);

    const winner = players.find((p) => p.value === result);

    if (winner) {
      gameOver = true;
      renderPlayersList(result);
      roundMsg.textContent = `Saiu ${result} — ${winner.name} venceu! 🏆`;
      btnRoll.disabled = true;
      btnRestart.classList.remove('hidden');
      addToHistory(winner.name, winner.value);
    } else {
      renderPlayersList(null);
      roundMsg.textContent = `Saiu ${result} — ninguém cravou esse número. Rolem de novo!`;
      btnRoll.textContent = 'Rolar novamente';
      btnRoll.disabled = false;
    }
  }

  btnRestart.addEventListener('click', () => {
    players = [];
    playersForm.innerHTML = '';
    btnConfirm.classList.add('hidden');
    setupError.textContent = '';
    playerCountInput.value = 2;
    showScreen(setupScreen);
  });
})();
