/*
 * LobbyCard-Assistent der Jusos Ulm
 *
 * Führt Schritt für Schritt durch den Antrag auf LobbyCard / KinderBonusCard der Stadt Ulm,
 * wählt das passende der beiden Formulare aus und füllt es direkt im Browser aus.
 * Es werden keine Daten gespeichert oder an einen Server geschickt.
 *
 * Aufbau: Zustand (state) → Ansichten (views) → Navigation → Eingaben → PDF-Erstellung.
 * Texte stehen in texte.js, veränderliche Angaben (Grenzen, Anlaufstellen, Feldnamen) in config.js.
 */
(function () {
  'use strict';

  const C = window.LOBBYCARD_CONFIG;
  const TEXTS = window.LOBBYCARD_TEXTE;

  const LANGS = [
    { code: 'de', name: 'Deutsch' },
    { code: 'en', name: 'English' },
    { code: 'tr', name: 'Türkçe' },
    { code: 'uk', name: 'Українська' },
    { code: 'ru', name: 'Русский' },
    { code: 'ar', name: 'العربية', rtl: true },
    { code: 'fa', name: 'فارسی / دری', rtl: true },
  ];

  // ---------------------------------------------------------------------------
  // Zustand
  // ---------------------------------------------------------------------------

  const emptyDate = () => ({ d: '', m: '', y: '' });
  const emptyPerson = () => ({ firstName: '', lastName: '', birth: emptyDate() });

  function freshState(lang) {
    return {
      lang: lang || null,
      step: 'language',
      type: null,          // 'new' | 'renewal'
      residence: null,     // 'ulm' | 'school' | 'other'
      benefits: [],        // IDs aus C.benefits
      noBenefits: false,   // „Nein, keine davon“
      applicant: { ...emptyPerson(), street: '', zip: '', city: '', phone: '' },
      hasPartner: null,
      partner: emptyPerson(),
      children: [],
      incomes: [],         // { person: 'applicant' | 'partner' | 'child0'…, type: '1'…'11', amount: '' }
      district: '',
      errors: {},
      visited: {},         // schon angezeigte Schritte
      editing: false,      // kommt aus der Übersicht („Ändern“)
      pdfUrl: null,
      pdfName: '',
    };
  }

  let state = freshState();
  let autoAdvanceTimer = null;

  // ---------------------------------------------------------------------------
  // Hilfsfunktionen
  // ---------------------------------------------------------------------------

  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  // Text in der aktuellen Sprache (fällt auf Deutsch zurück). Platzhalter {name} werden escaped eingesetzt.
  function t(key, vars) {
    const pack = TEXTS[state.lang] || TEXTS.de;
    let s = pack[key] !== undefined ? pack[key] : TEXTS.de[key];
    if (s === undefined) {
      console.warn('Text fehlt:', key);
      return key;
    }
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? esc(vars[k]) : m));
    return s;
  }

  // Wie t(), aber als reiner Text (für confirm(), title, aria-label …)
  function tText(key, vars) {
    const div = document.createElement('div');
    div.innerHTML = t(key, vars);
    return div.textContent;
  }

  const isRtl = () => !!(LANGS.find((l) => l.code === state.lang) || {}).rtl;

  function getPath(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
  }

  function setPath(obj, path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    const target = keys.reduce((o, k) => o[k], obj);
    target[last] = value;
  }

  // Arabische und persische Ziffern in 0–9 umwandeln (viele Handy-Tastaturen schreiben sie)
  function normalizeDigits(s) {
    return String(s)
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
      .replace(/٫/g, ',')
      .replace(/٬/g, '');
  }

  function parseDate(b) {
    if (!b || !/^\d{1,2}$/.test(b.d) || !/^\d{1,2}$/.test(b.m) || !/^\d{4}$/.test(b.y)) return null;
    const d = Number(b.d), m = Number(b.m), y = Number(b.y);
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return dt;
  }

  function ageOf(b, ref = new Date()) {
    const dt = parseDate(b);
    if (!dt || dt > ref) return null;
    let age = ref.getFullYear() - dt.getFullYear();
    if (ref.getMonth() < dt.getMonth() || (ref.getMonth() === dt.getMonth() && ref.getDate() < dt.getDate())) age--;
    return age;
  }

  function fmtDate(b) {
    const dt = parseDate(b);
    if (!dt) return '';
    return `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.${dt.getFullYear()}`;
  }

  // Akzeptiert 1250 · 1250,50 · 1.250,50 · 1,250.50 · 1250.5
  function parseAmount(raw) {
    let s = normalizeDigits(raw).replace(/[\s€]/g, '');
    if (!s || !/^[\d.,]+$/.test(s)) return NaN;
    const last = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
    if (last >= 0 && s.length - last - 1 <= 2) s = s.slice(0, last).replace(/[.,]/g, '') + '.' + s.slice(last + 1);
    else s = s.replace(/[.,]/g, '');
    const n = parseFloat(s);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
  }

  // Deutsches Zahlenformat wie im Formular: 1.250,50
  function fmtMoney(n) {
    const cents = Math.round(Math.abs(n) * 100);
    const int = String(Math.floor(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (n < 0 && cents > 0 ? '-' : '') + int + ',' + String(cents % 100).padStart(2, '0');
  }

  const fmtEuro = (n) => fmtMoney(n) + ' €';
  const fmtWholeEuro = (n) => fmtMoney(n).replace(/,00$/, '') + ' €';
  const fullName = (p) => `${p.firstName.trim()} ${p.lastName.trim()}`.trim();
  const formName = (p) => `${p.lastName.trim()}, ${p.firstName.trim()}`;

  // ---------------------------------------------------------------------------
  // Fachlogik
  // ---------------------------------------------------------------------------

  // Welches Formular? Mit Sozialleistungen → „leistungen“, sonst → „einkommen“
  function formType() {
    if (state.benefits.length) return 'leistungen';
    if (state.noBenefits) return 'einkommen';
    return null;
  }

  function flow() {
    const steps = ['intro', 'type', 'residence'];
    if (state.residence === 'other') return steps.concat('notEligible');
    steps.push('benefits', 'applicant', 'household');
    if (formType() === 'einkommen') steps.push('income');
    steps.push('review', 'done');
    return steps;
  }

  // Haushaltstyp und Einkommensgrenze wie im Antrag „ohne Bezug von Sozialleistungen“
  function household() {
    const ages = state.children.map((c) => ageOf(c.birth));
    const under14 = ages.filter((a) => a !== null && a < 14).length;
    const kids14 = ages.filter((a) => a !== null && a >= 14).length;
    const partner = state.hasPartner === true;
    const L = C.incomeLimit;
    const limit = L.base + (kids14 + (partner ? 1 : 0)) * L.perPerson14 + under14 * L.perChildUnder14;
    const n = state.children.length;
    let type = 'other';
    if (n === 0) type = partner ? 'couple' : 'single';
    else if (under14 === n && n <= 3) type = (partner ? 'couple' : 'single') + n;
    return { persons: 1 + (partner ? 1 : 0) + n, limit, type };
  }

  // Spalte in der Einkommenstabelle: 1 = Antragsteller/in, 2 = Partner/in, 3–6 = Kind 1–4
  function personColumn(person) {
    if (person === 'applicant') return 1;
    if (person === 'partner') return state.hasPartner ? 2 : null;
    const m = /^child(\d)$/.exec(person || '');
    if (!m || Number(m[1]) >= state.children.length) return null;
    const col = 3 + Number(m[1]);
    return col <= C.incomeColumns ? col : null;
  }

  function incomePersons() {
    const list = [{ id: 'applicant', label: state.applicant.firstName.trim() || tText('income.you') }];
    if (state.hasPartner) list.push({ id: 'partner', label: state.partner.firstName.trim() || tText('household.partner') });
    state.children.forEach((c, i) => {
      if (3 + i <= C.incomeColumns) list.push({ id: 'child' + i, label: c.firstName.trim() || tText('household.child', { n: i + 1 }) });
    });
    return list;
  }

  function incomeSummary() {
    const cells = {};
    const perPerson = {};
    let total = 0;
    for (const inc of state.incomes) {
      const amount = parseAmount(inc.amount);
      const col = personColumn(inc.person);
      if (!Number.isFinite(amount) || amount <= 0 || !col || !inc.type) continue;
      cells[col + '-' + inc.type] = (cells[col + '-' + inc.type] || 0) + amount;
      perPerson[col] = (perPerson[col] || 0) + amount;
      total += amount;
    }
    total = Math.round(total * 100) / 100;
    const hh = household();
    return { cells, perPerson, total, limit: hh.limit, hh };
  }

  // Spalten, für die es im Haushalt eine Person gibt
  function presentColumns() {
    const cols = [1];
    if (state.hasPartner) cols.push(2);
    state.children.forEach((c, i) => { if (3 + i <= C.incomeColumns) cols.push(3 + i); });
    return cols;
  }

  const kinderBonusKids = () => state.children.filter((c) => {
    const a = ageOf(c.birth);
    return a !== null && a >= C.ages.kinderBonusMin && a <= C.ages.kinderBonusMax;
  });

  // ---------------------------------------------------------------------------
  // Prüfung der Eingaben
  // ---------------------------------------------------------------------------

  const RE_NAME = /^[\p{Script=Latin}\p{M}][\p{Script=Latin}\p{M}\s'’`´.\-]*$/u;
  const RE_ADDRESS = /^[\p{Script=Latin}\p{M}\p{N}\s'’`´.,\-/()&+]+$/u;
  const RE_PHONE = /^[+\d\s()/-]{5,}$/;

  function checkName(errors, path, value) {
    const v = value.trim();
    if (!v) errors[path] = 'err.required';
    else if (!RE_NAME.test(v)) errors[path] = 'err.latin';
  }

  function checkText(errors, path, value) {
    const v = value.trim();
    if (!v) errors[path] = 'err.required';
    else if (!RE_ADDRESS.test(v)) errors[path] = 'err.latin';
  }

  function checkDate(errors, path, b) {
    if (!b.d && !b.m && !b.y) { errors[path] = 'err.required'; return; }
    const dt = parseDate(b);
    if (!dt || dt.getFullYear() < 1900) errors[path] = 'err.date';
    else if (dt > new Date()) errors[path] = 'err.dateFuture';
  }

  const validators = {
    type: () => (state.type ? {} : { type: 'err.choose' }),
    residence: () => (state.residence ? {} : { residence: 'err.choose' }),
    benefits: () => (state.benefits.length || state.noBenefits ? {} : { benefits: 'err.choose' }),
    applicant: () => {
      const e = {};
      const a = state.applicant;
      checkName(e, 'applicant.firstName', a.firstName);
      checkName(e, 'applicant.lastName', a.lastName);
      checkDate(e, 'applicant.birth', a.birth);
      checkText(e, 'applicant.street', a.street);
      if (!a.zip.trim()) e['applicant.zip'] = 'err.required';
      else if (!/^\d{5}$/.test(a.zip.trim())) e['applicant.zip'] = 'err.zip';
      checkText(e, 'applicant.city', a.city);
      if (a.phone.trim() && !RE_PHONE.test(a.phone.trim())) e['applicant.phone'] = 'err.phone';
      return e;
    },
    household: () => {
      const e = {};
      if (state.hasPartner === null) e.hasPartner = 'err.choose';
      if (state.hasPartner) {
        checkName(e, 'partner.firstName', state.partner.firstName);
        checkName(e, 'partner.lastName', state.partner.lastName);
        checkDate(e, 'partner.birth', state.partner.birth);
      }
      state.children.forEach((c, i) => {
        checkName(e, `children.${i}.firstName`, c.firstName);
        checkName(e, `children.${i}.lastName`, c.lastName);
        checkDate(e, `children.${i}.birth`, c.birth);
      });
      if (state.residence === 'school' && !state.children.length) e.children = 'err.schoolChild';
      return e;
    },
    income: () => {
      const e = {};
      state.incomes.forEach((inc, i) => {
        if (!personColumn(inc.person)) e[`incomes.${i}.person`] = 'err.choose';
        if (!inc.type) e[`incomes.${i}.type`] = 'err.choose';
        const n = parseAmount(inc.amount);
        if (!inc.amount.trim()) e[`incomes.${i}.amount`] = 'err.required';
        else if (!Number.isFinite(n) || n <= 0) e[`incomes.${i}.amount`] = 'err.amount';
      });
      return e;
    },
  };

  const isValid = (step) => !validators[step] || Object.keys(validators[step]()).length === 0;
  const isComplete = (step) => !!state.visited[step] && isValid(step);

  // Erster Schritt, der noch fehlt (z. B. Einkommen, nachdem „keine Leistungen“ gewählt wurde)
  function firstIncompleteStep() {
    for (const s of flow()) {
      if (s === 'review' || s === 'done' || s === 'notEligible') return null;
      if (!isComplete(s)) return s;
    }
    return null;
  }

  function reachable(step) {
    if (step === 'language' || step === 'intro') return true;
    if (!state.lang) return false;
    const f = flow();
    const idx = f.indexOf(step);
    if (idx < 0) return false;
    if (step === 'done' && !state.pdfUrl) return false;
    return f.slice(0, idx).every(isComplete);
  }

  // ---------------------------------------------------------------------------
  // Navigation (mit Browser-Verlauf, damit die Zurück-Taste am Handy funktioniert)
  // ---------------------------------------------------------------------------

  function go(step, { replace = false } = {}) {
    state.step = step;
    state.errors = {};
    if (replace) history.replaceState({ step }, '');
    else history.pushState({ step }, '');
    render({ focus: true });
  }

  function next() {
    clearTimeout(autoAdvanceTimer);
    if (state.step === 'income') {
      // komplett leere Zeilen einfach weglassen
      state.incomes = state.incomes.filter((inc) => inc.type || inc.amount.trim());
    }
    const v = validators[state.step];
    if (v) {
      const errors = v();
      if (Object.keys(errors).length) {
        state.errors = errors;
        render({ focusError: true });
        return;
      }
    }
    const f = flow();
    if (state.editing && f.includes('review')) {
      const target = firstIncompleteStep();
      if (!target) state.editing = false;
      go(target || 'review');
      return;
    }
    go(f[f.indexOf(state.step) + 1]);
  }

  function back() {
    clearTimeout(autoAdvanceTimer);
    if (history.state && history.state.step && history.length > 1 && state.step !== 'language') {
      history.back();
      return;
    }
    const f = flow();
    const idx = f.indexOf(state.step);
    go(idx > 0 ? f[idx - 1] : 'language', { replace: true });
  }

  window.addEventListener('popstate', (ev) => {
    const target = ev.state && ev.state.step;
    if (!target) return;
    clearTimeout(autoAdvanceTimer);
    if (reachable(target)) state.step = target;
    else state.step = state.lang ? (firstIncompleteStep() || 'intro') : 'language';
    state.errors = {};
    render({ focus: true });
  });

  window.addEventListener('beforeunload', (ev) => {
    const hasData = state.applicant.firstName || state.applicant.lastName || state.type;
    if (hasData && state.step !== 'done') {
      ev.preventDefault();
      ev.returnValue = '';
    }
  });

  // ---------------------------------------------------------------------------
  // Bausteine für die Ansichten
  // ---------------------------------------------------------------------------

  const ICONS = {
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    'arrow-right': '<path d="M5 12h14M13 6l6 6-6 6"/>',
    'arrow-left': '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    help: '<circle cx="12" cy="12" r="9.5"/><path d="M9.3 9.3a2.8 2.8 0 0 1 5.5.9c0 1.9-2.8 2.3-2.8 4.1"/><circle cx="12" cy="17.4" r=".7" fill="currentColor"/>',
    globe: '<circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19M12 2.5c2.6 2.7 3.9 5.9 3.9 9.5s-1.3 6.8-3.9 9.5c-2.6-2.7-3.9-5.9-3.9-9.5S9.4 5.2 12 2.5z"/>',
    clock: '<circle cx="12" cy="12" r="9.5"/><path d="M12 7v5l3.5 2"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/>',
    info: '<circle cx="12" cy="12" r="9.5"/><path d="M12 11v6"/><circle cx="12" cy="7.7" r=".7" fill="currentColor"/>',
    alert: '<path d="M12 3.8l9 15.7H3z"/><path d="M12 10v4.3"/><circle cx="12" cy="17" r=".7" fill="currentColor"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
    open: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    phone: '<path d="M5.5 4h3.5l1.6 4.4-2.3 1.4a11 11 0 0 0 5.9 5.9l1.4-2.3L20 15v3.5a1.5 1.5 0 0 1-1.5 1.5A15.5 15.5 0 0 1 4 5.5 1.5 1.5 0 0 1 5.5 4z"/>',
    pin: '<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    mail: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/>',
    refresh: '<path d="M19.5 10.5A7.7 7.7 0 0 0 5.7 7.2L4 9M4 4.5V9h4.5M4.5 13.5a7.7 7.7 0 0 0 13.8 3.3L20 15m0 4.5V15h-4.5"/>',
    home: '<path d="M3.5 11L12 4l8.5 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>',
    school: '<path d="M2.5 9L12 4.5 21.5 9 12 13.5z"/><path d="M6.5 11v4.5c1.5 1.4 3.4 2.1 5.5 2.1s4-.7 5.5-2.1V11M21.5 9v5"/>',
    map: '<path d="M9 4.5L3.5 6.5v13L9 17.5l6 2 5.5-2v-13L15 6.5z"/><path d="M9 4.5v13M15 6.5v13"/>',
    sparkle: '<path d="M12 3.5l2.1 5.4 5.4 2.1-5.4 2.1L12 18.5l-2.1-5.4L4.5 11l5.4-2.1z"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9.3" r="2.5"/><path d="M16 14.5c2.4-.2 4.1 1.3 4.6 3.9"/>',
  };

  function icon(name, cls = '') {
    const flip = name === 'arrow-right' || name === 'arrow-left' ? ' flip' : '';
    return `<svg class="icon${flip}${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`;
  }

  function stepHead(titleKey, leadKey) {
    const qs = flow().filter((s) => !['intro', 'done', 'notEligible'].includes(s));
    const n = qs.indexOf(state.step) + 1;
    return `${n > 0 ? `<p class="eyebrow">${t('progress', { n, total: qs.length })}</p>` : ''}
      <h2 id="step-title" tabindex="-1">${t(titleKey)}</h2>
      ${leadKey ? `<p class="lead">${t(leadKey)}</p>` : ''}`;
  }

  function note(kind, html, iconName) {
    const ic = iconName || { info: 'info', success: 'check', warn: 'alert', error: 'alert' }[kind];
    return `<div class="note note-${kind}">${icon(ic)}<div>${html}</div></div>`;
  }

  function errorText(path) {
    const err = state.errors[path];
    return err ? `<p class="field-error" id="err-${path.replace(/\./g, '-')}">${icon('alert')}<span>${t(err)}</span></p>` : '';
  }

  function choices(key, options, extraClass = '') {
    return `<div class="choices ${extraClass}" role="group" aria-labelledby="${key === 'hasPartner' ? 'partner-q' : 'step-title'}">
      ${options.map((o) => {
        const sel = state[key] === o.state;
        return `<button type="button" class="choice${sel ? ' is-selected' : ''}" aria-pressed="${sel}"
            data-action="choose" data-key="${key}" data-value="${o.value}">
          ${o.icon ? `<span class="choice-icon">${icon(o.icon)}</span>` : ''}
          <span class="choice-text"><strong>${o.title}</strong>${o.desc ? `<small>${o.desc}</small>` : ''}</span>
          <span class="choice-mark">${icon('check')}</span>
        </button>`;
      }).join('')}
    </div>${errorText(key)}`;
  }

  function checkCard(value, title, desc, checked) {
    return `<label class="check${checked ? ' is-checked' : ''}">
      <input type="checkbox" class="sr-only" data-action="benefit" value="${value}"${checked ? ' checked' : ''}>
      <span class="check-box">${icon('check')}</span>
      <span class="check-text"><strong>${title}</strong>${desc ? `<small>${desc}</small>` : ''}</span>
    </label>`;
  }

  const fieldId = (path) => 'f-' + path.replace(/\./g, '-');

  function textField(path, label, o = {}) {
    const id = fieldId(path);
    const err = state.errors[path];
    const val = getPath(state, path) || '';
    const described = [o.hint ? id + '-hint' : '', err ? 'err-' + path.replace(/\./g, '-') : ''].filter(Boolean).join(' ');
    return `<div class="field${err ? ' has-error' : ''}${o.cls ? ' ' + o.cls : ''}">
      <label for="${id}">${label}${o.optional ? ` <span class="optional">(${t('field.optional')})</span>` : ''}</label>
      ${o.hint ? `<p class="hint" id="${id}-hint">${o.hint}</p>` : ''}
      <input id="${id}" type="${o.type || 'text'}" data-bind="${path}" value="${esc(val)}"
        autocomplete="${o.autocomplete || 'off'}"${o.inputmode ? ` inputmode="${o.inputmode}"` : ''}${o.maxlength ? ` maxlength="${o.maxlength}"` : ''}
        ${o.numeric ? 'data-numeric' : ''} dir="${o.ltr ? 'ltr' : 'auto'}" spellcheck="false"
        ${err ? 'aria-invalid="true"' : ''}${described ? ` aria-describedby="${described}"` : ''}>
      ${errorText(path)}
    </div>`;
  }

  function dateField(path, label, autocomplete) {
    const id = fieldId(path);
    const err = state.errors[path];
    const b = getPath(state, path);
    const errId = 'err-' + path.replace(/\./g, '-');
    const part = (k, len, lab, ac) => `<label class="date-part date-${k}">
        <span>${lab}</span>
        <input id="${id}-${k}" type="text" inputmode="numeric" maxlength="${len}" data-bind="${path}.${k}" data-numeric
          data-date-part="${k}" value="${esc(b[k])}" autocomplete="${autocomplete ? ac : 'off'}" dir="ltr"
          ${err ? `aria-invalid="true" aria-describedby="${errId}"` : ''}>
      </label>`;
    return `<fieldset class="field date-field${err ? ' has-error' : ''}" id="${id}">
      <legend>${label}</legend>
      <div class="date-inputs" dir="ltr">
        ${part('d', 2, t('date.day'), 'bday-day')}
        ${part('m', 2, t('date.month'), 'bday-month')}
        ${part('y', 4, t('date.year'), 'bday-year')}
      </div>
      ${errorText(path)}
    </fieldset>`;
  }

  function selectField(path, label, options, value) {
    const id = fieldId(path);
    const err = state.errors[path];
    return `<div class="field${err ? ' has-error' : ''}">
      <label for="${id}">${label}</label>
      <select id="${id}" data-bind="${path}"${err ? ` aria-invalid="true" aria-describedby="err-${path.replace(/\./g, '-')}"` : ''}>
        <option value="">${t('common.choose')}</option>
        ${options.map((o) => `<option value="${esc(o.value)}"${o.value === value ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}
      </select>
      ${errorText(path)}
    </div>`;
  }

  function moneyField(path, label) {
    const id = fieldId(path);
    const err = state.errors[path];
    return `<div class="field${err ? ' has-error' : ''}">
      <label for="${id}">${label}</label>
      <div class="money">
        <input id="${id}" type="text" inputmode="decimal" data-bind="${path}" data-numeric value="${esc(getPath(state, path))}"
          autocomplete="off" dir="ltr"${err ? ` aria-invalid="true" aria-describedby="err-${path.replace(/\./g, '-')}"` : ''}>
        <span class="unit" aria-hidden="true">€</span>
      </div>
      ${errorText(path)}
    </div>`;
  }

  // ---------------------------------------------------------------------------
  // Anlaufstellen
  // ---------------------------------------------------------------------------

  function officeCard(o) {
    const tel = '+49' + o.phone.replace(/^0/, '').replace(/\D/g, '');
    const mapUrl = 'https://www.openstreetmap.org/search?query=' + encodeURIComponent(`${o.street.replace(/–/g, '-')}, ${o.city}`);
    return `<div class="office">
      <h4>${esc(o.name)}</h4>
      <p>${esc(o.street)}<br>${esc(o.city)}</p>
      <p class="muted small">${t('office.stop')}: ${esc(o.stop)}</p>
      <dl class="hours">
        ${o.hours.map((h) => `<div><dt>${h.days.map((d) => t('day.' + d)).join(', ')}</dt>
          <dd dir="ltr">${h.times.split(' · ').map((x) => `<span class="nowrap">${esc(x)}</span>`).join(' · ')}</dd></div>`).join('')}
      </dl>
      <p class="muted small">${t('office.appointment')}</p>
      <div class="office-actions">
        <a class="btn btn-secondary" href="tel:${tel}">${icon('phone')}<span dir="ltr">${esc(o.phone)}</span></a>
        <a class="btn btn-ghost" href="${mapUrl}" target="_blank" rel="noopener">${icon('pin')}${t('office.map')}</a>
      </div>
    </div>`;
  }

  function officeResult() {
    if (!state.district) return '';
    if (state.district === '?') return `<p class="muted">${t('office.allIntro')}</p>${C.offices.map(officeCard).join('')}`;
    const d = C.districts.find((x) => x.name === state.district);
    if (!d) return '';
    const o = C.offices.find((x) => x.id === d.office);
    return officeCard(o) + (d.ortsverwaltung ? note('info', t('office.ortsverwaltung')) : '');
  }

  function officePicker(ctx) {
    const id = 'district-' + ctx;
    return `<div class="field">
        <label for="${id}">${t('office.district')}</label>
        <select id="${id}" data-action="district">
          <option value="">${t('common.choose')}</option>
          ${C.districts.map((x) => `<option value="${esc(x.name)}"${x.name === state.district ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}
          <option value="?"${state.district === '?' ? ' selected' : ''}>${t('office.unknown')}</option>
        </select>
      </div>
      <div class="office-result" aria-live="polite">${officeResult()}</div>`;
  }

  // ---------------------------------------------------------------------------
  // Ansichten (eine Funktion pro Schritt)
  // ---------------------------------------------------------------------------

  const views = {
    language() {
      return {
        html: `<div class="hero">
            <img src="logo.png" alt="Jusos Ulm – Solidarisch in Ulm" class="hero-logo" width="860" height="400">
            <h2 id="step-title" tabindex="-1" class="hero-title">LobbyCard &amp; KinderBonusCard</h2>
            <p class="hero-langs">Sprache wählen · Choose your language · Dil seçin · Оберіть мову · Выберите язык ·
              <span dir="rtl" lang="ar">اختر لغتك</span> · <span dir="rtl" lang="fa">زبان خود را انتخاب کنید</span></p>
          </div>
          <div class="lang-grid">
            ${LANGS.map((l) => `<button type="button" class="lang-btn" data-action="set-lang" data-lang="${l.code}" lang="${l.code}"${l.rtl ? ' dir="rtl"' : ''}>${esc(l.name)}</button>`).join('')}
          </div>`,
        next: null,
        back: false,
      };
    },

    intro() {
      const perks = [1, 2, 3, 4, 5, 6].map((n) => `<li>${icon('check')}<span>${t('intro.perk' + n)}</span></li>`).join('');
      return {
        html: `<h2 id="step-title" tabindex="-1">${t('intro.title')}</h2>
          <p class="lead">${t('intro.lead')}</p>
          <h3 class="perks-title">${t('intro.perksTitle')}</h3>
          <ul class="perks">${perks}</ul>
          <h3 class="sub-title">${t('intro.howTitle')}</h3>
          <ol class="how">
            <li><span class="how-num">1</span><span>${t('intro.how1')}</span></li>
            <li><span class="how-num">2</span><span>${t('intro.how2')}</span></li>
            <li><span class="how-num">3</span><span>${t('intro.how3')}</span></li>
          </ol>
          <ul class="facts">
            <li>${icon('clock')}<span>${t('intro.time')}</span></li>
            <li>${icon('lock')}<span>${t('intro.privacy')}</span></li>
            <li>${icon('help')}<span>${t('intro.helpHint')}</span></li>
          </ul>
          ${note('info', t('intro.disclaimer'))}`,
        next: { label: t('nav.start') },
      };
    },

    type() {
      return {
        html: `${stepHead('type.title')}
          ${choices('type', [
            { value: 'new', state: 'new', title: t('type.new'), desc: t('type.newDesc'), icon: 'sparkle' },
            { value: 'renewal', state: 'renewal', title: t('type.renewal'), desc: t('type.renewalDesc'), icon: 'refresh' },
          ])}
          ${note('info', t('type.help'))}`,
        next: { label: t('nav.next') },
      };
    },

    residence() {
      return {
        html: `${stepHead('residence.title')}
          ${choices('residence', [
            { value: 'ulm', state: 'ulm', title: t('residence.ulm'), icon: 'home' },
            { value: 'school', state: 'school', title: t('residence.school'), desc: t('residence.schoolDesc'), icon: 'school' },
            { value: 'other', state: 'other', title: t('residence.other'), icon: 'map' },
          ])}
          ${note('info', t('residence.help'))}`,
        next: { label: t('nav.next') },
      };
    },

    notEligible() {
      return {
        html: `<div class="result result-stop">
            <span class="result-icon">${icon('info')}</span>
            <h2 id="step-title" tabindex="-1">${t('notEligible.title')}</h2>
            <p>${t('notEligible.text')}</p>
          </div>
          ${note('info', t('notEligible.tip'))}`,
        next: null,
      };
    },

    benefits() {
      const form = formType();
      return {
        html: `${stepHead('benefits.title', 'benefits.lead')}
          <div class="checks">
            ${C.benefits.map((b) => checkCard(b.id, t('benefit.' + b.id), t('benefit.' + b.id + '.desc'), state.benefits.includes(b.id))).join('')}
            <div class="checks-sep"><span>${t('common.or')}</span></div>
            ${checkCard('none', t('benefits.none'), t('benefits.noneDesc'), state.noBenefits)}
          </div>
          ${errorText('benefits')}
          <div aria-live="polite">${form ? note('success', form === 'leistungen' ? t('benefits.resultWith') : t('benefits.resultWithout'), 'check') : ''}</div>
          ${note('info', t('benefits.help'))}`,
        next: { label: t('nav.next') },
      };
    },

    applicant() {
      const a = state.applicant;
      if (!a.city && state.residence === 'ulm') a.city = 'Ulm';
      return {
        html: `${stepHead('applicant.title', 'applicant.lead')}
          <div class="grid-2">
            ${textField('applicant.firstName', t('field.firstName'), { autocomplete: 'given-name' })}
            ${textField('applicant.lastName', t('field.lastName'), { autocomplete: 'family-name' })}
          </div>
          ${dateField('applicant.birth', t('field.birthDate'), true)}
          <div id="live-minor" aria-live="polite">${minorWarning()}</div>
          ${textField('applicant.street', t('field.street'), { autocomplete: 'street-address' })}
          <div class="grid-zip">
            ${textField('applicant.zip', t('field.zip'), { autocomplete: 'postal-code', inputmode: 'numeric', maxlength: 5, numeric: true, ltr: true })}
            ${textField('applicant.city', t('field.city'), { autocomplete: 'address-level2' })}
          </div>
          <div id="live-zip" aria-live="polite">${zipWarning()}</div>
          ${textField('applicant.phone', t('field.phone'), { type: 'tel', autocomplete: 'tel', optional: true, hint: t('field.phoneHint'), numeric: true, ltr: true })}`,
        next: { label: t('nav.next') },
      };
    },

    household() {
      const kids = state.children;
      return {
        html: `${stepHead('household.title', 'household.lead')}
          ${state.residence === 'school' ? note('info', t('household.schoolNote')) : ''}
          <section class="block">
            <h3 class="block-title" id="partner-q">${t('household.partnerQ')}</h3>
            ${choices('hasPartner', [
              { value: 'yes', state: true, title: t('common.yes') },
              { value: 'no', state: false, title: t('common.no') },
            ], 'choices-inline')}
            ${state.hasPartner ? `<div class="person-card">
                <h4>${t('household.partner')}</h4>
                <div class="grid-2">
                  ${textField('partner.firstName', t('field.firstName'))}
                  ${textField('partner.lastName', t('field.lastName'))}
                </div>
                ${dateField('partner.birth', t('field.birthDate'))}
              </div>` : ''}
          </section>
          <section class="block">
            <h3 class="block-title">${t('household.children')}</h3>
            ${kids.length ? kids.map(childCard).join('') : `<p class="muted">${t('household.noChildren')}</p>`}
            ${errorText('children')}
            ${kids.length < C.maxChildren
              ? `<button type="button" class="btn btn-secondary btn-add" data-action="add-child">${icon('plus')}<span>${t('household.addChild')}</span></button>`
              : `<p class="muted">${t('household.maxChildren')}</p>`}
          </section>
          <div id="live-bafoeg">${bafoegWarning()}</div>`,
        next: { label: t('nav.next') },
      };
    },

    income() {
      if (!state.incomes.length) state.incomes.push({ person: 'applicant', type: '', amount: '' });
      const persons = incomePersons();
      return {
        html: `${stepHead('income.title', 'income.lead')}
          ${note('info', `<ul class="tips"><li>${t('income.tip1')}</li><li>${t('income.tip2')}</li><li>${t('income.tip3')}</li></ul>`, 'info')}
          <div class="income-list">${state.incomes.map((inc, i) => incomeRow(inc, i, persons)).join('')}</div>
          <button type="button" class="btn btn-secondary btn-add" data-action="add-income">${icon('plus')}<span>${t('income.add')}</span></button>
          ${state.children.length > C.incomeColumns - 2 ? note('warn', t('income.child5')) : ''}
          <div id="live-income" aria-live="polite">${incomeSummaryHtml()}</div>`,
        next: { label: t('nav.next') },
      };
    },

    review() {
      const form = formType();
      const a = state.applicant;
      const dash = '–';
      const sections = [];
      sections.push(reviewSection(t('review.application'), 'type', [
        [t('review.type'), state.type === 'new' ? t('review.typeNew') : t('review.typeRenewal')],
        [t('review.form'), form === 'leistungen' ? t('review.formWith') : t('review.formWithout')],
      ]));
      sections.push(reviewSection(t('review.benefits'), 'benefits', [
        [t('review.benefits'), state.benefits.length ? state.benefits.map((id) => t('benefit.' + id)).join('<br>') : t('review.noBenefits')],
      ]));
      sections.push(reviewSection(t('review.you'), 'applicant', [
        [t('field.name'), esc(formName(a))],
        [t('field.birthDate'), esc(fmtDate(a.birth))],
        [t('field.address'), `${esc(a.street)}<br>${esc(a.zip)} ${esc(a.city)}`],
        [t('field.phone'), a.phone.trim() ? `<span dir="ltr">${esc(a.phone)}</span>` : dash],
      ]));
      const hhRows = [[t('household.partner'), state.hasPartner ? `${esc(formName(state.partner))}<br><span class="muted">${esc(fmtDate(state.partner.birth))}</span>` : dash]];
      state.children.forEach((c, i) => hhRows.push([t('household.child', { n: i + 1 }), `${esc(formName(c))}<br><span class="muted">${esc(fmtDate(c.birth))}</span>`]));
      if (!state.children.length) hhRows.push([t('household.children'), dash]);
      sections.push(reviewSection(t('review.household'), 'household', hhRows));
      if (form === 'einkommen') {
        const s = incomeSummary();
        const persons = incomePersons();
        const rows = state.incomes.map((inc) => {
          const p = persons.find((x) => x.id === inc.person);
          return [`${esc(p ? p.label : '?')}: ${t('inc.' + inc.type)}`, `<span dir="ltr">${fmtEuro(parseAmount(inc.amount))}</span>`];
        });
        if (!rows.length) rows.push([t('review.income'), t('review.noIncome')]);
        rows.push([`<strong>${t('income.total')}</strong>`, `<strong dir="ltr">${fmtEuro(s.total)}</strong>`]);
        rows.push([t('income.limit'), `<span dir="ltr">${fmtEuro(s.limit)}</span>`]);
        sections.push(reviewSection(t('review.income'), 'income', rows));
      }
      return {
        html: `${stepHead('review.title', 'review.lead')}
          ${sections.join('')}
          ${state.errors.create ? note('error', t(state.errors.create)) : ''}`,
        next: { label: t('nav.create'), action: 'create', icon: 'download' },
      };
    },

    done() {
      const form = formType();
      return {
        html: `<div class="result result-ok">
            <span class="result-icon">${icon('check')}</span>
            <h2 id="step-title" tabindex="-1">${t('done.title')}</h2>
            <p>${t('done.lead')}</p>
          </div>
          <div class="download-actions">
            <a class="btn btn-primary btn-lg" href="${state.pdfUrl}" download="${esc(state.pdfName)}">${icon('download')}<span>${t('done.download')}</span></a>
            <a class="btn btn-secondary btn-lg" href="${state.pdfUrl}" target="_blank" rel="noopener">${icon('open')}<span>${t('done.open')}</span></a>
          </div>
          <h3 class="sub-title">${t('done.nextTitle')}</h3>
          <ol class="todo">
            ${todo(1, t('done.printTitle'), `<p>${t('done.printText')}</p><p class="muted">${t('done.noPrinter')}</p>`)}
            ${todo(2, t('done.signTitle'), `<p>${t(C.forms[form].signPage === 1 ? 'done.signPage1' : 'done.signPage2')}</p>`)}
            ${todo(3, t('done.docsTitle'), docsList())}
            ${todo(4, t('done.submitTitle'), submitHtml())}
          </ol>
          ${note('info', t('done.closeNote'), 'lock')}
          <div class="restart"><button type="button" class="btn btn-ghost" data-action="restart">${icon('refresh')}<span>${t('done.restart')}</span></button></div>`,
        next: null,
      };
    },
  };

  function reviewSection(title, step, rows) {
    return `<section class="review-section">
      <div class="review-head">
        <h3>${title}</h3>
        <button type="button" class="link-btn" data-action="edit" data-step="${step}">${icon('edit')}<span>${t('review.edit')}</span></button>
      </div>
      <dl>${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
    </section>`;
  }

  function childCard(c, i) {
    return `<div class="person-card">
      <div class="person-card-head">
        <h4>${t('household.child', { n: i + 1 })}</h4>
        <button type="button" class="link-btn link-btn-danger" data-action="remove-child" data-index="${i}">${icon('trash')}<span>${t('common.remove')}</span></button>
      </div>
      <div class="grid-2">
        ${textField(`children.${i}.firstName`, t('field.firstName'))}
        ${textField(`children.${i}.lastName`, t('field.lastName'))}
      </div>
      ${dateField(`children.${i}.birth`, t('field.birthDate'))}
      <p class="badge-line" id="live-child-${i}" aria-live="polite">${childBadge(c)}</p>
    </div>`;
  }

  function childBadge(c) {
    const age = ageOf(c.birth);
    if (age === null) return '';
    if (age < C.ages.kinderBonusMin) return `<span class="badge">${t('badge.under4')}</span>`;
    if (age <= C.ages.kinderBonusMax) return `<span class="badge badge-green">${t('badge.kinderBonus')}</span>`;
    return `<span class="badge badge-blue">${t('badge.adult')}</span>`;
  }

  function minorWarning() {
    const age = ageOf(state.applicant.birth);
    return age !== null && age < C.ages.lobbyCardMin ? note('warn', t('applicant.minor')) : '';
  }

  function zipWarning() {
    const zip = state.applicant.zip.trim();
    if (state.residence !== 'ulm' || !/^\d{5}$/.test(zip) || C.ulmZips.includes(zip)) return '';
    return note('warn', t('applicant.zipNotUlm'));
  }

  function bafoegWarning() {
    const onlyBafoeg = state.benefits.length === 1 && state.benefits[0] === 'bafoeg';
    const notAlone = state.hasPartner === true || state.children.length > 0;
    if (!onlyBafoeg || !notAlone) return '';
    return note('warn', `<p>${t('household.bafoegWarn')}</p>
      <button type="button" class="btn btn-secondary" data-action="bafoeg-switch">${t('household.bafoegSwitch')}</button>`);
  }

  function incomeRow(inc, i, persons) {
    return `<div class="income-row">
      <div class="income-row-head">
        <span class="income-row-num">${t('income.entry', { n: i + 1 })}</span>
        <button type="button" class="link-btn link-btn-danger" data-action="remove-income" data-index="${i}">${icon('trash')}<span>${t('common.remove')}</span></button>
      </div>
      <div class="grid-income">
        ${selectField(`incomes.${i}.person`, t('income.person'), persons.map((p) => ({ value: p.id, label: p.label })), inc.person)}
        ${selectField(`incomes.${i}.type`, t('income.type'), C.incomeTypes.map((n) => ({ value: String(n), label: tText('inc.' + n) })), inc.type)}
        ${moneyField(`incomes.${i}.amount`, t('income.amount'))}
      </div>
    </div>`;
  }

  function incomeSummaryHtml() {
    const s = incomeSummary();
    let verdict;
    if (s.total === 0) verdict = note('info', t('income.zero'));
    else if (s.total <= s.limit) verdict = note('success', t('income.under'));
    else verdict = note('warn', t('income.over', { diff: fmtEuro(s.total - s.limit) }));
    return `<div class="summary">
        <div class="summary-row"><span>${t('income.total')}</span><strong dir="ltr">${fmtEuro(s.total)}</strong></div>
        <div class="summary-row"><span>${t('income.limit')}<small>${t('hh.' + s.hh.type, { n: s.hh.persons })}</small></span><strong dir="ltr">${fmtEuro(s.limit)}</strong></div>
      </div>
      ${verdict}`;
  }

  function todo(n, title, body) {
    return `<li><span class="todo-num">${n}</span><div class="todo-body"><h4>${title}</h4>${body}</div></li>`;
  }

  function docsList() {
    const items = [];
    if (state.type === 'new') items.push(t('docs.id'));
    if (formType() === 'leistungen') {
      items.push(t('docs.bescheid') + `<ul>${state.benefits.map((id) => `<li>${t('benefit.' + id)}</li>`).join('')}</ul>`);
    } else {
      const types = [...new Set(state.incomes.map((i) => Number(i.type)).filter(Boolean))].sort((x, y) => x - y);
      items.push(t('docs.income') + (types.length ? `<ul>${types.map((n) => `<li>${t('docs.inc' + n)}</li>`).join('')}</ul>` : ''));
    }
    const kids = kinderBonusKids();
    if (kids.length) items.push(t('docs.photo', { names: kids.map((c) => c.firstName.trim()).join(', ') }));
    if (state.residence === 'school') items.push(t('docs.school'));
    return `<ul class="checklist">${items.map((i) => `<li>${icon('check')}<div>${i}</div></li>`).join('')}</ul>`;
  }

  function submitHtml() {
    const parts = [];
    if (state.benefits.includes('asyl')) parts.push(note('info', t('done.asyl')));
    if (state.type === 'renewal') {
      parts.push(`<p>${t('done.submitRenewal', { email: C.email })}</p>`);
      parts.push(`<p><a class="btn btn-secondary" href="${esc(mailtoHref())}">${icon('mail')}<span>${t('done.mailButton')}</span></a></p>`);
      parts.push(`<p class="muted small">${t('done.mailNote')}</p>`);
      parts.push(`<p>${t('done.submitRenewalOffice')}</p>`);
    } else {
      parts.push(`<p>${t('done.submitNew')}</p>`);
    }
    parts.push(`<div class="office-box">${officePicker('done')}</div>`);
    return parts.join('');
  }

  // Die E-Mail an die Stadt ist immer auf Deutsch
  function mailtoHref() {
    const a = state.applicant;
    const name = fullName(a);
    const subject = `Verlängerung LobbyCard/KinderBonusCard – ${name}`;
    const body = [
      'Guten Tag,',
      '',
      'anbei sende ich Ihnen meinen unterschriebenen Antrag auf Verlängerung der LobbyCard/KinderBonusCard und die Nachweise.',
      '',
      `Name: ${name}`,
      `Geburtsdatum: ${fmtDate(a.birth)}`,
      `Anschrift: ${a.street.trim()}, ${a.zip.trim()} ${a.city.trim()}`,
      '',
      'Mit freundlichen Grüßen',
      name,
    ].join('\n');
    return `mailto:${C.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  // ---------------------------------------------------------------------------
  // Hilfe-Fenster
  // ---------------------------------------------------------------------------

  function helpHtml() {
    const L = C.incomeLimit;
    const faq = [1, 2, 3, 4, 5, 6, 7].map((n) => {
      const vars = n === 4 ? {
        single: fmtWholeEuro(L.base), couple: fmtWholeEuro(L.base + L.perPerson14),
        child: fmtWholeEuro(L.perChildUnder14), adult: fmtWholeEuro(L.perPerson14),
      } : n === 5 ? { email: C.email } : undefined;
      return `<details class="faq"><summary>${t('faq.q' + n)}</summary><div>${t('faq.a' + n, vars)}</div></details>`;
    }).join('');
    return `<section class="help-section">
        <h3>${t('help.personalTitle')}</h3>
        <p>${t('help.personalText')}</p>
        ${officePicker('help')}
      </section>
      <section class="help-section">
        <h3>${t('help.mailTitle')}</h3>
        <p>${t('help.mailText')}</p>
        <a class="btn btn-secondary" href="mailto:${C.email}">${icon('mail')}<span dir="ltr">${C.email}</span></a>
      </section>
      <section class="help-section">
        <h3>${t('help.faqTitle')}</h3>
        ${faq}
      </section>
      <p class="muted small help-foot">${t('help.disclaimer', { stand: C.stand })}
        <a href="${C.officialUrl}" target="_blank" rel="noopener">${t('help.official')}</a></p>`;
  }

  function openHelp() {
    const dlg = document.getElementById('help-dialog');
    document.getElementById('help-title').textContent = tText('help.title');
    document.getElementById('help-close').setAttribute('aria-label', tText('common.close'));
    document.getElementById('help-body').innerHTML = helpHtml();
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }

  function closeHelp() {
    const dlg = document.getElementById('help-dialog');
    if (typeof dlg.close === 'function') dlg.close();
    else dlg.removeAttribute('open');
  }

  // ---------------------------------------------------------------------------
  // Darstellung
  // ---------------------------------------------------------------------------

  const stepEl = () => document.getElementById('step');

  function focusSelector(el) {
    if (!el || el === document.body || !stepEl().contains(el)) return null;
    if (el.id) return '#' + CSS.escape(el.id);
    const a = el.dataset.action;
    if (!a) return null;
    if (el.dataset.value) return `[data-action="${a}"][data-key="${el.dataset.key}"][data-value="${CSS.escape(el.dataset.value)}"]`;
    if (el.value) return `[data-action="${a}"][value="${CSS.escape(el.value)}"]`;
    return `[data-action="${a}"]`;
  }

  function render(opts = {}) {
    const keep = opts.keepFocus ? focusSelector(document.activeElement) : null;
    const html = document.documentElement;
    html.lang = state.lang || 'de';
    html.dir = isRtl() ? 'rtl' : 'ltr';
    document.title = tText('meta.title');

    // Kopfzeile
    document.getElementById('brand-title').textContent = tText('header.title');
    document.getElementById('help-label').textContent = tText('header.help');
    const picker = document.getElementById('lang-picker');
    picker.hidden = state.step === 'language';
    const sel = document.getElementById('lang-select');
    sel.value = state.lang || 'de';
    sel.setAttribute('aria-label', tText('header.language'));

    // Schritt
    state.visited[state.step] = true;
    const view = views[state.step]();
    const el = stepEl();
    el.innerHTML = view.html;
    el.classList.remove('step-enter');
    if (opts.focus) { void el.offsetWidth; el.classList.add('step-enter'); }

    // Navigation
    const backBtn = document.getElementById('btn-back');
    const nextBtn = document.getElementById('btn-next');
    const showBack = view.back !== false && state.step !== 'language';
    backBtn.hidden = !showBack;
    backBtn.innerHTML = `${icon('arrow-left')}<span>${t('nav.back')}</span>`;
    if (view.next) {
      nextBtn.hidden = false;
      nextBtn.disabled = false;
      nextBtn.dataset.action = view.next.action || 'next';
      nextBtn.innerHTML = `<span>${view.next.label}</span>${icon(view.next.icon || 'arrow-right')}`;
    } else {
      nextBtn.hidden = true;
    }
    document.getElementById('step-nav').hidden = !showBack && !view.next;

    // Fortschritt
    const f = flow();
    const idx = state.step === 'language' ? 0 : f.indexOf(state.step) + 1;
    const pct = state.step === 'done' ? 100 : Math.round((idx / f.length) * 100);
    document.getElementById('progress-bar').style.width = pct + '%';

    renderFooter();

    if (opts.focus) {
      window.scrollTo(0, 0);
      const h = el.querySelector('h2');
      if (h) h.focus({ preventScroll: true });
    }
    if (opts.focusError) focusFirstError();
    if (keep) {
      const target = el.querySelector(keep);
      if (target) target.focus({ preventScroll: true });
    }
    if (state.step === 'review') preloadPdfTools();
  }

  function renderFooter() {
    const links = [];
    if (C.impressumUrl) links.push(`<a href="${esc(C.impressumUrl)}" target="_blank" rel="noopener">${t('footer.impressum')}</a>`);
    if (C.datenschutzUrl) links.push(`<a href="${esc(C.datenschutzUrl)}" target="_blank" rel="noopener">${t('footer.privacy')}</a>`);
    document.getElementById('footer').innerHTML = `
      <p class="footer-privacy">${icon('lock')}<span>${t('footer.local')}</span></p>
      <p>${t('footer.by')}${links.length ? ' · ' + links.join(' · ') : ''}</p>`;
  }

  function focusFirstError() {
    const first = stepEl().querySelector('[aria-invalid="true"], .has-error input, .has-error select, .field-error');
    if (!first) return;
    const target = first.matches('input, select') ? first : (first.closest('.field, .block') || first).querySelector('input, select, button') || first;
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (target.focus) target.focus({ preventScroll: true });
  }

  // Live-Hinweise aktualisieren, ohne das Formular neu aufzubauen (Fokus bleibt erhalten)
  function updateLive() {
    const set = (id, html) => { const el = document.getElementById(id); if (el && el.innerHTML !== html) el.innerHTML = html; };
    if (state.step === 'applicant') {
      set('live-minor', minorWarning());
      set('live-zip', zipWarning());
    } else if (state.step === 'household') {
      state.children.forEach((c, i) => set('live-child-' + i, childBadge(c)));
    } else if (state.step === 'income') {
      set('live-income', incomeSummaryHtml());
    }
  }

  function clearError(path, el) {
    let changed = false;
    for (const key of Object.keys(state.errors)) {
      if (path === key || path.startsWith(key + '.')) { delete state.errors[key]; changed = true; }
    }
    if (!changed || !el) return;
    const box = el.closest('.field');
    if (!box) return;
    box.classList.remove('has-error');
    box.querySelectorAll('.field-error').forEach((n) => n.remove());
    box.querySelectorAll('[aria-invalid]').forEach((n) => { n.removeAttribute('aria-invalid'); n.removeAttribute('aria-describedby'); });
  }

  // ---------------------------------------------------------------------------
  // Aktionen und Eingaben
  // ---------------------------------------------------------------------------

  const actions = {
    'set-lang'(el) {
      state.lang = el.dataset.lang;
      go('intro');
    },
    next() { next(); },
    back() { back(); },
    choose(el) {
      const key = el.dataset.key;
      const raw = el.dataset.value;
      const value = key === 'hasPartner' ? raw === 'yes' : raw;
      state[key] = value;
      delete state.errors[key];
      render({ keepFocus: true });
      if (key === 'type' || key === 'residence') {
        const stepAtClick = state.step;
        clearTimeout(autoAdvanceTimer);
        autoAdvanceTimer = setTimeout(() => { if (state.step === stepAtClick) next(); }, 280);
      }
    },
    'add-child'() {
      state.children.push({ firstName: '', lastName: state.applicant.lastName.trim(), birth: emptyDate() });
      delete state.errors.children;
      render();
      const input = document.getElementById(fieldId(`children.${state.children.length - 1}.firstName`));
      if (input) { input.focus(); input.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    },
    'remove-child'(el) {
      const i = Number(el.dataset.index);
      state.children.splice(i, 1);
      // Einkommen dieses Kindes entfernen, spätere Kinder rücken nach
      state.incomes = state.incomes
        .filter((inc) => inc.person !== 'child' + i)
        .map((inc) => {
          const m = /^child(\d)$/.exec(inc.person);
          return m && Number(m[1]) > i ? { ...inc, person: 'child' + (Number(m[1]) - 1) } : inc;
        });
      state.errors = {};
      render();
    },
    'add-income'() {
      state.incomes.push({ person: 'applicant', type: '', amount: '' });
      render();
      const sel = document.getElementById(fieldId(`incomes.${state.incomes.length - 1}.type`));
      if (sel) { sel.focus(); sel.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    },
    'remove-income'(el) {
      state.incomes.splice(Number(el.dataset.index), 1);
      state.errors = {};
      render();
    },
    'bafoeg-switch'() {
      state.benefits = [];
      state.noBenefits = true;
      render();
    },
    edit(el) {
      state.editing = true;
      go(el.dataset.step);
    },
    create(el) { createPdf(el); },
    restart() {
      if (!window.confirm(tText('done.restartConfirm'))) return;
      if (state.pdfUrl) URL.revokeObjectURL(state.pdfUrl);
      state = freshState(state.lang);
      go('intro');
    },
    'open-help'() { openHelp(); },
    'close-help'() { closeHelp(); },
  };

  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-action]');
    if (!el || el.tagName === 'INPUT' || el.tagName === 'SELECT') return;
    const fn = actions[el.dataset.action];
    if (fn) {
      ev.preventDefault();
      fn(el);
    }
  });

  document.addEventListener('input', (ev) => {
    const el = ev.target;
    const path = el.dataset && el.dataset.bind;
    if (!path || el.tagName === 'SELECT') return;
    let value = el.value;
    if (el.hasAttribute('data-numeric')) {
      const norm = normalizeDigits(value);
      if (norm !== value) { el.value = norm; value = norm; }
    }
    setPath(state, path, value);
    clearError(path, el);
    const part = el.dataset.datePart;
    if ((part === 'd' || part === 'm') && /^\d{2}$/.test(value)) {
      const inputs = el.closest('.date-inputs').querySelectorAll('input');
      const nextInput = inputs[part === 'd' ? 1 : 2];
      if (nextInput && !nextInput.value) nextInput.focus();
    }
    updateLive();
  });

  document.addEventListener('change', (ev) => {
    const el = ev.target;
    if (el.id === 'lang-select') {
      state.lang = el.value;
      render();
      el.focus();
      return;
    }
    if (el.dataset.action === 'benefit') {
      const v = el.value;
      if (v === 'none') {
        state.noBenefits = el.checked;
        if (el.checked) state.benefits = [];
      } else {
        const set = new Set(state.benefits);
        if (el.checked) { set.add(v); state.noBenefits = false; } else set.delete(v);
        state.benefits = C.benefits.map((b) => b.id).filter((id) => set.has(id));
      }
      delete state.errors.benefits;
      render({ keepFocus: true });
      return;
    }
    if (el.dataset.action === 'district') {
      state.district = el.value;
      document.querySelectorAll('select[data-action="district"]').forEach((s) => { s.value = el.value; });
      document.querySelectorAll('.office-result').forEach((box) => { box.innerHTML = officeResult(); });
      return;
    }
    if (el.tagName === 'SELECT' && el.dataset.bind) {
      setPath(state, el.dataset.bind, el.value);
      clearError(el.dataset.bind, el);
      updateLive();
    }
  });

  // Klick auf den dunklen Hintergrund schließt das Hilfe-Fenster
  document.getElementById('help-dialog').addEventListener('click', (ev) => {
    if (ev.target.id === 'help-dialog') closeHelp();
  });

  // ---------------------------------------------------------------------------
  // PDF erstellen (pdf-lib wird erst jetzt geladen)
  // ---------------------------------------------------------------------------

  let vendorPromise = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Konnte nicht geladen werden: ' + src));
      document.head.appendChild(s);
    });
  }

  function loadVendor() {
    if (!vendorPromise) {
      vendorPromise = loadScript(C.vendor.pdfLib)
        .then(() => loadScript(C.vendor.fontkit))
        .catch((e) => { vendorPromise = null; throw e; });
    }
    return vendorPromise;
  }

  const bytesCache = {};

  function fetchBytes(url) {
    if (!bytesCache[url]) {
      bytesCache[url] = fetch(url)
        .then((res) => {
          if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
          return res.arrayBuffer();
        })
        .catch((e) => { delete bytesCache[url]; throw e; });
    }
    return bytesCache[url];
  }

  // Auf der Übersichtsseite schon im Hintergrund laden, damit „Antrag erstellen“ schnell geht
  function preloadPdfTools() {
    const form = formType();
    if (!form) return;
    Promise.all([loadVendor(), fetchBytes(C.forms[form].file), fetchBytes(C.vendor.font)]).catch(() => {});
  }

  async function buildPdf() {
    const form = formType();
    const [, pdfBytes, fontBytes] = await Promise.all([loadVendor(), fetchBytes(C.forms[form].file), fetchBytes(C.vendor.font)]);
    const { PDFDocument, PDFName, PDFDict, PDFCheckBox, PDFRadioGroup, TextAlignment } = window.PDFLib;
    const F = C.pdfFields;

    const doc = await PDFDocument.load(pdfBytes);
    doc.registerFontkit(window.fontkit);
    // Ganze Schrift einbetten: Teilmengen (subset) verlieren in pdf-lib Zeichen in Formularfeldern
    const font = await doc.embedFont(fontBytes, { subset: false });
    const pdfForm = doc.getForm();

    for (const field of pdfForm.getFields()) {
      if (F.portalFields.includes(field.getName())) pdfForm.removeField(field);
    }

    const setText = (name, value, { size = 10, align } = {}) => {
      const field = pdfForm.getTextField(name);
      field.setText(value || '');
      if (!value) return;
      const width = field.acroField.getWidgets()[0].getRectangle().width - 4;
      let s = size;
      while (s > 6 && font.widthOfTextAtSize(value, s) > width) s -= 0.5;
      field.setFontSize(s);
      if (align !== undefined) field.setAlignment(align);
    };

    const a = state.applicant;
    setText(F.applicantName, formName(a));
    setText(F.applicantBirth, fmtDate(a.birth));
    setText(F.address, `${a.street.trim()}, ${a.zip.trim()} ${a.city.trim()}`);
    setText(F.phone, a.phone.trim());
    if (state.hasPartner) {
      setText(F.partnerName, formName(state.partner));
      setText(F.partnerBirth, fmtDate(state.partner.birth));
    }
    state.children.slice(0, C.maxChildren).forEach((c, i) => {
      setText(F.childNames[i], formName(c));
      setText(F.childBirths[i], fmtDate(c.birth));
    });

    // Erstantrag / Verlängerung – nach Namen auswählen, die Reihenfolge ist in beiden PDFs verschieden
    const radio = pdfForm.getRadioGroup(C.forms[form].typeRadio);
    const wanted = state.type === 'new' ? /^erst/i : /^verl/i;
    const option = radio.getOptions().find((o) => wanted.test(o));
    if (!option) throw new Error('Antragsart nicht im PDF gefunden');
    radio.select(option);

    if (form === 'leistungen') {
      for (const b of C.benefits) {
        if (state.benefits.includes(b.id)) pdfForm.getCheckBox(b.pdfField).check();
      }
    } else {
      const s = incomeSummary();
      const right = TextAlignment.Right;
      for (const [key, amount] of Object.entries(s.cells)) {
        const [col, row] = key.split('-');
        setText(F.incomeCell.replace('{person}', col).replace('{row}', row), fmtMoney(amount), { size: 9, align: right });
      }
      const cols = presentColumns();
      for (let col = 1; col <= C.incomeColumns; col++) {
        const name = F.personTotal.replace('{person}', col);
        setText(name, cols.includes(col) ? fmtMoney(s.perPerson[col] || 0) : '', { size: 9, align: right });
      }
      setText(F.total, fmtMoney(s.total));
      setText(F.limit, fmtMoney(s.limit));
      setText(F.difference, fmtMoney(s.limit - s.total));
      const dropdown = pdfForm.getDropdown(F.householdType);
      dropdown.select(C.householdTypes[s.hh.type]);
      dropdown.setFontSize(9);
    }

    // Kästchen ohne „Aus“-Ansicht ergänzen, sonst kann das Formular nicht fest gespeichert werden
    for (const field of pdfForm.getFields()) {
      if (!(field instanceof PDFCheckBox || field instanceof PDFRadioGroup)) continue;
      for (const widget of field.acroField.getWidgets()) {
        const ap = widget.dict.lookup(PDFName.of('AP'));
        const normal = ap instanceof PDFDict ? ap.lookup(PDFName.of('N')) : null;
        if (normal instanceof PDFDict && !normal.has(PDFName.of('Off'))) {
          const r = widget.getRectangle();
          normal.set(PDFName.of('Off'), doc.context.register(doc.context.formXObject([], { BBox: [0, 0, r.width, r.height] })));
        }
      }
    }

    pdfForm.updateFieldAppearances(font);
    pdfForm.flatten({ updateFieldAppearances: false });
    doc.setTitle('Antrag auf LobbyCard und KinderBonusCard');
    doc.setLanguage('de-DE');
    doc.setCreator('LobbyCard-Assistent der Jusos Ulm');
    return doc.save();
  }

  function pdfFileName() {
    const clean = (s) => s.trim().replace(/ß/g, 'ss').replace(/ı/g, 'i').normalize('NFKD')
      .replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const name = [clean(state.applicant.lastName), clean(state.applicant.firstName)].filter(Boolean).join('_');
    return `LobbyCard-Antrag${name ? '_' + name : ''}.pdf`;
  }

  async function createPdf(btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner" aria-hidden="true"></span><span>${t('review.creating')}</span>`;
    try {
      const bytes = await buildPdf();
      if (state.pdfUrl) URL.revokeObjectURL(state.pdfUrl);
      state.pdfUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      state.pdfName = pdfFileName();
      const link = document.createElement('a');
      link.href = state.pdfUrl;
      link.download = state.pdfName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      state.editing = false;
      go('done');
    } catch (err) {
      console.error('PDF-Erstellung fehlgeschlagen:', err);
      state.errors = { create: location.protocol === 'file:' ? 'err.fileProtocol' : 'err.create' };
      render();
      const box = stepEl().querySelector('.note-error');
      if (box) box.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  // ---------------------------------------------------------------------------
  // Start
  // ---------------------------------------------------------------------------

  function init() {
    const sel = document.getElementById('lang-select');
    sel.innerHTML = LANGS.map((l) => `<option value="${l.code}" lang="${l.code}">${esc(l.name)}</option>`).join('');
    history.replaceState({ step: 'language' }, '');
    render();
  }

  init();
})();
