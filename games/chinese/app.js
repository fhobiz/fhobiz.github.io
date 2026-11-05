(function () {
  'use strict';

  // ---------- State ----------
  const state = {
    name: '',
    mode: null, // 'say' | 'write'
    index: 0,
    score: 0,
    answers: [], // { english, expected, got, correct, points }
  };

  const POINTS = { say: 5, write: 10 };

  // ---------- DOM refs ----------
  const screens = {
    home: document.getElementById('screen-home'),
    game: document.getElementById('screen-game'),
    results: document.getElementById('screen-results'),
  };

  const playerNameInput = document.getElementById('player-name');
  const modeButtons = Array.from(document.querySelectorAll('.mode-btn'));
  const startBtn = document.getElementById('start-btn');
  const homeError = document.getElementById('home-error');

  const gameProgress = document.getElementById('game-progress');
  const gameScore = document.getElementById('game-score');
  const promptEnglish = document.getElementById('prompt-english');

  const sayControls = document.getElementById('say-controls');
  const recordBtn = document.getElementById('record-btn');
  const sayStatus = document.getElementById('say-status');
  const sayResult = document.getElementById('say-result');
  const sayHeard = document.getElementById('say-heard');
  const sayExpected = document.getElementById('say-expected');
  const sayFeedback = document.getElementById('say-feedback');
  const saySelfGrade = document.getElementById('say-self-grade');
  const sayAudioPlay = document.getElementById('say-audio-play');
  const sayCorrectBtn = document.getElementById('say-correct-btn');
  const sayWrongBtn = document.getElementById('say-wrong-btn');

  const writeControls = document.getElementById('write-controls');
  const writeBoxes = document.getElementById('write-boxes');
  const writeClearBtn = document.getElementById('write-clear-btn');
  const writeCheckBtn = document.getElementById('write-check-btn');
  const writeAnswer = document.getElementById('write-answer');
  const writeAnswerChinese = document.getElementById('write-answer-chinese');
  const writeCorrectBtn = document.getElementById('write-correct-btn');
  const writeWrongBtn = document.getElementById('write-wrong-btn');

  const nextBtn = document.getElementById('next-btn');

  const resultsName = document.getElementById('results-name');
  const resultsScore = document.getElementById('results-score');
  const resultsBody = document.getElementById('results-body');
  const playAgainBtn = document.getElementById('play-again-btn');

  // ---------- Screen navigation ----------
  function showScreen(name) {
    Object.keys(screens).forEach((key) => {
      screens[key].hidden = key !== name;
    });
  }

  // ---------- Home screen ----------
  function updateStartEnabled() {
    const nameOk = playerNameInput.value.trim().length > 0;
    startBtn.disabled = !(nameOk && state.mode);
  }

  playerNameInput.addEventListener('input', () => {
    homeError.hidden = true;
    updateStartEnabled();
  });

  modeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      state.mode = btn.getAttribute('data-mode');
      modeButtons.forEach((b) => b.classList.toggle('selected', b === btn));
      updateStartEnabled();
    });
  });

  startBtn.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    if (!name || !state.mode) {
      homeError.textContent = 'Please enter your name and choose a game.';
      homeError.hidden = false;
      return;
    }
    state.name = name;
    state.index = 0;
    state.score = 0;
    state.answers = [];
    showScreen('game');
    renderPhrase();
  });

  // ---------- Chinese text normalization for grading ----------
  function normalizeChinese(text) {
    return (text || '')
      .replace(/[\s,.!?，。！？、·,]/g, '')
      .trim();
  }

  // ---------- Game screen: shared ----------
  function currentPhrase() {
    return PHRASES[state.index];
  }

  function renderPhrase() {
    const phrase = currentPhrase();
    gameProgress.textContent = `${state.index + 1} / ${PHRASES.length}`;
    gameScore.textContent = `Score: ${state.score}`;
    promptEnglish.textContent = phrase.english;
    nextBtn.hidden = true;

    if (state.mode === 'say') {
      sayControls.hidden = false;
      writeControls.hidden = true;
      resetSayUI();
    } else {
      sayControls.hidden = true;
      writeControls.hidden = false;
      resetWriteUI();
    }
  }

  function recordAnswer(got, correct, points) {
    const phrase = currentPhrase();
    state.answers.push({
      english: phrase.english,
      expected: phrase.chinese,
      got,
      correct,
      points,
    });
    state.score += points;
    gameScore.textContent = `Score: ${state.score}`;
    nextBtn.hidden = false;
  }

  nextBtn.addEventListener('click', () => {
    state.index += 1;
    if (state.index >= PHRASES.length) {
      renderResults();
      showScreen('results');
    } else {
      renderPhrase();
    }
  });

  // ---------- Say it mode ----------
  const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
  const speechRecognitionSupported = !!SpeechRecognitionCtor;
  const mediaRecorderSupported = !!(navigator.mediaDevices && window.MediaRecorder);

  let currentStream = null;
  let currentRecorder = null;
  let currentRecognition = null;
  let recordedChunks = [];
  let recordedAudioUrl = null;
  let sayGraded = false;

  function resetSayUI() {
    recordBtn.hidden = false;
    recordBtn.disabled = false;
    recordBtn.textContent = '🎤 Record';
    sayStatus.textContent = '';
    sayResult.hidden = true;
    sayHeard.textContent = '';
    sayExpected.textContent = '';
    sayFeedback.textContent = '';
    sayFeedback.className = 'feedback-text';
    saySelfGrade.hidden = true;
    sayAudioPlay.hidden = true;
    sayGraded = false;
    if (recordedAudioUrl) {
      URL.revokeObjectURL(recordedAudioUrl);
      recordedAudioUrl = null;
    }
    recordedChunks = [];
  }

  function stopMediaTracks() {
    if (currentStream) {
      currentStream.getTracks().forEach((t) => t.stop());
      currentStream = null;
    }
  }

  function gradeSayResult(heardText, { auto }) {
    if (sayGraded) return;
    sayGraded = true;
    const phrase = currentPhrase();
    const correct = auto ? normalizeChinese(heardText) === normalizeChinese(phrase.chinese) : heardText === 'correct';
    const points = correct ? POINTS.say : 0;
    const gotLabel = auto ? heardText || '(no speech detected)' : (heardText === 'correct' ? 'Self-marked: correct' : 'Self-marked: wrong');

    recordBtn.hidden = true;
    sayResult.hidden = false;
    sayHeard.textContent = auto ? `We heard: "${heardText || '(nothing)'}"` : '';
    sayExpected.textContent = `Expected: ${phrase.chinese} (${phrase.pinyin})`;
    sayFeedback.textContent = correct ? '✓ Correct! +5' : '✗ Wrong';
    sayFeedback.className = 'feedback-text ' + (correct ? 'correct' : 'wrong');
    saySelfGrade.hidden = true;

    if (recordedAudioUrl) {
      sayAudioPlay.hidden = false;
    }

    recordAnswer(gotLabel, correct, points);
  }

  function showSaySelfGradeFallback() {
    recordBtn.hidden = true;
    saySelfGrade.hidden = false;
    sayAudioPlay.hidden = !recordedAudioUrl;
    sayStatus.textContent = 'Listen back and mark yourself:';
  }

  sayAudioPlay.addEventListener('click', () => {
    if (recordedAudioUrl) {
      const audio = new Audio(recordedAudioUrl);
      audio.play();
    }
  });

  sayCorrectBtn.addEventListener('click', () => gradeSayResult('correct', { auto: false }));
  sayWrongBtn.addEventListener('click', () => gradeSayResult('wrong', { auto: false }));

  async function beginSayAttempt() {
    recordBtn.disabled = true;
    sayStatus.textContent = 'Listening… speak now';
    recordedChunks = [];

    // Try to capture audio for optional playback, regardless of recognition support.
    if (mediaRecorderSupported) {
      try {
        currentStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        currentRecorder = new MediaRecorder(currentStream);
        currentRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) recordedChunks.push(e.data);
        };
        currentRecorder.onstop = () => {
          if (recordedChunks.length > 0) {
            const blob = new Blob(recordedChunks, { type: 'audio/webm' });
            recordedAudioUrl = URL.createObjectURL(blob);
          }
          stopMediaTracks();
        };
        currentRecorder.start();
      } catch (err) {
        currentStream = null;
        currentRecorder = null;
      }
    }

    if (speechRecognitionSupported) {
      currentRecognition = new SpeechRecognitionCtor();
      currentRecognition.lang = 'zh-CN';
      currentRecognition.interimResults = false;
      currentRecognition.maxAlternatives = 1;

      let gotResult = false;

      currentRecognition.onresult = (event) => {
        gotResult = true;
        const transcript = event.results[0][0].transcript;
        if (currentRecorder && currentRecorder.state === 'recording') currentRecorder.stop();
        gradeSayResult(transcript, { auto: true });
      };

      currentRecognition.onerror = () => {
        if (currentRecorder && currentRecorder.state === 'recording') currentRecorder.stop();
      };

      currentRecognition.onend = () => {
        if (!gotResult) {
          if (currentRecorder && currentRecorder.state === 'recording') currentRecorder.stop();
          sayStatus.textContent = '';
          showSaySelfGradeFallback();
        }
      };

      try {
        currentRecognition.start();
      } catch (err) {
        showSaySelfGradeFallback();
      }
    } else {
      // No recognition available: manual stop, then self-grade.
      recordBtn.disabled = false;
      recordBtn.hidden = false;
      recordBtn.textContent = '⏹ Stop recording';
      recordBtn.onclick = () => {
        if (currentRecorder && currentRecorder.state === 'recording') currentRecorder.stop();
        sayStatus.textContent = '';
        showSaySelfGradeFallback();
        recordBtn.onclick = null;
      };
    }
  }

  recordBtn.addEventListener('click', () => {
    if (recordBtn.onclick) return; // manual-stop mode handles its own click
    beginSayAttempt();
  });

  // ---------- Write it mode ----------
  let writeCanvases = [];

  function makeCanvas() {
    const canvas = document.createElement('canvas');
    canvas.className = 'write-box-canvas';
    canvas.width = 144;
    canvas.height = 144;
    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1e293b';

    let drawing = false;
    let lastX = 0;
    let lastY = 0;

    function pos(evt) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return {
        x: (evt.clientX - rect.left) * scaleX,
        y: (evt.clientY - rect.top) * scaleY,
      };
    }

    canvas.addEventListener('pointerdown', (evt) => {
      drawing = true;
      canvas.setPointerCapture(evt.pointerId);
      const p = pos(evt);
      lastX = p.x;
      lastY = p.y;
    });

    canvas.addEventListener('pointermove', (evt) => {
      if (!drawing) return;
      const p = pos(evt);
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      lastX = p.x;
      lastY = p.y;
    });

    function stopDrawing() {
      drawing = false;
    }

    canvas.addEventListener('pointerup', stopDrawing);
    canvas.addEventListener('pointercancel', stopDrawing);
    canvas.addEventListener('pointerleave', stopDrawing);

    return { canvas, ctx };
  }

  function resetWriteUI() {
    const phrase = currentPhrase();
    const chars = Array.from(phrase.chinese);
    writeBoxes.innerHTML = '';
    writeCanvases = chars.map(() => makeCanvas());
    writeCanvases.forEach(({ canvas }) => writeBoxes.appendChild(canvas));

    writeClearBtn.hidden = false;
    writeCheckBtn.hidden = false;
    writeAnswer.hidden = true;
    writeAnswerChinese.textContent = '';
  }

  writeClearBtn.addEventListener('click', () => {
    writeCanvases.forEach(({ ctx, canvas }) => ctx.clearRect(0, 0, canvas.width, canvas.height));
  });

  writeCheckBtn.addEventListener('click', () => {
    const phrase = currentPhrase();
    writeAnswerChinese.textContent = `${phrase.chinese} (${phrase.pinyin})`;
    writeAnswer.hidden = false;
    writeClearBtn.hidden = true;
    writeCheckBtn.hidden = true;
  });

  function gradeWrite(correct) {
    const phrase = currentPhrase();
    const points = correct ? POINTS.write : 0;
    const gotLabel = correct ? 'Self-marked: correct' : 'Self-marked: wrong';
    writeCorrectBtn.disabled = true;
    writeWrongBtn.disabled = true;
    recordAnswer(gotLabel, correct, points);
  }

  writeCorrectBtn.addEventListener('click', () => gradeWrite(true));
  writeWrongBtn.addEventListener('click', () => gradeWrite(false));

  // Re-enable grade buttons each time write UI resets.
  const origResetWriteUI = resetWriteUI;
  resetWriteUI = function () {
    origResetWriteUI();
    writeCorrectBtn.disabled = false;
    writeWrongBtn.disabled = false;
  };

  // ---------- Results screen ----------
  function maxPossibleScore() {
    return PHRASES.length * POINTS[state.mode];
  }

  function renderResults() {
    resultsName.textContent = `${state.name} — ${state.mode === 'say' ? '说 Say it' : '写 Write it'}`;
    resultsScore.textContent = `Score: ${state.score} / ${maxPossibleScore()}`;

    resultsBody.innerHTML = '';
    state.answers.forEach((a) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${a.english}</td>
        <td>${a.expected}</td>
        <td>${a.got}</td>
        <td class="${a.correct ? 'mark-correct' : 'mark-wrong'}">${a.correct ? '✓' : '✗'}</td>
      `;
      resultsBody.appendChild(tr);
    });
  }

  playAgainBtn.addEventListener('click', () => {
    state.mode = null;
    state.index = 0;
    state.score = 0;
    state.answers = [];
    playerNameInput.value = '';
    modeButtons.forEach((b) => b.classList.remove('selected'));
    startBtn.disabled = true;
    showScreen('home');
  });

  showScreen('home');
})();
