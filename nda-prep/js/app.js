const App = {
  state: {
    practice: { questions: [], current: 0, answers: {}, score: 0, finished: false },
    mock: { questions: [], current: 0, answers: {}, review: new Set(), type: '', timer: null, timeLeft: 0, finished: false }
  },

  init() {
    this.loadProgress();
    this.bindNavigation();
    this.bindPractice();
    this.bindMock();
    this.renderDashboard();
    this.renderSyllabus();
    this.renderFormulas();
    this.renderTips();
    this.renderStudyPlan();
    this.renderProgress();
    this.setupMobileMenu();
    this.updateStreak();
  },

  loadProgress() {
    try {
      const saved = localStorage.getItem('ndaPrepProgress');
      this.progress = saved ? JSON.parse(saved) : {
        solved: 0, correct: 0, mocks: [], activity: [],
        subjects: {}, weakAreas: {}
      };
    } catch {
      this.progress = { solved: 0, correct: 0, mocks: [], activity: [], subjects: {}, weakAreas: {} };
    }
  },

  saveProgress() {
    localStorage.setItem('ndaPrepProgress', JSON.stringify(this.progress));
    this.updateDashboardStats();
  },

  navigate(section) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector(`[data-section="${section}"]`)?.classList.add('active');
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById(section)?.classList.add('active');
    document.getElementById('sidebar')?.classList.remove('open');
    if (section === 'progress') this.renderProgress();
  },

  bindNavigation() {
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => this.navigate(btn.dataset.section));
    });
    document.getElementById('generatePlan')?.addEventListener('click', () => this.renderStudyPlan());
    document.getElementById('formulaSearch')?.addEventListener('input', (e) => this.renderFormulas(e.target.value));
    document.getElementById('resetProgress')?.addEventListener('click', () => this.confirmReset());
  },

  setupMobileMenu() {
    document.getElementById('menuToggle')?.addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('open');
    });
  },

  renderDashboard() {
    this.updateDashboardStats();
    this.renderCountdown();
    this.renderDailyFocus();
  },

  updateDashboardStats() {
    const acc = this.progress.solved > 0
      ? Math.round((this.progress.correct / this.progress.solved) * 100) : 0;
    document.getElementById('statSolved').textContent = this.progress.solved;
    document.getElementById('statAccuracy').textContent = acc + '%';
    document.getElementById('statMocks').textContent = this.progress.mocks.length;
    document.getElementById('statStreak').textContent = (this.progress.streak || 0) + ' days';
  },

  renderCountdown() {
    const examDates = [
      new Date('2026-04-20'), new Date('2026-09-14'),
      new Date('2027-04-18'), new Date('2027-09-05')
    ];
    const now = new Date();
    const next = examDates.find(d => d > now) || examDates[examDates.length - 1];
    const diff = Math.ceil((next - now) / (1000 * 60 * 60 * 24));
    document.getElementById('examCountdown').innerHTML = `
      <div class="countdown-label">Next NDA Exam</div>
      <div class="countdown-value">${diff} Days Left</div>
    `;
  },

  renderDailyFocus() {
    const day = new Date().getDay();
    const focus = DAILY_FOCUS[day % DAILY_FOCUS.length];
    document.getElementById('dailyFocus').innerHTML = DAILY_FOCUS.map(f => `
      <div class="daily-focus-item">
        <strong>${f.subject}:</strong> ${f.task}
      </div>
    `).join('');
  },

  renderSyllabus() {
    const container = document.getElementById('syllabusContent');
    let html = '';
    for (const [key, data] of Object.entries(SYLLABUS)) {
      for (const topic of data.topics) {
        html += `
          <div class="syllabus-topic">
            <div class="syllabus-topic-header" onclick="this.parentElement.classList.toggle('open')">
              <span>${data.icon} ${topic.name}</span>
              <span>▼</span>
            </div>
            <div class="syllabus-topic-body">
              <ul>${topic.items.map(i => `<li>${i}</li>`).join('')}</ul>
            </div>
          </div>
        `;
      }
    }
    container.innerHTML = html;
  },

  renderStudyPlan() {
    const days = document.getElementById('planDuration').value;
    const plan = STUDY_PLAN_TEMPLATE[days];
    const container = document.getElementById('studyPlanContent');
    container.innerHTML = plan.map(week => `
      <div class="plan-week">
        <h4>${week.week} — ${week.focus}</h4>
        ${week.days.map((d, i) => `
          <div class="plan-day">
            <span class="day-label">Day ${i + 1}</span>
            <span>${d}</span>
          </div>
        `).join('')}
      </div>
    `).join('');
  },

  renderFormulas(search = '') {
    const container = document.getElementById('formulasContent');
    const filtered = FORMULAS.filter(f =>
      !search || f.name.toLowerCase().includes(search.toLowerCase()) ||
      f.category.toLowerCase().includes(search.toLowerCase()) ||
      f.formula.toLowerCase().includes(search.toLowerCase())
    );
    container.innerHTML = filtered.map(f => `
      <div class="formula-card">
        <h4>${f.category} — ${f.name}</h4>
        <div class="formula">${f.formula}</div>
        <p>${f.note}</p>
      </div>
    `).join('');
  },

  renderTips() {
    document.getElementById('tipsContent').innerHTML = TIPS.map((t, i) => `
      <div class="tip-card">
        <span class="tip-number">${i + 1}</span>
        <h4>${t.title}</h4>
        <p>${t.text}</p>
      </div>
    `).join('');
  },

  // Practice Mode
  bindPractice() {
    document.getElementById('startPractice')?.addEventListener('click', () => this.startPractice());
    document.getElementById('practiceNext')?.addEventListener('click', () => this.practiceNext());
    document.getElementById('practicePrev')?.addEventListener('click', () => this.practicePrev());
    document.getElementById('practiceFinish')?.addEventListener('click', () => this.finishPractice());
  },

  startPractice() {
    const subject = document.getElementById('practiceSubject').value;
    const difficulty = document.getElementById('practiceDifficulty').value;
    const count = parseInt(document.getElementById('practiceCount').value);
    const questions = getQuestionsByFilter(subject, difficulty, count);

    if (questions.length === 0) {
      alert('No questions found for this filter. Try different options.');
      return;
    }

    this.state.practice = { questions, current: 0, answers: {}, score: 0, finished: false };
    document.getElementById('practiceSetup').classList.add('hidden');
    document.getElementById('practiceQuiz').classList.remove('hidden');
    document.getElementById('practiceResult').classList.add('hidden');
    this.renderPracticeQuestion();
  },

  renderPracticeQuestion() {
    const { questions, current, answers } = this.state.practice;
    const q = questions[current];
    const total = questions.length;
    const answered = answers[current];

    document.getElementById('practiceCounter').textContent = `${current + 1} / ${total}`;
    document.getElementById('practiceProgress').style.width = `${((current + 1) / total) * 100}%`;
    document.getElementById('practiceSubjectBadge').textContent = SUBJECT_LABELS[q.subject] || q.subject;
    document.getElementById('practiceScore').textContent = this.state.practice.score;

    const labels = ['A', 'B', 'C', 'D'];
    let optionsHtml = q.options.map((opt, i) => {
      let cls = 'option-btn';
      if (answered !== undefined) {
        if (i === q.answer) cls += ' correct';
        else if (i === answered && i !== q.answer) cls += ' wrong';
        else if (i === answered) cls += ' selected';
      } else if (answers[current] === i) {
        cls += ' selected';
      }
      return `<button class="${cls}" data-idx="${i}" ${answered !== undefined ? 'disabled' : ''}>
        <span class="option-label">${labels[i]}</span><span>${opt}</span>
      </button>`;
    }).join('');

    let explanation = '';
    if (answered !== undefined) {
      explanation = `<div class="explanation"><strong>Explanation:</strong> ${q.explanation}</div>`;
    }

    document.getElementById('practiceQuestionCard').innerHTML = `
      <div class="question-text">Q${current + 1}. ${q.question}</div>
      <div class="options-list">${optionsHtml}</div>
      ${explanation}
    `;

    document.querySelectorAll('#practiceQuestionCard .option-btn').forEach(btn => {
      btn.addEventListener('click', () => this.selectPracticeAnswer(parseInt(btn.dataset.idx)));
    });

    document.getElementById('practicePrev').disabled = current === 0;
    document.getElementById('practiceNext').classList.toggle('hidden', current === total - 1);
    document.getElementById('practiceFinish').classList.toggle('hidden', current !== total - 1);
  },

  selectPracticeAnswer(idx) {
    const { current, answers, questions } = this.state.practice;
    if (answers[current] !== undefined) return;

    answers[current] = idx;
    const q = questions[current];
    if (idx === q.answer) this.state.practice.score++;

    this.progress.solved++;
    if (idx === q.answer) this.progress.correct++;
    this.progress.subjects[q.subject] = this.progress.subjects[q.subject] || { total: 0, correct: 0 };
    this.progress.subjects[q.subject].total++;
    if (idx === q.answer) this.progress.subjects[q.subject].correct++;
    else {
      this.progress.weakAreas[q.subject] = (this.progress.weakAreas[q.subject] || 0) + 1;
    }
    this.progress.activity.unshift({
      type: 'practice', subject: q.subject,
      correct: idx === q.answer, date: new Date().toISOString()
    });
    if (this.progress.activity.length > 20) this.progress.activity.pop();
    this.saveProgress();
    this.renderPracticeQuestion();
  },

  practiceNext() {
    if (this.state.practice.current < this.state.practice.questions.length - 1) {
      this.state.practice.current++;
      this.renderPracticeQuestion();
    }
  },

  practicePrev() {
    if (this.state.practice.current > 0) {
      this.state.practice.current--;
      this.renderPracticeQuestion();
    }
  },

  finishPractice() {
    const { questions, answers, score } = this.state.practice;
    const attempted = Object.keys(answers).length;
    const correct = score;
    const wrong = attempted - correct;
    const skipped = questions.length - attempted;

    document.getElementById('practiceQuiz').classList.add('hidden');
    const resultEl = document.getElementById('practiceResult');
    resultEl.classList.remove('hidden');
    resultEl.innerHTML = `
      <h3>Practice Complete!</h3>
      <div class="result-score">${Math.round((correct / questions.length) * 100)}%</div>
      <div class="result-details">
        <div class="result-stat"><div class="val">${correct}</div><div class="lbl">Correct</div></div>
        <div class="result-stat"><div class="val">${wrong}</div><div class="lbl">Wrong</div></div>
        <div class="result-stat"><div class="val">${skipped}</div><div class="lbl">Skipped</div></div>
        <div class="result-stat"><div class="val">${questions.length}</div><div class="lbl">Total</div></div>
      </div>
      <button class="btn btn-primary" onclick="App.resetPractice()">Practice Again</button>
      <button class="btn btn-outline" onclick="App.navigate('progress')">View Progress</button>
    `;
  },

  resetPractice() {
    document.getElementById('practiceSetup').classList.remove('hidden');
    document.getElementById('practiceQuiz').classList.add('hidden');
    document.getElementById('practiceResult').classList.add('hidden');
  },

  // Mock Test
  bindMock() {
    document.querySelectorAll('.start-mock').forEach(btn => {
      btn.addEventListener('click', () => this.startMock(btn.dataset.type));
    });
    document.getElementById('mockNext')?.addEventListener('click', () => this.mockNext());
    document.getElementById('mockPrev')?.addEventListener('click', () => this.mockPrev());
    document.getElementById('mockMarkReview')?.addEventListener('click', () => this.toggleReview());
    document.getElementById('mockSubmit')?.addEventListener('click', () => this.confirmSubmitMock());
  },

  startMock(type) {
    const questions = getMockQuestions(type);
    const duration = getMockDuration(type);

    this.state.mock = {
      questions, current: 0, answers: {}, review: new Set(),
      type, timer: null, timeLeft: duration, finished: false
    };

    document.getElementById('mockSelection').classList.add('hidden');
    document.getElementById('mockQuiz').classList.remove('hidden');
    document.getElementById('mockResult').classList.add('hidden');

    const labels = { 'math': 'Math Mock', 'math-mini': 'Math Mini', 'gat': 'GAT Mock', 'gat-mini': 'GAT Mini', 'combined': 'Combined Mock' };
    document.getElementById('mockTypeBadge').textContent = labels[type] || 'Mock Test';

    this.renderMockPalette();
    this.renderMockQuestion();
    this.startMockTimer();
  },

  startMockTimer() {
    if (this.state.mock.timer) clearInterval(this.state.mock.timer);
    this.updateTimerDisplay();
    this.state.mock.timer = setInterval(() => {
      this.state.mock.timeLeft--;
      this.updateTimerDisplay();
      if (this.state.mock.timeLeft <= 0) {
        clearInterval(this.state.mock.timer);
        this.submitMock();
      }
    }, 1000);
  },

  updateTimerDisplay() {
    const t = this.state.mock.timeLeft;
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = t % 60;
    const el = document.getElementById('mockTimer');
    el.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    el.classList.toggle('warning', t < 300);
  },

  renderMockPalette() {
    const { questions, current, answers, review } = this.state.mock;
    document.getElementById('questionPalette').innerHTML = questions.map((_, i) => {
      let cls = 'palette-btn';
      if (i === current) cls += ' current';
      if (answers[i] !== undefined) cls += ' answered';
      if (review.has(i)) cls += ' review';
      return `<button class="${cls}" onclick="App.goToMockQuestion(${i})">${i + 1}</button>`;
    }).join('');
  },

  goToMockQuestion(idx) {
    this.saveMockAnswer();
    this.state.mock.current = idx;
    this.renderMockQuestion();
    this.renderMockPalette();
  },

  renderMockQuestion() {
    const { questions, current, answers } = this.state.mock;
    const q = questions[current];
    const labels = ['A', 'B', 'C', 'D'];

    document.getElementById('mockCounter').textContent = `${current + 1} / ${questions.length}`;
    document.getElementById('mockQuestionCard').innerHTML = `
      <div class="question-text">Q${current + 1}. ${q.question}</div>
      <div class="options-list">
        ${q.options.map((opt, i) => `
          <button class="option-btn ${answers[current] === i ? 'selected' : ''}" data-idx="${i}">
            <span class="option-label">${labels[i]}</span><span>${opt}</span>
          </button>
        `).join('')}
      </div>
    `;

    document.querySelectorAll('#mockQuestionCard .option-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#mockQuestionCard .option-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.state.mock.answers[current] = parseInt(btn.dataset.idx);
        this.renderMockPalette();
      });
    });
  },

  saveMockAnswer() {
    const selected = document.querySelector('#mockQuestionCard .option-btn.selected');
    if (selected) {
      this.state.mock.answers[this.state.mock.current] = parseInt(selected.dataset.idx);
    }
  },

  mockNext() {
    this.saveMockAnswer();
    if (this.state.mock.current < this.state.mock.questions.length - 1) {
      this.state.mock.current++;
      this.renderMockQuestion();
      this.renderMockPalette();
    }
  },

  mockPrev() {
    this.saveMockAnswer();
    if (this.state.mock.current > 0) {
      this.state.mock.current--;
      this.renderMockQuestion();
      this.renderMockPalette();
    }
  },

  toggleReview() {
    const idx = this.state.mock.current;
    if (this.state.mock.review.has(idx)) this.state.mock.review.delete(idx);
    else this.state.mock.review.add(idx);
    this.renderMockPalette();
  },

  confirmSubmitMock() {
    this.showModal('Submit Test?', 'Are you sure you want to submit? You cannot change answers after submission.', () => this.submitMock());
  },

  submitMock() {
    if (this.state.mock.timer) clearInterval(this.state.mock.timer);
    this.saveMockAnswer();

    const { questions, answers, type } = this.state.mock;
    const marks = getMockMarks(type);
    let correct = 0, wrong = 0, skipped = 0, totalMarks = 0;

    questions.forEach((q, i) => {
      if (answers[i] === undefined) { skipped++; return; }
      if (answers[i] === q.answer) { correct++; totalMarks += marks.correct; }
      else { wrong++; totalMarks += marks.wrong; }
    });

    const maxMarks = questions.length * marks.correct;
    this.progress.mocks.unshift({
      type, correct, wrong, skipped, totalMarks: Math.round(totalMarks * 100) / 100,
      maxMarks, date: new Date().toISOString()
    });
    this.progress.solved += correct + wrong;
    this.progress.correct += correct;
    this.saveProgress();

    document.getElementById('mockQuiz').classList.add('hidden');
    const resultEl = document.getElementById('mockResult');
    resultEl.classList.remove('hidden');
    resultEl.innerHTML = `
      <h3>Mock Test Result</h3>
      <div class="result-score">${Math.round(totalMarks)}/${maxMarks}</div>
      <div class="result-details">
        <div class="result-stat"><div class="val">${correct}</div><div class="lbl">Correct</div></div>
        <div class="result-stat"><div class="val">${wrong}</div><div class="lbl">Wrong</div></div>
        <div class="result-stat"><div class="val">${skipped}</div><div class="lbl">Skipped</div></div>
        <div class="result-stat"><div class="val">${Math.round((correct / questions.length) * 100)}%</div><div class="lbl">Accuracy</div></div>
      </div>
      <p style="color:var(--text-muted);margin:16px 0">Negative marking applied: +${marks.correct} correct, ${marks.wrong} wrong</p>
      <button class="btn btn-primary" onclick="App.resetMock()">Take Another Mock</button>
      <button class="btn btn-outline" onclick="App.navigate('progress')">View Progress</button>
    `;
  },

  resetMock() {
    document.getElementById('mockSelection').classList.remove('hidden');
    document.getElementById('mockQuiz').classList.add('hidden');
    document.getElementById('mockResult').classList.add('hidden');
  },

  // Progress
  renderProgress() {
    this.renderSubjectChart();
    this.renderActivity();
    this.renderMockHistory();
    this.renderWeakAreas();
  },

  renderSubjectChart() {
    const container = document.getElementById('subjectChart');
    const subjects = this.progress.subjects;
    if (Object.keys(subjects).length === 0) {
      container.innerHTML = '<p style="color:var(--text-muted)">Start practicing to see your performance!</p>';
      return;
    }
    container.innerHTML = Object.entries(subjects).map(([sub, data]) => {
      const pct = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
      return `<div class="subject-bar">
        <span class="label">${SUBJECT_LABELS[sub] || sub}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
        <span class="pct">${pct}%</span>
      </div>`;
    }).join('');
  },

  renderActivity() {
    const container = document.getElementById('recentActivity');
    if (!this.progress.activity.length) {
      container.innerHTML = '<p style="color:var(--text-muted)">No activity yet. Start practicing!</p>';
      return;
    }
    container.innerHTML = this.progress.activity.slice(0, 10).map(a => {
      const date = new Date(a.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      return `<div class="activity-item">
        <span>${a.type === 'practice' ? '✏️' : '📝'} ${SUBJECT_LABELS[a.subject] || a.subject}</span>
        <span style="color:${a.correct ? 'var(--success)' : 'var(--danger)'}">${a.correct ? '✓ Correct' : '✗ Wrong'} · ${date}</span>
      </div>`;
    }).join('');
  },

  renderMockHistory() {
    const container = document.getElementById('mockHistory');
    if (!this.progress.mocks.length) {
      container.innerHTML = '<p style="color:var(--text-muted)">No mock tests taken yet.</p>';
      return;
    }
    container.innerHTML = this.progress.mocks.slice(0, 5).map(m => {
      const date = new Date(m.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      return `<div class="history-item">
        <span>${m.type} Mock</span>
        <span style="color:var(--accent)">${m.totalMarks}/${m.maxMarks} · ${date}</span>
      </div>`;
    }).join('');
  },

  renderWeakAreas() {
    const container = document.getElementById('weakAreas');
    const weak = Object.entries(this.progress.weakAreas || {}).sort((a, b) => b[1] - a[1]);
    if (!weak.length) {
      container.innerHTML = '<p style="color:var(--text-muted)">No weak areas identified yet. Keep practicing!</p>';
      return;
    }
    container.innerHTML = weak.slice(0, 5).map(([sub, count]) =>
      `<span class="weak-tag">${SUBJECT_LABELS[sub] || sub} (${count} wrong)</span>`
    ).join('');
  },

  updateStreak() {
    const today = new Date().toDateString();
    const last = this.progress.lastVisit;
    if (last === today) return;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (last === yesterday.toDateString()) {
      this.progress.streak = (this.progress.streak || 0) + 1;
    } else if (last !== today) {
      this.progress.streak = 1;
    }
    this.progress.lastVisit = today;
    this.saveProgress();
  },

  showModal(title, message, onConfirm) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalMessage').textContent = message;
    document.getElementById('confirmModal').classList.remove('hidden');
    const confirm = document.getElementById('modalConfirm');
    const cancel = document.getElementById('modalCancel');
    const handler = () => {
      document.getElementById('confirmModal').classList.add('hidden');
      confirm.removeEventListener('click', handler);
      onConfirm();
    };
    confirm.onclick = handler;
    cancel.onclick = () => document.getElementById('confirmModal').classList.add('hidden');
  },

  confirmReset() {
    this.showModal('Reset Progress?', 'This will delete all your practice data, mock test history, and streak. This cannot be undone.', () => {
      localStorage.removeItem('ndaPrepProgress');
      this.progress = { solved: 0, correct: 0, mocks: [], activity: [], subjects: {}, weakAreas: {} };
      this.renderProgress();
      this.updateDashboardStats();
    });
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
