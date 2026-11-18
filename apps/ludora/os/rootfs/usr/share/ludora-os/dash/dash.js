/* Ludora OS staff dashboard.
 *
 * Rules this file keeps (the server's Content-Security-Policy enforces most of them):
 *  - The page is built with createElement and textContent only. Event texts, log lines, names and
 *    addresses are chosen by attackers, so nothing from the server is ever parsed as markup.
 *  - No inline styles and no style strings: state is a class or a data attribute, and dash.css moves things.
 *  - Passwords, codes and tokens are sent once and then cleared. Nothing secret is kept in
 *    localStorage or sessionStorage. Only "shortcuts off" (local), and for this tab "why you were signed
 *    out", "the address the server is moving to" and "last change already dismissed" (session) live there.
 *  - Every request is same-origin fetch; every POST carries X-Ludora-Dash and a JSON body.
 *  - A 401 from any call throws the page away and returns to sign-in.
 */
(function () {
  'use strict';

  var POLL_MS = 5000;
  var ACTION_TIMEOUT_MS = 150000;
  var VIEWS = ['overview', 'security', 'setup', 'health', 'logs'];
  var VIEW_NAMES = { overview: 'Overview', security: 'Security', setup: 'Setup', health: 'Health', logs: 'Logs' };

  var THREAT = [
    { word: 'Calm', badge: 'calm' },
    { word: 'Watchful', badge: 'watchful' },
    { word: 'Under attack', badge: 'under attack' }
  ];

  var SERVICES = {
    'database': 'Database',
    'app': 'Ludora, the game site',
    'proxy': 'Secure connection (HTTPS)',
    'sentinel': 'Sentinel, the guard',
    'firewall': 'Firewall',
    'ssh': 'Remote access (SSH)',
    'usb guard': 'USB guard',
    'auditing': 'Audit record'
  };

  var SEVERITY = {
    info: { rank: 0, label: '· info' },
    notice: { rank: 1, label: '› notice' },
    warning: { rank: 2, label: '▲ warning' },
    alert: { rank: 3, label: '■ alert' }
  };

  var LISTS = [
    { id: 'security', key: 'ALERT_SECURITY_TO', title: 'Security', gets: 'Attacks: bans, floods, password guessing, a device pretending to be the gateway, lockdown, support access opened.' },
    { id: 'upkeep', key: 'ALERT_UPKEEP_TO', title: 'Upkeep', gets: 'The server needs care: a backup or an update failed, or a protection stopped passing the self-check.' },
    { id: 'cheat', key: 'ALERT_CHEAT_TO', title: 'Fair play', gets: 'Ludora saw play that a person at the ordinary game screen could not produce. It is a signal, not proof.' }
  ];

  var MORE_KEYS = ['OPERATOR_NAME', 'OPERATOR_CONTACT', 'ALERT_QUIET_MINUTES', 'NTFY_SERVER'];
  var MORE_LABELS = {
    OPERATOR_NAME: 'Who runs this server',
    OPERATOR_CONTACT: 'How people reach them about their data',
    ALERT_QUIET_MINUTES: 'Minutes to save up further ban alerts before sending them together',
    NTFY_SERVER: 'Phone push server'
  };

  var RE_NAME = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
  var RE_IP4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
  var RE_IP6 = /^(?=.*:.*:)[0-9a-f:]{3,39}$/i;
  /* the same rules the server's settings checker uses */
  var RE_MAIL = /^[A-Za-z0-9._+-]{1,64}@(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
  var RE_NTFY = /^ntfy:[A-Za-z0-9_-]{8,64}$/;
  var RE_TELEGRAM = /^telegram:-?\d{5,20}$/;
  /* a phone-push topic the server hides: only its start is shown. Sent back unchanged, the server puts the real one back. */
  var RE_MASKED = /^ntfy:[A-Za-z0-9_-]{0,4}\*{4}$/;
  var MAIL_PORTS = ['587', '465', '25', '2525'];
  /* control characters and the invisible direction marks that can make text read backwards */
  var RE_UNSAFE = /[\u0000-\u001F\u007F-\u009F\u061C\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF]/g;

  var state = {
    session: null,
    signedIn: false,
    view: 'overview',
    overview: null,
    threat: -1,
    blind: false,
    events: [],
    seenEvents: null,
    doctor: null,
    doctorAt: null,
    setup: null,
    settings: null,
    secrets: {},
    setupLoaded: false,
    lists: { security: [], upkeep: [], cheat: [] },
    listsSaved: '',
    lastDns: null,
    logsLoaded: false,
    busy: false,
    polling: false,
    pollTimer: 0,
    offline: false,
    lastActivity: Date.now(),
    lastPing: Date.now(),
    idleWarned: false,
    leaving: false,
    keysOn: true,
    msgTimer: 0,
    lockTimer: 0,
    ticker: 0,
    navByUser: false
  };

  /* ------------------------------------------------------------------ small tools */

  function $(id) { return document.getElementById(id); }

  function clean(value, max) {
    var s = (value === null || value === undefined) ? '' : String(value);
    var limit = max || 500;
    s = s.replace(RE_UNSAFE, ' ');
    if (s.length > limit) { s = s.slice(0, limit) + '…'; }
    return s;
  }

  function num(value, fallback) {
    var n = Number(value);
    return isFinite(n) ? n : (fallback === undefined ? 0 : fallback);
  }

  function add(parent, kid) {
    if (kid === null || kid === undefined || kid === false) { return; }
    if (Array.isArray(kid)) { kid.forEach(function (k) { add(parent, k); }); return; }
    parent.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
  }

  /* el('p', {class: 'hint', text: '...'}, child, ...). Attribute names are constants in this file;
     style and on* attributes are refused so nothing can become script or inline style. */
  function el(tag, props) {
    var node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (key) {
        var v = props[key];
        if (v === null || v === undefined || v === false) { return; }
        if (key === 'style' || /^on/i.test(key)) { throw new Error('refused attribute: ' + key); }
        if (key === 'class') { node.className = v; }
        else if (key === 'text') { node.textContent = v; }
        else { node.setAttribute(key, v === true ? '' : String(v)); }
      });
    }
    for (var i = 2; i < arguments.length; i++) { add(node, arguments[i]); }
    return node;
  }

  function empty(node) { while (node.firstChild) { node.removeChild(node.firstChild); } }
  function setText(node, text) { if (node.textContent !== text) { node.textContent = text; } }
  function setAttr(node, name, value) { if (node.getAttribute(name) !== value) { node.setAttribute(name, value); } }
  function show(node, on) { node.hidden = !on; }

  function icon(name) {
    return $('tpl-' + name).content.firstElementChild.cloneNode(true);
  }

  function tag(kind, text) { return el('span', { class: 'tag tag--' + kind, text: text }); }

  function two(n) { return (n < 10 ? '0' : '') + n; }
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function clock(date) { return two(date.getHours()) + ':' + two(date.getMinutes()) + ':' + two(date.getSeconds()); }

  function when(epoch, always) {
    var n = num(epoch, NaN);
    if (!isFinite(n) || n <= 0) { return '--:--:--'; }
    var d = new Date(n * 1000);
    var now = new Date();
    var sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    if (always) { return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + clock(d); }
    if (sameDay) { return clock(d); }
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + two(d.getHours()) + ':' + two(d.getMinutes());
  }

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  function span(seconds) {
    var s = Math.max(0, Math.round(num(seconds)));
    if (s < 60) { return plural(s, 'second', 'seconds'); }
    var m = Math.round(s / 60);
    if (m < 60) { return plural(m, 'minute', 'minutes'); }
    var h = Math.floor(m / 60);
    var rest = m % 60;
    if (h < 48) { return plural(h, 'hour', 'hours') + (rest ? ' ' + rest + ' min' : ''); }
    return plural(Math.round(h / 24), 'day', 'days');
  }

  function ago(epoch) {
    var n = num(epoch, NaN);
    if (!isFinite(n) || n <= 0) { return 'at an unknown time'; }
    var gap = Date.now() / 1000 - n;
    if (gap < 45) { return 'just now'; }
    return span(gap) + ' ago';
  }

  function sentence(text) {
    var s = clean(text, 300).trim();
    if (!s) { return ''; }
    s = s.charAt(0).toUpperCase() + s.slice(1);
    return /[.!?]$/.test(s) ? s : s + '.';
  }

  function isPrivate(ip) {
    return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|f[cd][0-9a-f]{2}:|fe80:)/i.test(ip);
  }

  function store(kind, key, value) {
    try {
      var box = kind === 'session' ? window.sessionStorage : window.localStorage;
      if (value === undefined) { return box.getItem(key); }
      if (value === null) { box.removeItem(key); } else { box.setItem(key, value); }
    } catch (e) { /* storage may be switched off; nothing here depends on it */ }
    return null;
  }

  /* ------------------------------------------------------------------ talking to the server */

  function ApiError(message, status, data) {
    this.name = 'ApiError';
    this.message = message;
    this.status = status;
    this.data = data || {};
  }
  ApiError.prototype = Object.create(Error.prototype);

  function SignedOut() { this.name = 'SignedOut'; this.message = 'signed out'; }
  SignedOut.prototype = Object.create(Error.prototype);

  async function api(path, body, timeoutMs) {
    var stop = new AbortController();
    var timer = setTimeout(function () { stop.abort(); }, timeoutMs || 20000);
    var options = {
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: stop.signal,
      headers: { 'Accept': 'application/json' }
    };
    if (body !== undefined) {
      options.method = 'POST';
      options.headers['Content-Type'] = 'application/json';
      options.headers['X-Ludora-Dash'] = '1';
      options.body = JSON.stringify(body);
    }
    var response;
    var data = null;
    try {
      response = await fetch(path, options);
      try { data = await response.json(); } catch (e) { data = null; }
    } catch (e) {
      throw new ApiError(stop.signal.aborted
        ? 'The server took too long to answer. It may still be working; look again in a minute.'
        : 'This page cannot reach the server. Check this device is still on the school network.', 0);
    } finally {
      clearTimeout(timer);
    }
    if (response.status === 401 && path !== '/api/login' && path !== '/api/session') {
      leave('expired');
      throw new SignedOut();
    }
    if (!response.ok) {
      var said = data && typeof data.error === 'string' ? clean(data.error, 300) : '';
      throw new ApiError(said || 'The server answered with an error (' + response.status + ').', response.status, data);
    }
    if (!data || typeof data !== 'object') {
      throw new ApiError('The server sent an answer this page could not read.', response.status);
    }
    return data;
  }

  /* Leaving reloads the page, so nothing that was on screen stays in memory for the next person. */
  function leave(why) {
    if (state.leaving) { return; }
    state.leaving = true;
    state.signedIn = false;
    clearTimeout(state.pollTimer);
    clearInterval(state.ticker);
    wipeSecrets();
    store('session', 'ludora-dash-left', why);
    window.location.reload();
  }

  function wipeSecrets() {
    ['signin-password', 'signin-code', 'smtp-pass', 'tg-token'].forEach(function (id) {
      var field = $(id);
      if (field) { field.value = ''; }
    });
  }

  async function signOut(why) {
    if (state.signingOut) { return; }
    state.signingOut = true;
    try { await api('/api/logout', {}); } catch (e) { /* signed out either way */ }
    leave(why || 'out');
  }

  /* ------------------------------------------------------------------ messages */

  function announce(text, urgent) {
    var node = $(urgent ? 'live-now' : 'live');
    node.textContent = '';
    window.setTimeout(function () { node.textContent = text; }, 60);
  }

  /* kind: ok | bad | work | note. `near` is an optional line beside the control that caused it. */
  function say(text, kind, near) {
    var line = $('msg');
    clearTimeout(state.msgTimer);
    empty($('msg-ico'));
    if (!text) { show(line, false); return; }
    line.className = 'cmd-out' + (kind === 'ok' ? ' is-ok' : kind === 'bad' ? ' is-bad' : '');
    if (kind === 'work') { $('msg-ico').appendChild(icon('spin')); }
    setText($('msg-text'), text);
    show($('msg-x'), kind !== 'work');
    show(line, true);
    announce(text, kind === 'bad');
    if (near) {
      near.className = 'say' + (kind === 'ok' ? ' say--ok' : kind === 'bad' ? ' say--bad' : kind === 'note' ? ' say--note' : '');
      near.textContent = kind === 'work' ? '' : text;
    }
    if (kind === 'ok' || kind === 'note') {
      state.msgTimer = setTimeout(function () { show(line, false); }, 15000);
    }
  }

  function begin(button, text, near) {
    state.busy = true;
    state.workText = text;
    state.workStart = Date.now();
    if (button) {
      button.setAttribute('aria-busy', 'true');
      button.setAttribute('aria-disabled', 'true');
      button.insertBefore(icon('spin'), button.firstChild);
    }
    say(text, 'work', near);
  }

  function finish(button) {
    state.busy = false;
    state.workText = '';
    if (button) {
      button.removeAttribute('aria-busy');
      button.removeAttribute('aria-disabled');
      var spinner = button.querySelector('.spin');
      if (spinner) { button.removeChild(spinner); }
    }
    touch();
  }

  function busyNow(near) {
    if (!state.busy) { return false; }
    say('One job is still running. Wait for it to finish, then try again.', 'note', near);
    return true;
  }

  /* A plain-words question before anything disruptive. Resolves true only on the confirm button. */
  function ask(question) {
    var dialog = $('confirm');
    var body = $('confirm-body');
    var yes = $('confirm-yes');
    setText($('confirm-title').firstElementChild, question.title);
    empty(body);
    question.lines.forEach(function (line) { body.appendChild(el('p', { text: line })); });
    setText(yes, question.yes);
    yes.className = 'btn ' + (question.danger ? 'btn--danger' : 'btn--primary');
    if (typeof dialog.showModal !== 'function') {
      return Promise.resolve(window.confirm(question.title + '\n\n' + question.lines.join('\n')));
    }
    return new Promise(function (resolve) {
      var answer = false;
      function onYes() { answer = true; dialog.close(); }
      function onNo() { dialog.close(); }
      function onClose() {
        yes.removeEventListener('click', onYes);
        $('confirm-no').removeEventListener('click', onNo);
        dialog.removeEventListener('close', onClose);
        resolve(answer);
      }
      yes.addEventListener('click', onYes);
      $('confirm-no').addEventListener('click', onNo);
      dialog.addEventListener('close', onClose);
      dialog.showModal();
      $('confirm-no').focus();
    });
  }

  /* One action on the server. o: {button, near, working, confirm, done} */
  async function act(payload, o) {
    if (busyNow(o.near)) { return null; }
    if (o.confirm && !(await ask(o.confirm))) { return null; }
    begin(o.button, o.working, o.near);
    try {
      var result = await api('/api/action', payload, ACTION_TIMEOUT_MS);
      if (result.moving && typeof result.moving === 'object') {
        /* the change cuts this page's own connection, so the server answered first and does the work now */
        say(clean(result.message, 500) || o.done || 'Working.', 'note', o.near);
        startMove(result.moving, payload.action === 'restart' ? 'proxy' : 'site', clean(result.message, 500));
      } else {
        say(clean(result.message, 500) || o.done || 'Done.', 'ok', o.near);
      }
      return result;
    } catch (e) {
      if (!(e instanceof SignedOut)) { say(e.message, 'bad', o.near); }
      return null;
    } finally {
      finish(o.button);
      pollNow();
    }
  }

  /* ------------------------------------------------------------------ sign-in */

  function showSignIn(note, bad) {
    var session = state.session || {};
    show($('app'), false);
    show($('signin'), true);
    setText($('signin-server'), clean(session.server, 60) || 'this server');
    show($('signin-code-field'), !!session.needs_code);
    var idle = num(session.idle_minutes, 0);
    setText($('signin-foot'), 'Every sign-in is recorded. ' + (idle
      ? 'After ' + plural(idle, 'minute', 'minutes') + ' without use the dashboard signs you out by itself.'
      : 'The dashboard signs you out by itself when it is left unused.'));
    var line = $('signin-note');
    line.className = 'say ' + (bad ? 'say--bad' : 'say--note');
    setText(line, note || '');
    show(line, !!note);
    document.title = 'Sign in - Ludora OS staff dashboard';
    $('signin-password').focus();
  }

  function lockSignIn(seconds) {
    var button = $('signin-go');
    var left = Math.max(1, Math.round(num(seconds, 30)));
    clearInterval(state.lockTimer);
    function tick() {
      if (left <= 0) {
        clearInterval(state.lockTimer);
        button.removeAttribute('aria-disabled');
        setText(button, 'Sign in');
        return;
      }
      button.setAttribute('aria-disabled', 'true');
      setText(button, 'Paused: ' + Math.floor(left / 60) + ':' + two(left % 60));
      left -= 1;
    }
    tick();
    state.lockTimer = setInterval(tick, 1000);
  }

  async function onSignIn(event) {
    event.preventDefault();
    var button = $('signin-go');
    var password = $('signin-password');
    var code = $('signin-code');
    var error = $('signin-error');
    var needsCode = !!(state.session && state.session.needs_code);
    if (button.getAttribute('aria-disabled') === 'true') { return; }
    setText(error, '');
    password.removeAttribute('aria-invalid');
    code.removeAttribute('aria-invalid');
    if (!password.value) {
      setText(error, 'Type the administrator password.');
      password.setAttribute('aria-invalid', 'true');
      password.focus();
      return;
    }
    var digits = code.value.replace(/\s+/g, '');
    if (needsCode && !/^\d{6}$/.test(digits)) {
      setText(error, 'Type the 6-digit code your authenticator app shows right now.');
      code.setAttribute('aria-invalid', 'true');
      code.focus();
      return;
    }
    var body = { password: password.value };
    if (needsCode) { body.code = digits; }
    button.setAttribute('aria-disabled', 'true');
    button.insertBefore(icon('spin'), button.firstChild);
    try {
      await api('/api/login', body);
      password.value = '';
      code.value = '';
      body.password = '';
      await start();
    } catch (e) {
      password.value = '';
      code.value = '';
      body.password = '';
      if (e.status === 429) {
        var wait = Math.max(1, Math.round(num(e.data && e.data.retry_after, 900)));
        setText(error, 'Too many wrong passwords from this computer, so sign-in is paused here for ' + span(wait) +
          '. This protects the server from guessing. Wait, then try again; if you have forgotten the password, it is changed at the server itself.');
        lockSignIn(wait);
      } else {
        setText(error, e.message);
      }
      password.focus();
    } finally {
      var spinner = button.querySelector('.spin');
      if (spinner) { button.removeChild(spinner); }
      if (!state.lockTimer || button.textContent === 'Sign in') { button.removeAttribute('aria-disabled'); }
    }
  }

  /* ------------------------------------------------------------------ the shell */

  function enterApp() {
    var session = state.session;
    state.signedIn = true;
    show($('signin'), false);
    show($('app'), true);
    setText($('sl-server'), clean(session.server, 60));
    setText($('cmd-user'), 'staff@' + (clean(session.server, 40) || 'ludora'));
    if (!$('hero-radar').firstChild) { mountIcons(); }
    state.lastActivity = Date.now();
    state.lastPing = Date.now();
    route(false);
    clearInterval(state.ticker);
    state.ticker = setInterval(tick, 1000);
    tick();
    pollNow();
  }

  function mountIcons() {
    $('hero-radar').appendChild(icon('radar'));
    $('moving-ico').appendChild(icon('radar'));
    $('sl-radar').appendChild(icon('radar'));
    $('g-shield-ico').appendChild(icon('shield'));
    $('shield-ico').appendChild(icon('shield'));
    $('g-lock-ico').appendChild(icon('lock'));
    $('lock-ico').appendChild(icon('lock'));
    $('email-test-ico').appendChild(icon('mail'));
  }

  function route(byUser) {
    var wanted = window.location.hash.replace(/^#/, '');
    var view = VIEWS.indexOf(wanted) >= 0 ? wanted : 'overview';
    state.view = view;
    VIEWS.forEach(function (name) { show($('view-' + name), name === view); });
    Array.prototype.forEach.call($('rail').querySelectorAll('a'), function (link) {
      if (link.getAttribute('data-view') === view) { link.setAttribute('aria-current', 'page'); }
      else { link.removeAttribute('aria-current'); }
    });
    setText($('cmd-text'), view);
    title();
    if (byUser) {
      window.scrollTo(0, 0);
      $('h-' + view).focus({ preventScroll: true });
    }
    if (!state.signedIn) { return; }
    if (view === 'setup' && !state.setupLoaded) { loadSetup(); }
    if (view === 'health') { loadDoctor(); }
    if (view === 'logs' && !state.logsLoaded) { loadLogs(); }
    if (view === 'overview' || view === 'security' || view === 'health') { pollNow(); }
  }

  function title() {
    var server = state.session ? clean(state.session.server, 60) : '';
    var prefix = state.blind ? '(guard not reporting) ' : state.threat === 2 ? '(under attack) ' : state.threat === 1 ? '(watchful) ' : '';
    document.title = prefix + VIEW_NAMES[state.view] + ' - ' + (server ? server + ' - ' : '') + 'Ludora OS';
  }

  function go(view) {
    state.navByUser = true;
    if (window.location.hash === '#' + view) { route(true); }
    else { window.location.hash = view; }
  }

  /* ------------------------------------------------------------------ idle sign-out */

  function touch() {
    if (!state.signedIn || state.idleWarned) { return; }
    var now = Date.now();
    state.lastActivity = now;
    /* tell the server someone is here, at most once a minute; the 5-second polls are not a person */
    if (now - state.lastPing > 60000) {
      state.lastPing = now;
      api('/api/session').then(function (s) {
        if (s && s.signed_in === false) { leave('expired'); }
      }).catch(function () { /* the next poll reports a lost connection */ });
    }
  }

  function tick() {
    if (!state.signedIn) { return; }
    if (state.move) { state.lastActivity = Date.now(); return; }
    var limit = Math.max(1, num(state.session.idle_minutes, 15)) * 60;
    if (state.busy) {
      state.lastActivity = Date.now();
      /* a long job shows how long it has been going, so nobody thinks it has stuck */
      var going = Math.floor((Date.now() - state.workStart) / 1000);
      if (state.workText && going >= 3 && $('msg-ico').firstChild) {
        setText($('msg-text'), state.workText + ' ' + going + ' seconds so far.');
      }
    }
    var left = Math.max(0, Math.ceil(limit - (Date.now() - state.lastActivity) / 1000));
    setText($('sl-idle-left'), Math.floor(left / 60) + ':' + two(left % 60));
    $('sl-idle').classList.toggle('is-soon', left <= 60);
    if (left <= 0) { signOut('idle'); return; }
    if (left <= 60) {
      setText($('idle-count'), plural(left, 'second', 'seconds'));
      if (!state.idleWarned) {
        state.idleWarned = true;
        var dialog = $('idle');
        if (typeof dialog.showModal === 'function' && !dialog.open) {
          dialog.showModal();
          $('idle-stay').focus();
        }
        announce('Nobody has used this dashboard for a while. It signs out in one minute unless you choose to stay.', true);
      }
    }
  }

  function stay() {
    state.idleWarned = false;
    if ($('idle').open) { $('idle').close(); }
    state.lastPing = 0;
    touch();
    tick();
  }

  /* ------------------------------------------------------------------ polling */

  function schedule() {
    clearTimeout(state.pollTimer);
    if (!state.signedIn || document.hidden) { return; }
    state.pollTimer = setTimeout(poll, POLL_MS);
  }

  function pollNow() {
    clearTimeout(state.pollTimer);
    if (!state.signedIn || document.hidden) { return; }
    state.pollTimer = setTimeout(poll, 0);
  }

  async function poll() {
    if (state.polling || !state.signedIn || state.move) { return; }
    state.polling = true;
    try {
      var view = state.view;
      var wantEvents = view === 'overview' || view === 'security';
      var asked = [api('/api/overview')];
      if (wantEvents) { asked.push(api('/api/events?limit=' + (view === 'security' ? 300 : 40))); }
      var got = await Promise.all(asked);
      state.offline = false;
      state.overview = got[0];
      renderOverview(got[0]);
      if (wantEvents && got[1] && Array.isArray(got[1].events)) {
        state.events = got[1].events;
        renderEvents();
      }
      if (view === 'health' && got[0].doctor && got[0].doctor.at !== state.doctorAt) { loadDoctor(); }
    } catch (e) {
      if (!(e instanceof SignedOut)) {
        state.offline = true;
        renderBand();
      }
    } finally {
      state.polling = false;
      schedule();
    }
  }

  /* ------------------------------------------------------------------ changes that cut the connection */
  /* A new address or certificate, or a proxy restart, cuts this page off: the server answers first with
     "moving" and then restarts. The page stops polling, shows a calm waiting screen, and asks its own
     address every few seconds whether it is back. It cannot ask the new address (connect-src 'self'),
     so that is offered as a plain link. */

  var PROBE_MS = 4000;

  function startMove(m, kind, message) {
    var seconds = Math.max(5, Math.min(600, Math.round(num(m.seconds, 60))));
    var to = typeof m.to === 'string' && /^https:\/\/[a-z0-9.-]{1,253}(:\d{1,5})?\/?$/i.test(m.to) ? m.to.replace(/\/$/, '') : null;
    if (to && to.toLowerCase() === window.location.origin.toLowerCase()) { to = null; }
    state.move = { kind: kind, to: to, started: Date.now(), seconds: seconds, sawFail: false, gone: false };
    clearTimeout(state.pollTimer);
    store('session', 'ludora-dash-moved', to ? to + '/' : null);
    if ($('confirm').open) { $('confirm').close(); }
    if ($('idle').open) { $('idle').close(); }
    show($('app'), false);
    show($('moving'), true);
    setText($('moving-title').firstElementChild, kind === 'proxy' ? 'The proxy is restarting' : 'The server is moving');
    setText($('moving-message'), message || (kind === 'proxy'
      ? 'The proxy is restarting. This page loses its connection for a few seconds.'
      : 'The server is changing its address or certificate.'));
    var link = $('moving-link');
    empty(link);
    if (to) {
      add(link, ['When it is done, the dashboard is at ', el('a', { href: to + '/', rel: 'noopener noreferrer', text: to + '/' }),
        '. Open it there and sign in again. If the change does not work, the server puts the old settings back by itself and this page tells you.']);
    }
    show(link, !!to);
    setText($('moving-status'), 'Waiting for the server.');
    document.title = (kind === 'proxy' ? 'Reconnecting' : 'Moving') + ' - Ludora OS';
    $('moving-title').focus();
    announce(message || 'The server is restarting.', false);
    clearInterval(state.moveTimer);
    state.moveTimer = setInterval(moveTick, 1000);
    moveTick();
    clearTimeout(state.probeTimer);
    state.probeTimer = setTimeout(probe, PROBE_MS);
  }

  function moveTick() {
    var move = state.move;
    if (!move) { return; }
    var left = Math.max(0, Math.ceil(move.seconds - (Date.now() - move.started) / 1000));
    setText($('moving-count'), left > 0
      ? 'About ' + Math.floor(left / 60) + ':' + two(left % 60) + ' left'
      : 'Taking longer than expected. Still trying.');
    $('moving').classList.toggle('is-late', left <= 0);
  }

  async function probe() {
    var move = state.move;
    if (!move) { return; }
    try {
      var answer = await api('/api/session', undefined, PROBE_MS);
      /* an answer before the cut-off or before the time is up is the old service still finishing: wait */
      if (move.sawFail || Date.now() - move.started >= move.seconds * 1000) { back(answer); return; }
    } catch (e) {
      move.sawFail = true;
      if (e.status === 421) {
        move.gone = true;
        setText($('moving-status'), 'This address no longer opens the dashboard. Use the link above.');
      } else {
        setText($('moving-status'), 'Not answering yet, as expected. Trying again every few seconds.');
      }
    }
    state.probeTimer = setTimeout(probe, PROBE_MS);
  }

  /* Its own address answers again: start afresh, so the screen shows what is true now. */
  function back(session) {
    clearInterval(state.moveTimer);
    clearTimeout(state.probeTimer);
    var kind = state.move.kind;
    state.move = null;
    store('session', 'ludora-dash-moved', null);
    store('session', 'ludora-dash-left', kind === 'proxy' ? 'reconnected' : 'back');
    leave(kind === 'proxy' ? 'reconnected' : 'back');
  }

  /* ------------------------------------------------------------------ overview */

  function threatLevel(o) {
    var level = Math.round(num(o && o.threat && o.threat.level, 0));
    return Math.max(0, Math.min(2, level));
  }

  /* The sentinel is not reporting. "Calm" would then be a guess, so the page says it does not know. */
  function blind(o) {
    return !!(o && o.threat && o.threat.known === false);
  }

  /* "Database" -> "database", but "USB guard" and "Ludora, the game site" keep their capitals */
  function midSentence(name) {
    return /^[A-Z][a-z]/.test(name) && !/^Ludora/.test(name) ? name.charAt(0).toLowerCase() + name.slice(1) : name;
  }

  function serviceState(name, raw) {
    if (raw === 'active') { return { icon: 'running', word: 'running', tag: 'ok' }; }
    if (name === 'ssh') { return { icon: 'off', word: 'off', tag: 'off' }; }
    return { icon: 'stopped', word: raw === 'failed' ? 'failed' : 'stopped', tag: 'bad' };
  }

  function renderBand() {
    var o = state.overview;
    var band = $('band');
    var level = o ? threatLevel(o) : 0;
    if (state.offline) {
      band.className = 'band band--offline';
      setText($('band-text'), 'This page cannot reach the server, so what you see may be out of date. It keeps trying every few seconds.');
      show($('band-link'), false);
      show(band, true);
      return;
    }
    if (blind(o)) {
      band.className = 'band band--offline';
      $('band-link').href = '#health';
      setText($('band-link'), 'See what has stopped');
      setText($('band-text'), 'The sentinel, the guard, is not reporting. Until it does, this page cannot tell whether the server is under attack.');
      show($('band-link'), state.view !== 'health');
      show(band, true);
      return;
    }
    if (level === 2) {
      var bans = Array.isArray(o.bans) ? o.bans.length : 0;
      band.className = 'band';
      $('band-link').href = '#security';
      setText($('band-link'), 'See what is happening');
      setText($('band-text'), 'Under attack. The sentinel is refusing ' + plural(bans, 'address', 'addresses') +
        (o.shield && o.shield.up ? ' and has raised the shield.' : '.') + ' Games already running carry on.');
      show($('band-link'), state.view !== 'security');
      show(band, true);
      return;
    }
    show(band, false);
  }

  function renderOverview(o) {
    var level = threatLevel(o);
    var unknown = blind(o);
    if (unknown) { level = 1; }    /* drawn as "watchful", worded as "not known" */
    var services = (o.services && typeof o.services === 'object') ? o.services : {};
    var bans = Array.isArray(o.bans) ? o.bans : [];
    var shield = o.shield || {};
    var names = Object.keys(services);
    var down = names.filter(function (n) { return n !== 'ssh' && services[n] !== 'active'; });

    /* status line and page-wide state */
    if (level !== state.threat || unknown !== state.blind) {
      var before = state.threat;
      var wasBlind = state.blind;
      state.threat = level;
      state.blind = unknown;
      document.body.setAttribute('data-threat', String(level));
      $('hero-radar').setAttribute('data-level', String(level));
      $('sl-radar').setAttribute('data-level', String(level));
      title();
      if (unknown) {
        if (!wasBlind) { announce('The sentinel has stopped reporting, so the threat level is not known. Open Health to see what has stopped.', true); }
      } else if (wasBlind) {
        announce('The sentinel is reporting again. The threat level is ' + THREAT[level].badge + '.', false);
      } else if (before >= 0 && level > before) {
        announce(level === 2
          ? 'Under attack. The sentinel is refusing the addresses involved. Open Security to see them.'
          : 'The threat level went up to watchful.', level === 2);
      } else if (before >= 0) {
        announce('The threat level went down to ' + THREAT[level].badge + '.', false);
      }
    }
    setText($('sl-threat-text'), unknown ? 'not known' : THREAT[level].badge);
    setText($('sl-clock'), clock(new Date()));
    renderBand();

    /* hero */
    setText($('hero-level'), unknown ? 'Not known' : THREAT[level].word);
    var line;
    if (unknown) {
      line = 'The sentinel, the guard, is not reporting, so this page cannot tell whether anything is wrong. Open Health to see what has stopped.';
    } else if (level === 2) {
      line = 'Several addresses are misbehaving at once. The sentinel is refusing them' +
        (shield.up ? ' and has tightened every limit' : '') + '. Games already running carry on.';
    } else if (level === 1) {
      line = 'The sentinel has seen something unusual and is watching more closely. ' +
        (bans.length ? plural(bans.length, 'address is', 'addresses are') + ' banned.' : 'Nobody is banned.');
    } else if (down.length) {
      line = 'No attack, but ' + down.map(function (n) { return midSentence(SERVICES[n] || clean(n, 30)); }).join(' and ') +
        (down.length === 1 ? ' is' : ' are') + ' not running.';
    } else {
      line = 'Nothing needs you. Every service is running and ' +
        (bans.length ? plural(bans.length, 'address is', 'addresses are') + ' banned.' : 'nobody is banned.');
    }
    setText($('hero-line'), line);

    var attention = Array.isArray(o.attention) ? o.attention.map(sentence).filter(Boolean) : [];
    if (o.state === 'attention' && !attention.length) { attention = ['The server says something needs a look. Open Health.']; }
    var list = $('hero-attention-list');
    if (list.getAttribute('data-sig') !== attention.join('|')) {
      list.setAttribute('data-sig', attention.join('|'));
      empty(list);
      attention.forEach(function (text) { list.appendChild(el('li', { text: text })); });
    }
    show($('hero-attention'), attention.length > 0);

    var meta = $('hero-meta');
    var site = clean(o.site, 200);
    var metaText = (clean(o.server, 60) || 'This server') + (o.address ? ' at ' + clean(o.address, 60) : '') +
      (o.version ? ', Ludora OS ' + clean(o.version, 20) : '') + '. ';
    if (meta.getAttribute('data-sig') !== metaText + site) {
      meta.setAttribute('data-sig', metaText + site);
      empty(meta);
      add(meta, metaText);
      if (/^https:\/\/[^\s"'<>]+$/i.test(site)) {
        add(meta, ['People open Ludora at ', el('a', { href: site, rel: 'noopener noreferrer', target: '_blank', text: site.replace(/^https:\/\//i, '') }), '.']);
      } else {
        add(meta, ['No site address is set yet. ', el('a', { href: '#setup', text: 'Set one in Setup' }), '.']);
      }
    }

    /* gauges */
    var shieldWords = shield.up
      ? (shield.mode === 'on' ? 'Raised. Staff are keeping it up.' : 'Raised by the sentinel.')
      : (shield.mode === 'off' ? 'Down. Staff are keeping it down.' : 'Down. The sentinel raises it when needed.');
    setText($('g-shield'), shieldWords);
    setText($('g-lock'), o.lockdown ? 'On. Only staff addresses can open Ludora.' : 'Off. Ludora is open as usual.');
    setText($('g-bans-n'), String(bans.length));
    setText($('g-bans'), bans.length
      ? plural(bans.length, 'address', 'addresses') + '. The next is let back in ' +
        span(Math.min.apply(null, bans.map(function (b) { return num(b.seconds_left); }))) + ' from now.'
      : 'Nobody.');
    Array.prototype.forEach.call(document.querySelectorAll('.shield'), function (svg) { setAttr(svg, 'data-up', shield.up ? 'true' : 'false'); });
    Array.prototype.forEach.call(document.querySelectorAll('.lock'), function (svg) { setAttr(svg, 'data-on', o.lockdown ? 'true' : 'false'); });

    renderServices($('services'), services);
    renderServices($('services-health'), services);
    renderUpkeep(o);
    renderRates(o.rates);
    renderSecurity(o);
    renderHealthFacts(o);
  }

  function renderServices(list, services) {
    var names = Object.keys(services).slice(0, 24);
    var sig = names.join('|');
    if (list.getAttribute('data-sig') !== sig) {
      list.setAttribute('data-sig', sig);
      empty(list);
      names.forEach(function (name) {
        list.appendChild(el('li', null,
          icon('pulse'),
          el('span', { class: 'svc-name', text: SERVICES[name] || clean(name, 40) }),
          el('span', { class: 'svc-state' })));
      });
    }
    names.forEach(function (name, i) {
      var row = list.children[i];
      var s = serviceState(name, services[name]);
      setAttr(row.children[0], 'data-state', s.icon);
      var cell = row.children[2];
      if (cell.getAttribute('data-sig') !== s.word) {
        cell.setAttribute('data-sig', s.word);
        empty(cell);
        cell.appendChild(tag(s.tag, s.tag === 'bad' ? '!! ' + s.word : s.word));
      }
    });
  }

  function fact(list, key, title, kind, word, text, link) {
    var row = list.querySelector('[data-fact="' + key + '"]');
    if (!row) {
      row = el('div', { 'data-fact': key }, el('dt'), el('dd'));
      list.appendChild(row);
    }
    var sig = kind + '|' + word + '|' + text;
    if (row.getAttribute('data-sig') === sig) { return; }
    row.setAttribute('data-sig', sig);
    var dt = row.children[0];
    var dd = row.children[1];
    empty(dt);
    add(dt, [title + ' ', tag(kind, '[' + word + ']')]);
    empty(dd);
    add(dd, text);
    if (link) { add(dd, [' ', el('a', { href: link.href, text: link.text })]); }
  }

  function doctorWords(d) {
    d = d || {};
    var failed = num(d.failed), unknown = num(d.unknown), passed = num(d.passed);
    var total = failed + unknown + passed;
    if (!d.at) { return { kind: 'warn', word: 'not run', text: 'The self-check has not run yet.' }; }
    if (failed) {
      return { kind: 'bad', word: 'failing', text: plural(failed, 'check', 'checks') + ' of ' + total + ' failed when the self-check ran ' + ago(d.at) + '.' };
    }
    if (unknown) {
      return { kind: 'warn', word: 'look', text: passed + ' passed and ' + unknown + ' could not be checked, ' + ago(d.at) + '.' };
    }
    return { kind: 'ok', word: 'ok', text: 'All ' + plural(total, 'check', 'checks') + ' passed, ' + ago(d.at) + '.' };
  }

  function backupWords(b) {
    b = b || {};
    var count = num(b.count);
    if (!count || b.newest_hours === null || b.newest_hours === undefined) {
      return { kind: 'bad', word: 'none', text: 'There is no backup yet.' };
    }
    var hours = num(b.newest_hours);
    var age = hours < 1 ? 'less than an hour old' : plural(Math.round(hours), 'hour', 'hours') + ' old';
    if (hours > 36) {
      return { kind: 'warn', word: 'old', text: plural(count, 'backup', 'backups') + ' kept. The newest is ' + age + ', which is older than it should be.' };
    }
    return { kind: 'ok', word: 'ok', text: plural(count, 'backup', 'backups') + ' kept. The newest is ' + age + '.' };
  }

  function supportWords(s) {
    if (!s) { return { kind: 'off', word: 'closed', text: 'Closed. Nobody outside the school can connect to the server.' }; }
    var left = num(s.until) - Date.now() / 1000;
    return { kind: 'warn', word: 'open', text: 'Open for a helper at ' + clean(s.from, 60) + ' for another ' + span(left) + ', until ' + when(s.until) + '.' };
  }

  function analystWords(a) {
    a = a || {};
    if (a.enabled) { return { kind: 'ok', word: 'on', text: 'On. It adds a second opinion to security alerts and decides nothing.' }; }
    if (a.installed) { return { kind: 'off', word: 'off', text: 'Installed, and switched off.' }; }
    return { kind: 'off', word: 'not installed', text: 'Not installed. The server works the same without it.' };
  }

  function renderUpkeep(o) {
    var list = $('upkeep');
    var d = doctorWords(o.doctor), b = backupWords(o.backups), s = supportWords(o.support), a = analystWords(o.analyst);
    fact(list, 'doctor', 'Self-check', d.kind, d.word, d.text, { href: '#health', text: 'See the checks' });
    fact(list, 'backup', 'Backups', b.kind, b.word, b.text);
    fact(list, 'support', 'Support access', s.kind, s.word, s.text);
    fact(list, 'analyst', 'The analyst', a.kind, a.word, a.text);
    var last = o.last_change && typeof o.last_change === 'object' ? o.last_change : null;
    var row = list.querySelector('[data-fact="change"]');
    if (last) {
      fact(list, 'change', 'Last address change', last.ok ? 'ok' : 'bad', last.ok ? 'made' : 'undone',
        sentence(last.message) + ' (' + ago(last.at) + ')', { href: '#setup', text: 'Open Setup' });
    } else if (row) {
      list.removeChild(row);
    }
    renderLastChange(last);
    renderLastNotice(last);
  }

  /* What became of a change made after its answer was sent: shown big on the overview for 15 minutes,
     until dismissed for this session. */
  function renderLastNotice(last) {
    var box = $('last-change');
    var fresh = last && Date.now() / 1000 - num(last.at) < 15 * 60;
    var key = last ? String(num(last.at)) : '';
    if (!fresh || store('session', 'ludora-dash-seen-change') === key) { show(box, false); return; }
    box.className = 'notice ' + (last.ok ? 'notice--ok' : 'notice--bad');
    box.setAttribute('data-at', key);
    setText($('last-change-head'), last.ok ? 'The last change worked (' + ago(last.at) + ').' : 'The last change did not hold (' + ago(last.at) + ').');
    setText($('last-change-text'), sentence(last.message));
    if (box.hidden) {
      show(box, true);
      announce((last.ok ? 'The last change worked. ' : 'The last change did not hold. ') + sentence(last.message), !last.ok);
    }
  }

  function renderLastChange(last) {
    var line = $('dom-last');
    var text = last ? 'Last change, ' + ago(last.at) + ': ' + sentence(last.message) : '';
    line.className = 'say ' + (last && !last.ok ? 'say--bad' : 'say--note');
    setText(line, text);
  }

  function renderRates(rates) {
    var list = $('rates');
    var names = (rates && typeof rates === 'object') ? Object.keys(rates).slice(0, 12) : [];
    show($('rates-none'), names.length === 0);
    var sig = names.join('|');
    if (list.getAttribute('data-sig') !== sig) {
      list.setAttribute('data-sig', sig);
      empty(list);
      names.forEach(function (name) {
        list.appendChild(el('li', null,
          el('span', { class: 'rate-name', text: sentence(name).replace(/\.$/, '') }),
          el('span', { class: 'rate-val' }),
          el('span', { class: 'rate-bar', 'aria-hidden': 'true' })));
      });
    }
    names.forEach(function (name, i) {
      var value = Math.max(0, num(rates[name]));
      var row = list.children[i];
      /* a log scale: one more block for each rough doubling, full at 10,000 a second */
      var cells = Math.max(0, Math.min(32, Math.round(8 * Math.log(1 + value) / Math.LN10)));
      setText(row.children[1], (value >= 10 ? Math.round(value) : Math.round(value * 10) / 10).toLocaleString('en') + ' a second');
      setText(row.children[2], new Array(cells + 1).join('█') + new Array(32 - cells + 1).join('░'));
    });
  }

  /* ------------------------------------------------------------------ events */

  function eventRow(ev, full, isNew) {
    var sev = SEVERITY[ev.severity] ? ev.severity : 'info';
    return el('li', { class: 'ev ev--' + sev + (isNew ? ' ev--new' : '') },
      el('span', { class: 'ev-time', text: when(ev.at, full) }),
      el('span', { class: 'ev-sev', text: SEVERITY[sev].label }),
      el('span', { class: 'ev-text', text: clean(ev.text, 600) }));
  }

  function eventKey(ev) { return num(ev.at) + '|' + clean(ev.kind, 40) + '|' + clean(ev.text, 120); }

  function renderEvents() {
    var events = state.events.filter(function (ev) { return ev && typeof ev === 'object'; });
    var newest = events.slice().reverse();
    var keys = {};
    newest.forEach(function (ev) { keys[eventKey(ev)] = true; });
    var seen = state.seenEvents;

    var feed = $('feed');
    var top = newest.slice(0, 30);
    var sig = top.map(eventKey).join('\n');
    if (feed.getAttribute('data-sig') !== sig) {
      feed.setAttribute('data-sig', sig);
      empty(feed);
      top.forEach(function (ev) { feed.appendChild(eventRow(ev, false, !!seen && !seen[eventKey(ev)])); });
    }
    show($('feed-none'), top.length === 0);

    if (state.view === 'security') {
      var min = num($('ev-filter').value);
      var shown = newest.filter(function (ev) { return (SEVERITY[ev.severity] ? SEVERITY[ev.severity].rank : 0) >= min; });
      var full = $('events');
      var fullSig = min + '\n' + shown.map(eventKey).join('\n');
      if (full.getAttribute('data-sig') !== fullSig) {
        full.setAttribute('data-sig', fullSig);
        empty(full);
        shown.forEach(function (ev) { full.appendChild(eventRow(ev, true, !!seen && !seen[eventKey(ev)])); });
        setText($('ev-count'), 'Showing ' + shown.length + ' of ' + plural(newest.length, 'event', 'events') + '.');
      }
      show($('events-none'), shown.length === 0);
    }
    state.seenEvents = keys;
  }

  /* ------------------------------------------------------------------ security */

  function renderSecurity(o) {
    var bans = Array.isArray(o.bans) ? o.bans.slice(0, 500) : [];
    var list = $('bans');
    var rows = {};
    Array.prototype.forEach.call(list.children, function (row) { rows[row.getAttribute('data-ip')] = row; });
    var wanted = {};
    bans.forEach(function (ban) {
      var ip = clean(ban && ban.ip, 60);
      if (!ip || wanted[ip]) { return; }
      wanted[ip] = true;
      var row = rows[ip];
      if (!row) {
        var button = el('button', { type: 'button', class: 'btn btn--small', 'aria-label': 'Let ' + ip + ' back in', text: 'Let it back in' });
        button.addEventListener('click', function () { unban(ip, button); });
        row = el('li', { 'data-ip': ip },
          el('span', { class: 'ban-ip' }, ip, el('span', { class: 'ban-left' })),
          button);
        list.appendChild(row);
      }
      setText(row.querySelector('.ban-left'), span(ban.seconds_left) + ' left');
    });
    Object.keys(rows).forEach(function (ip) {
      if (!wanted[ip]) {
        var row = rows[ip];
        if (row.contains(document.activeElement)) { $('h-security').focus({ preventScroll: true }); }
        list.removeChild(row);
      }
    });
    show($('bans-none'), list.children.length === 0);

    var shield = o.shield || {};
    setText($('shield-now'), shield.up
      ? (shield.mode === 'on' ? 'The shield is raised, and staff are keeping it up.' : 'The shield is raised. The sentinel raised it.')
      : (shield.mode === 'off' ? 'The shield is down, and staff are keeping it down.' : 'The shield is down. The sentinel raises it when needed.'));
    Array.prototype.forEach.call($('shield-modes').querySelectorAll('button'), function (button) {
      setAttr(button, 'aria-pressed', button.getAttribute('data-mode') === shield.mode ? 'true' : 'false');
    });

    setText($('lock-now'), o.lockdown ? 'Lockdown is on. Only staff addresses can open Ludora.' : 'Lockdown is off. Ludora is open as usual.');
    var toggle = $('lock-toggle');
    if (toggle.getAttribute('aria-busy') !== 'true') {
      setText(toggle, o.lockdown ? 'Turn lockdown off' : 'Turn lockdown on');
      toggle.className = 'btn' + (o.lockdown ? ' btn--primary' : ' btn--danger');
    }
  }

  function unban(ip, button) {
    act({ action: 'unban', ip: ip }, {
      button: button,
      working: 'Letting ' + ip + ' back in.',
      done: ip + ' can open Ludora again.',
      confirm: {
        title: 'Let ' + ip + ' back in?',
        lines: ['That device can open Ludora again straight away.', 'If it misbehaves again the sentinel bans it again, for longer.'],
        yes: 'Let it back in'
      }
    });
  }

  function onBan(event) {
    event.preventDefault();
    var field = $('ban-ip');
    var out = $('ban-out');
    var ip = field.value.trim();
    var minutes = num($('ban-minutes').value, 60);
    field.removeAttribute('aria-invalid');
    if (!RE_IP4.test(ip) && !RE_IP6.test(ip)) {
      field.setAttribute('aria-invalid', 'true');
      say('That is not an address. It should look like 10.20.3.7.', 'bad', out);
      field.focus();
      return;
    }
    act({ action: 'ban', ip: ip, minutes: minutes }, {
      button: event.target.querySelector('button[type="submit"]'),
      near: out,
      working: 'Banning ' + ip + '.',
      done: ip + ' is banned for ' + span(minutes * 60) + '.',
      confirm: {
        title: 'Ban ' + ip + ' for ' + span(minutes * 60) + '?',
        lines: ['That device will not be able to open Ludora until the time runs out or you let it back in.',
          'If several people share that address (a whole room behind one router), all of them are shut out.',
          'Staff addresses are never banned; the server will say so if this is one.'],
        yes: 'Ban this address',
        danger: true
      }
    }).then(function (result) { if (result) { field.value = ''; } });
  }

  function onShield(event) {
    var button = event.target.closest('button[data-mode]');
    if (!button) { return; }
    var mode = button.getAttribute('data-mode');
    var out = $('shield-out');
    if (button.getAttribute('aria-pressed') === 'true') { say('The shield is already set that way.', 'note', out); return; }
    var confirm = null;
    if (mode === 'on') {
      confirm = {
        title: 'Raise the shield and keep it up?',
        lines: ['Every limit drops to a quarter for everyone outside the staff addresses.', 'A full class may find Ludora slower to join. It stays raised until you change this setting.'],
        yes: 'Keep it raised'
      };
    } else if (mode === 'off') {
      confirm = {
        title: 'Keep the shield down?',
        lines: ['The sentinel will no longer tighten the limits by itself when many addresses misbehave at once.', 'Bans still work. Do this only when the shield is getting in the way of a lesson.'],
        yes: 'Keep it down',
        danger: true
      };
    }
    act({ action: 'shield', mode: mode }, {
      button: button,
      near: out,
      working: 'Changing the shield.',
      done: mode === 'auto' ? 'The sentinel decides when the shield goes up.' : mode === 'on' ? 'The shield is raised.' : 'The shield is kept down.',
      confirm: confirm
    });
  }

  function onLockdown() {
    var on = !(state.overview && state.overview.lockdown);
    act({ action: 'lockdown', on: on }, {
      button: $('lock-toggle'),
      near: $('lock-out'),
      working: on ? 'Closing Ludora to everyone outside the staff addresses.' : 'Opening Ludora again.',
      done: on ? 'Lockdown is on.' : 'Lockdown is off.',
      confirm: on ? {
        title: 'Turn lockdown on?',
        lines: ['Ludora closes straight away to everyone outside the staff addresses.', 'Students in a game are cut off and lose that game.', 'It stays closed until someone turns lockdown off here or at the server.'],
        yes: 'Turn lockdown on',
        danger: true
      } : null
    });
  }

  /* ------------------------------------------------------------------ health */

  function renderHealthFacts(o) {
    var b = backupWords(o.backups), s = supportWords(o.support), a = analystWords(o.analyst);
    setText($('backup-now'), b.text);
    setText($('support-now'), o.support ? 'Support access is open. ' + s.text.replace(/^Open f/, 'F') : 'Support access is closed.');
    show($('support-close'), !!o.support);
    setText($('analyst-now'), a.text);
    if (!state.doctor) { setText($('doctor-sum'), doctorWords(o.doctor).text); }
  }

  async function loadDoctor() {
    try {
      var d = await api('/api/doctor');
      state.doctor = d;
      state.doctorAt = d.at;
      renderDoctor(d);
    } catch (e) {
      if (!(e instanceof SignedOut)) { say(e.message, 'bad', $('doctor-out')); }
    }
  }

  function renderDoctor(d) {
    var order = { fail: 0, unknown: 1, pass: 2 };
    var words = { fail: ['bad', '[failed]'], unknown: ['warn', '[unsure]'], pass: ['ok', '[passed]'] };
    var checks = (Array.isArray(d.checks) ? d.checks : []).filter(function (c) { return c && typeof c === 'object'; }).slice(0, 200);
    checks = checks.map(function (c, i) { return { c: c, i: i }; }).sort(function (a, b) {
      var x = order[a.c.state] === undefined ? 1 : order[a.c.state];
      var y = order[b.c.state] === undefined ? 1 : order[b.c.state];
      return x - y || a.i - b.i;
    }).map(function (pair) { return pair.c; });
    setText($('doctor-sum'), doctorWords(d).text);
    var list = $('checks');
    empty(list);
    checks.forEach(function (c) {
      var kind = words[c.state] ? c.state : 'unknown';
      list.appendChild(el('li', { class: 'check check--' + kind },
        tag(words[kind][0], words[kind][1]),
        el('span', { class: 'check-title', text: clean(c.title, 200) }),
        el('span', { class: 'check-detail', text: sentence(c.detail) })));
    });
  }

  async function onDoctor() {
    var result = await act({ action: 'doctor' }, {
      button: $('doctor-run'),
      near: $('doctor-out'),
      working: 'Running the self-check. This takes up to a minute.',
      done: 'The self-check ran.'
    });
    if (result) { loadDoctor(); }
  }

  function onRestart(event) {
    var button = event.target.closest('button[data-restart]');
    if (!button) { return; }
    var what = button.getAttribute('data-restart');
    act({ action: 'restart', what: what }, {
      button: button,
      near: $('restart-out'),
      working: what === 'app' ? 'Restarting Ludora.' : 'Restarting the secure connection.',
      done: 'Restarted.',
      confirm: what === 'app' ? {
        title: 'Restart Ludora?',
        lines: ['Everyone playing is disconnected for up to a minute, and games in progress may be lost.', 'Accounts, quizzes and results are not affected.'],
        yes: 'Restart Ludora',
        danger: true
      } : {
        title: 'Restart the secure connection?',
        lines: ['Every open page loses its connection for a few seconds, and this dashboard may too.', 'Games usually reconnect by themselves.'],
        yes: 'Restart it',
        danger: true
      }
    });
  }

  /* ------------------------------------------------------------------ setup */

  function setDone(id, done) {
    var node = $(id);
    node.className = 'done ' + (done ? 'is-done' : 'is-todo');
    setText(node, done ? '[x] Done' : '[ ] Not done yet');
  }

  /* The server's own wording points at its command line for two problems that this page can fix itself. */
  function plainProblem(text) {
    var s = sentence(text);
    if (/mail account has no password/i.test(s)) { return 'The mail account has no password saved yet. Type it in the password box in step 2, Email, and save.'; }
    if (/TELEGRAM_BOT_TOKEN is not set/i.test(s)) { return 'A Telegram chat is on a list, but no bot token is saved. Add it under "Using Telegram?" in step 3.'; }
    return s;
  }

  function fillProblems(id, problems) {
    var list = $(id);
    var items = (Array.isArray(problems) ? problems : []).map(plainProblem).filter(Boolean);
    empty(list);
    items.forEach(function (text) { list.appendChild(el('li', { text: text })); });
    show(list, items.length > 0);
  }

  function settingValue(key) {
    var s = state.settings && state.settings[key];
    return s && s.value !== undefined && s.value !== null ? clean(s.value, 400) : '';
  }

  /* parts: which steps to refill from the server. Steps you are still editing are left alone. */
  async function loadSetup(parts) {
    var all = !parts;
    parts = parts || { domain: true, email: true, alerts: true, more: true };
    show($('setup-error'), false);
    try {
      var got = await Promise.all([api('/api/setup'), api('/api/settings')]);
      var setup = got[0];
      state.setup = setup;
      state.settings = (got[1].settings && typeof got[1].settings === 'object') ? got[1].settings : {};
      state.secrets = (got[1].secrets && typeof got[1].secrets === 'object') ? got[1].secrets : {};
      state.setupLoaded = true;

      var done = setup.done || {};
      setDone('done-domain', !!done.domain);
      setDone('done-email', !!done.email);
      setDone('done-alerts', !!done.alerts);
      fillProblems('email-problems', setup.email && setup.email.problems);
      fillProblems('alerts-problems', setup.alerts && setup.alerts.problems);
      secretHints();

      if (parts.domain) { fillDomain(setup.domain || {}); }
      if (parts.email) { fillEmail(setup.email || {}); }
      if (parts.alerts) { fillLists(setup.alerts || {}); }
      if (parts.more) { fillMore(); }
      if (all) { announce('Setup loaded.', false); }
    } catch (e) {
      if (e instanceof SignedOut) { return; }
      setText($('setup-error'), e.message);
      show($('setup-error'), true);
    }
  }

  function secretHints() {
    setText($('smtp-pass-help'), state.secrets.smtp_password
      ? 'A password is saved. Leave this empty to keep it. The saved one is never shown.'
      : 'No password is saved yet. For Gmail and some others this is an "app password" made for this purpose, not the one you sign in with.');
    setText($('tg-token-help'), state.secrets.telegram_token
      ? 'A token is saved. Type a new one only to replace it. The saved one is never shown.'
      : 'No token is saved yet.');
  }

  /* --- step 1: domain --- */

  function fillDomain(domain) {
    var current = clean(domain.current, 253);
    setText($('dom-current'), domain.is_name
      ? 'People open Ludora at ' + current + ' now.'
      : current
        ? 'Right now people open Ludora by typing the numbers ' + current + '. A name is easier to remember, and lets browsers show a proper padlock.'
        : 'No address is set yet.');
    var mode = domain.tls_mode;
    show($('cert-custom'), mode === 'custom');
    /* refill the form only when nobody has typed into it since it was last filled */
    var field = $('dom-name');
    var filled = domain.is_name ? current : '';
    if (state.domFilled === undefined || field.value === state.domFilled) {
      field.value = filled;
      Array.prototype.forEach.call(document.querySelectorAll('input[name="cert"]'), function (radio) { radio.checked = radio.value === mode; });
      show($('dns-result'), false);
      state.lastDns = null;
      setText($('dom-name-err'), '');
    }
    state.domFilled = filled;
    if (state.overview) { renderLastChange(state.overview.last_change || null); }
    recordLines();
  }

  function domainName() { return $('dom-name').value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[\/.]+$/, ''); }

  function recordLines() {
    var name = domainName();
    var box = $('dom-record');
    var list = $('dom-record-lines');
    if (!RE_NAME.test(name)) { show(box, false); return; }
    var addresses = ((state.setup && state.setup.domain && state.setup.domain.server_addresses) || [])
      .map(function (a) { return clean(a, 60); })
      .filter(function (a) { return RE_IP4.test(a) || RE_IP6.test(a); });
    empty(list);
    if (!addresses.length) {
      list.appendChild(el('li', { text: 'The server did not say what its address is. Find it on the server\'s own screen, then ask for an A record for ' + name + ' pointing to it.' }));
    }
    addresses.forEach(function (address) {
      var kind = RE_IP4.test(address) ? 'An A record' : 'An AAAA record';
      list.appendChild(el('li', null,
        kind + ' for ' + name + ' pointing to ' + address,
        el('span', { class: 'hint', text: isPrivate(address)
          ? 'This is an inside address. Use it for a name that only needs to work inside the school.'
          : 'This is a public address. Use it for a name that should also work from home.' })));
    });
    show(box, true);
  }

  function checkedName() {
    var name = domainName();
    var field = $('dom-name');
    var error = $('dom-name-err');
    field.removeAttribute('aria-invalid');
    setText(error, '');
    if (!RE_NAME.test(name)) {
      field.setAttribute('aria-invalid', 'true');
      setText(error, name ? 'That does not look like a full name. It should be like play.yourschool.example, with no spaces.' : 'Type the name first.');
      field.focus();
      return '';
    }
    return name;
  }

  async function onDnsCheck() {
    var name = checkedName();
    var box = $('dns-result');
    var button = $('dns-check');
    if (!name || busyNow()) { return; }
    begin(button, 'Looking up ' + name + '.');
    try {
      var r = await api('/api/dns-check', { name: name }, 30000);
      var to = (Array.isArray(r.resolves_to) ? r.resolves_to : []).map(function (a) { return clean(a, 60); }).filter(Boolean);
      var here = (Array.isArray(r.server_addresses) ? r.server_addresses : []).map(function (a) { return clean(a, 60); }).filter(Boolean);
      state.lastDns = { name: name, matches: !!r.matches, isPublic: !!r.public };
      empty(box);
      var head, more;
      if (r.matches) {
        head = name + ' points to this server.';
        more = r.public
          ? 'It can be reached from the internet, so a free public certificate will work.'
          : 'It answers with an inside address, so choose the server\'s own certificate.';
      } else if (!to.length) {
        head = name + ' does not point anywhere yet.';
        more = 'Ask for the record above. If it was added a short while ago, wait a little and check again.';
      } else {
        head = name + ' points to ' + to.join(', ') + ', which is not this server' + (here.length ? ' (' + here.join(', ') + ')' : '') + '.';
        more = 'Ask whoever manages the domain to change the record to the address above.';
      }
      box.className = 'result ' + (r.matches ? 'is-ok' : 'is-bad');
      add(box, [
        el('p', null, tag(r.matches ? 'ok' : 'bad', r.matches ? '[yes]' : '[not yet]'), ' ', el('strong', { text: head })),
        el('p', { text: more }),
        r.advice ? el('p', { class: 'hint', text: sentence(r.advice) }) : null
      ]);
      show(box, true);
      var anyCert = document.querySelector('input[name="cert"]:checked');
      if (r.matches && !anyCert) {
        document.querySelector('input[name="cert"][value="' + (r.public ? 'public' : 'internal') + '"]').checked = true;
      }
      say(head, r.matches ? 'ok' : 'note');
    } catch (e) {
      if (!(e instanceof SignedOut)) {
        box.className = 'result is-bad';
        empty(box);
        box.appendChild(el('p', { text: e.message }));
        show(box, true);
        say(e.message, 'bad');
      }
    } finally {
      finish(button);
    }
  }

  async function onDomainApply() {
    var name = checkedName();
    var out = $('dom-out');
    if (!name) { return; }
    var cert = document.querySelector('input[name="cert"]:checked');
    if (!cert) { say('Choose one of the two certificates first.', 'bad', out); $('cert-choice').querySelector('input').focus(); return; }
    var lines = ['People will open Ludora at ' + name + '. Links that use the old address stop working.',
      'The secure connection restarts, so open pages drop for a few seconds. If you opened this dashboard with the old address, open it again with the new one.'];
    var checked = state.lastDns && state.lastDns.name === name ? state.lastDns : null;
    if (cert.value === 'public' && !(checked && checked.matches && checked.isPublic)) {
      lines.push('Warning: the check has not shown this name reaching the server from the internet. A public certificate cannot be made until it does, and browsers will show an error in the meantime.');
    } else if (!(checked && checked.matches)) {
      lines.push('Warning: the check has not shown this name pointing here yet. Until it does, nobody can open Ludora by this name.');
    }
    lines.push('The server then checks that the site still answers. If it does not, it puts the old address back by itself. This can take about a minute.');
    show($('dom-next'), false);
    var result = await act({ action: 'set', changes: { DOMAIN: name, TLS_MODE: cert.value } }, {
      button: $('dom-apply'),
      near: out,
      working: 'Changing the address to ' + name + ' and checking the site still answers. This can take about a minute.',
      done: 'Ludora now answers at ' + name + '.',
      confirm: { title: 'Use ' + name + ' as the address?', lines: lines, yes: 'Use this name', danger: true }
    });
    if (result && !result.moving) {
      loadSetup({ domain: true });
      dashboardLink(name);
    }
  }

  /* After the name changes, this dashboard is also reached by the new name (on the same port). */
  function dashboardLink(name) {
    var box = $('dom-next');
    var here = window.location.hostname.toLowerCase();
    empty(box);
    if (!RE_NAME.test(name) || here === name) { show(box, false); return; }
    var address = window.location.protocol + '//' + name + (window.location.port ? ':' + window.location.port : '') + '/';
    add(box, ['This dashboard now answers at the new name too. If something here stops working, open it at ',
      el('a', { href: address, rel: 'noopener noreferrer', text: address }), ' and sign in again.']);
    show(box, true);
  }

  /* --- step 2: email --- */

  function presets() {
    var list = state.setup && state.setup.email && state.setup.email.presets;
    return (Array.isArray(list) ? list : []).filter(function (p) { return p && typeof p === 'object'; }).slice(0, 30);
  }

  function fillEmail() {
    var select = $('smtp-preset');
    var host = settingValue('SMTP_HOST');
    empty(select);
    select.appendChild(el('option', { value: '', text: 'Choose one' }));
    presets().forEach(function (p, i) { select.appendChild(el('option', { value: String(i), text: clean(p.label, 80) })); });
    select.appendChild(el('option', { value: 'other', text: 'Another mail server' }));
    $('smtp-host').value = host;
    var port = settingValue('SMTP_PORT') || '587';
    var portSelect = $('smtp-port');
    Array.prototype.forEach.call(portSelect.querySelectorAll('[data-extra]'), function (o) { portSelect.removeChild(o); });
    if (MAIL_PORTS.indexOf(port) < 0 && /^\d{1,5}$/.test(port)) {
      portSelect.appendChild(el('option', { value: port, 'data-extra': 'yes', text: port + ' (set at the server)' }));
    }
    portSelect.value = port;
    $('smtp-security').value = settingValue('SMTP_SECURITY') === 'tls' ? 'tls' : 'starttls';
    $('smtp-user').value = settingValue('SMTP_USER');
    $('smtp-from').value = settingValue('SMTP_FROM');
    $('smtp-pass').value = '';
    var match = -1;
    presets().forEach(function (p, i) { if (host && clean(p.host, 253).toLowerCase() === host.toLowerCase()) { match = i; } });
    select.value = match >= 0 ? String(match) : host ? 'other' : '';
    presetNote();
  }

  function presetNote() {
    var p = presets()[Number($('smtp-preset').value)];
    setText($('smtp-preset-note'), p && $('smtp-preset').value !== '' ? clean(p.note, 300) : '');
  }

  function onPreset() {
    var value = $('smtp-preset').value;
    var p = value === '' || value === 'other' ? null : presets()[Number(value)];
    if (p) {
      $('smtp-host').value = clean(p.host, 253);
      var presetPort = String(num(p.port, 587));
      $('smtp-port').value = MAIL_PORTS.indexOf(presetPort) >= 0 ? presetPort : '587';
      $('smtp-security').value = p.security === 'tls' ? 'tls' : 'starttls';
    }
    presetNote();
    if (value === 'other') { $('smtp-host').focus(); }
  }

  function focusNamedKey(message, form) {
    var fields = form.querySelectorAll('[data-key]');
    for (var i = 0; i < fields.length; i++) {
      if (message.indexOf(fields[i].getAttribute('data-key')) >= 0) {
        fields[i].setAttribute('aria-invalid', 'true');
        fields[i].focus();
        return;
      }
    }
  }

  async function onEmailSave(event) {
    event.preventDefault();
    var out = $('email-out');
    var button = $('email-save');
    var pass = $('smtp-pass');
    var form = $('email-form');
    if (busyNow(out)) { return; }
    Array.prototype.forEach.call(form.querySelectorAll('[aria-invalid]'), function (f) { f.removeAttribute('aria-invalid'); });
    function bad(field, text) { field.setAttribute('aria-invalid', 'true'); say(text, 'bad', out); field.focus(); }
    var host = $('smtp-host').value.trim();
    var port = $('smtp-port').value.trim();
    var from = $('smtp-from').value.trim();
    if (!host) { bad($('smtp-host'), 'Type the mail server, or pick a provider from the list.'); return; }
    if (!/^\d{1,5}$/.test(port)) { bad($('smtp-port'), 'Choose the port, usually 587.'); return; }
    if (from && !RE_MAIL.test(from)) { bad($('smtp-from'), 'The address alerts come from should be an email address.'); return; }
    var changes = {
      SMTP_HOST: host,
      SMTP_PORT: port,
      SMTP_SECURITY: $('smtp-security').value,
      SMTP_USER: $('smtp-user').value.trim(),
      SMTP_FROM: from
    };
    begin(button, 'Saving the email settings.', out);
    setText($('smtp-pass-ask'), '');
    try {
      var saved = await api('/api/action', { action: 'set', changes: changes }, ACTION_TIMEOUT_MS);
      var said = clean(saved.message, 400);
      /* a new mail server, port, encryption or account makes the server forget the saved password */
      var forgot = /password was forgotten/i.test(said);
      if (pass.value) {
        var typed = pass.value;
        pass.value = '';
        var secret = await api('/api/action', { action: 'secret', name: 'smtp_password', value: typed }, ACTION_TIMEOUT_MS);
        typed = '';
        said = said.replace(/\s*The mail password was forgotten[^.]*\.?[^.]*\.?$/i, '');
        said = (/^Nothing needed changing/i.test(said) ? 'The password is saved.' : said + ' The password is saved too.') + ' Send a test to check it works.';
        if (!secret || secret.ok === false) { throw new ApiError('The password could not be saved.', 0); }
        forgot = false;
      }
      finish(button);
      await loadSetup({ email: true });
      if (forgot) {
        say(said, 'note', out);
        setText($('smtp-pass-ask'), 'Type the mail account\'s password again and save, or alerts cannot be sent by email.');
        pass.focus();
      } else {
        say(said || 'Saved.', 'ok', out);
      }
    } catch (e) {
      if (!(e instanceof SignedOut)) {
        say(e.message, 'bad', out);
        focusNamedKey(e.message, form);
      }
    } finally {
      pass.value = '';
      if (state.busy) { finish(button); }
    }
  }

  async function sendTest(audience, button, out, mail) {
    if (busyNow(out)) { return; }
    if (mail) { mail.setAttribute('data-state', 'sending'); }
    var names = { security: 'security', upkeep: 'upkeep', cheat: 'fair play' };
    var result = await act({ action: 'alerts_test', audience: audience }, {
      button: button,
      near: out,
      working: audience ? 'Sending a test to the ' + names[audience] + ' list.' : 'Sending a test to every list.',
      done: 'The test was sent. Check that it arrived.'
    });
    /* the server answers "ok" even when a recipient could not be reached; its sentence says which */
    var missed = !!result && /NOT delivered/.test(String(result.message || ''));
    if (missed) {
      say(clean(result.message, 600) + ' Fix what it names, then try again.', 'bad', out);
    }
    if (mail) {
      mail.setAttribute('data-state', result && !missed ? 'sent' : 'failed');
      setTimeout(function () { mail.removeAttribute('data-state'); }, 8000);
    }
  }

  /* --- step 3: who is told --- */

  function buildLists() {
    var holder = $('lists');
    LISTS.forEach(function (list) {
      var inputId = 'add-' + list.id;
      var errorId = 'add-' + list.id + '-err';
      var mail = icon('mail');
      var input = el('input', { id: inputId, type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
        placeholder: 'name@yourschool.example', 'aria-describedby': errorId });
      var addButton = el('button', { type: 'button', class: 'btn', text: 'Add' });
      var testButton = el('button', { type: 'button', class: 'btn btn--test', text: 'Send a test to this list' });
      var out = el('p', { class: 'say', id: 'out-' + list.id });
      var section = el('section', { class: 'list', 'aria-labelledby': 'list-' + list.id },
        el('h3', { id: 'list-' + list.id }, mail, list.title),
        el('p', { class: 'hint', text: list.gets }),
        el('ul', { class: 'chips', id: 'chips-' + list.id, 'aria-label': 'On the ' + list.title.toLowerCase() + ' list' }),
        el('div', { class: 'field' },
          el('label', { for: inputId, text: 'Add someone to ' + list.title.toLowerCase() }),
          el('div', { class: 'add-row' }, input, addButton),
          el('p', { class: 'say say--bad', id: errorId })),
        testButton,
        out);
      holder.appendChild(section);
      function addNow() { addEntry(list.id, input); }
      addButton.addEventListener('click', addNow);
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); addNow(); }
      });
      testButton.addEventListener('click', function () {
        if (listsDirty()) { say('Save the three lists first, so the test goes to the people you see here.', 'note', out); return; }
        if (!state.lists[list.id].length) { say('Nobody is on this list yet.', 'note', out); return; }
        sendTest(list.id, testButton, out, mail);
      });
    });
  }

  function listsDirty() { return JSON.stringify(state.lists) !== state.listsSaved; }

  function fillLists(alerts) {
    LISTS.forEach(function (list) {
      var entries = Array.isArray(alerts[list.id]) ? alerts[list.id] : [];
      state.lists[list.id] = entries.map(function (e) { return clean(e, 200).trim(); }).filter(Boolean).slice(0, 50);
    });
    state.listsSaved = JSON.stringify(state.lists);
    LISTS.forEach(function (list) { renderChips(list.id); });
  }

  function renderChips(id) {
    var holder = $('chips-' + id);
    var entries = state.lists[id];
    empty(holder);
    if (!entries.length) { holder.appendChild(el('li', { class: 'chips-none', text: 'Nobody yet.' })); }
    entries.forEach(function (entry, index) {
      var hidden = RE_MASKED.test(entry);
      var shown = hidden ? entry.replace(/\*+$/, '') + '…' : entry;
      var spoken = hidden ? 'the phone push topic starting ' + entry.slice(5).replace(/\*+$/, '') : entry;
      var remove = el('button', { type: 'button', 'aria-label': 'Remove ' + spoken, text: 'x' });
      remove.addEventListener('click', function () {
        state.lists[id].splice(index, 1);
        renderChips(id);
        announce(spoken + ' removed. Not saved yet.', false);
        $('add-' + id).focus();
      });
      holder.appendChild(el('li', { class: 'chip' + (hidden ? ' chip--hidden' : '') },
        el('span', { class: 'chip-text' }, shown, hidden ? el('span', { class: 'chip-note', text: ' (topic hidden)' }) : null),
        remove));
    });
    show($('lists-dirty'), listsDirty());
  }

  function addEntry(id, input) {
    var error = $('add-' + id + '-err');
    var raw = input.value.trim().replace(/,+$/, '');
    var entry = raw.replace(/^(ntfy|telegram):\s*/i, function (m, kind) { return kind.toLowerCase() + ':'; });
    input.removeAttribute('aria-invalid');
    setText(error, '');
    if (!entry) { return; }
    var problem = '';
    if (!(RE_MAIL.test(entry) || RE_NTFY.test(entry) || RE_TELEGRAM.test(entry)) || entry.length > 200) {
      problem = /^ntfy:/.test(entry) ? 'A phone push is ntfy: followed by a topic of 8 to 64 letters, digits, dashes or underscores.'
        : /^telegram:/.test(entry) ? 'A Telegram entry is telegram: followed by the chat number.'
          : 'That is not an email address, ntfy:topic or telegram:chat number.';
    } else if (state.lists[id].indexOf(entry) >= 0) {
      problem = 'That one is already on this list.';
    } else if (state.lists[id].length >= 50) {
      problem = 'This list is full.';
    }
    if (problem) {
      input.setAttribute('aria-invalid', 'true');
      setText(error, problem);
      announce(problem, true);
      return;
    }
    state.lists[id].push(entry);
    input.value = '';
    renderChips(id);
    announce(entry + ' added. Not saved yet.', false);
  }

  async function onListsSave() {
    var changes = {};
    LISTS.forEach(function (list) { changes[list.key] = state.lists[list.id].join(','); });
    var result = await act({ action: 'set', changes: changes }, {
      button: $('lists-save'),
      near: $('lists-out'),
      working: 'Saving the three lists.',
      done: 'The three lists are saved.'
    });
    if (result) {
      state.listsSaved = JSON.stringify(state.lists);
      show($('lists-dirty'), false);
      loadSetup({ alerts: true });
    }
  }

  async function onNtfy() {
    var box = $('ntfy-result');
    var result = await act({ action: 'ntfy_topic' }, { button: $('ntfy-make'), working: 'Making a topic name.', done: 'A topic name was made.' });
    if (!result) { return; }
    var topic = clean(result.topic, 80);
    empty(box);
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(topic)) {
      box.className = 'result is-bad';
      box.appendChild(el('p', { text: 'The server did not send back a usable topic name. Try again.' }));
      show(box, true);
      return;
    }
    box.className = 'result is-ok';
    add(box, [
      el('p', { text: 'Your new topic name:' }),
      el('strong', { class: 'topic', text: topic }),
      el('p', { text: clean(result.message, 400) }),
      el('p', { class: 'hint', text: 'Treat the name like a password. It is not on any list until you add it below and save the three lists.' })
    ]);
    var row = el('div', { class: 'actions' });
    LISTS.forEach(function (list) {
      var button = el('button', { type: 'button', class: 'btn', text: 'Add to ' + list.title.toLowerCase() });
      button.addEventListener('click', function () {
        var entry = 'ntfy:' + topic;
        if (state.lists[list.id].indexOf(entry) < 0) {
          state.lists[list.id].push(entry);
          renderChips(list.id);
          say('Added to ' + list.title.toLowerCase() + '. Save the three lists to keep it.', 'note');
        } else {
          say('It is already on that list.', 'note');
        }
      });
      row.appendChild(button);
    });
    box.appendChild(row);
    show(box, true);
  }

  async function onTelegram(event) {
    event.preventDefault();
    var field = $('tg-token');
    var out = $('tg-out');
    var value = field.value.trim();
    if (!value) { say('Paste the token BotFather gave you.', 'bad', out); field.focus(); return; }
    field.value = '';
    var result = await act({ action: 'secret', name: 'telegram_token', value: value }, {
      button: event.target.querySelector('button[type="submit"]'),
      near: out,
      working: 'Saving the token.',
      done: 'The token is saved.'
    });
    value = '';
    if (result) { state.secrets.telegram_token = true; secretHints(); }
  }

  /* --- other settings, labelled by the server --- */

  function fillMore() {
    var holder = $('more-fields');
    empty(holder);
    MORE_KEYS.forEach(function (key) {
      var s = state.settings[key];
      if (!s) { return; }
      var id = 'more-' + key.toLowerCase().replace(/_/g, '-');
      var help = clean(s.help, 300);
      var input = el('input', { id: id, type: 'text', 'data-key': key, autocomplete: 'off', spellcheck: 'false', 'aria-describedby': help ? id + '-help' : null });
      input.value = clean(s.value, 400);
      holder.appendChild(el('div', { class: 'field' },
        el('label', { for: id, text: clean(s.label, 120) || MORE_LABELS[key] }),
        input,
        help ? el('p', { class: 'hint', id: id + '-help', text: help }) : null));
    });
  }

  async function onMoreSave(event) {
    event.preventDefault();
    var form = $('more-form');
    var changes = {};
    Array.prototype.forEach.call(form.querySelectorAll('[data-key]'), function (field) {
      field.removeAttribute('aria-invalid');
      var key = field.getAttribute('data-key');
      if (field.value.trim() !== settingValue(key)) { changes[key] = field.value.trim(); }
    });
    if (!Object.keys(changes).length) { say('Nothing was changed.', 'note', $('more-out')); return; }
    if (busyNow($('more-out'))) { return; }
    var button = form.querySelector('button[type="submit"]');
    begin(button, 'Saving these settings.', $('more-out'));
    try {
      var r = await api('/api/action', { action: 'set', changes: changes }, ACTION_TIMEOUT_MS);
      say(clean(r.message, 300) || 'Saved.', 'ok', $('more-out'));
      finish(button);
      await loadSetup({ more: true });
    } catch (e) {
      if (!(e instanceof SignedOut)) { say(e.message, 'bad', $('more-out')); focusNamedKey(e.message, form); }
    } finally {
      if (state.busy) { finish(button); }
    }
  }

  /* ------------------------------------------------------------------ logs */

  async function loadLogs() {
    var picked = document.querySelector('input[name="logwhat"]:checked');
    var what = picked ? picked.value : 'app';
    var lines = num($('log-lines').value, 100);
    var out = $('log-out');
    var list = $('loglines');
    out.className = 'say';
    setText(out, 'Fetching the lines.');
    try {
      var r = await api('/api/logs?what=' + encodeURIComponent(what) + '&lines=' + encodeURIComponent(lines));
      var rows = (Array.isArray(r.lines) ? r.lines : []).slice(-200);
      state.logsLoaded = true;
      empty(list);
      rows.forEach(function (text) { list.appendChild(el('li', { text: clean(String(text).replace(/\t/g, '    '), 2000) })); });
      setText(out, rows.length ? 'Showing the last ' + plural(rows.length, 'line', 'lines') + ', fetched at ' + clock(new Date()) + '.' : 'This part has written nothing yet.');
      $('logpane').scrollTop = $('logpane').scrollHeight;
    } catch (e) {
      if (e instanceof SignedOut) { return; }
      out.className = 'say say--bad';
      setText(out, e.message);
    }
  }

  /* ------------------------------------------------------------------ keyboard */

  function typing(target) {
    if (!target || !target.tagName) { return false; }
    var name = target.tagName.toLowerCase();
    return name === 'input' || name === 'textarea' || name === 'select' || target.isContentEditable;
  }

  function onKey(event) {
    if (!state.signedIn || state.move || !state.keysOn || event.defaultPrevented) { return; }
    if (event.ctrlKey || event.metaKey || event.altKey) { return; }
    if (typing(event.target) || document.querySelector('dialog[open]')) { return; }
    var key = event.key;
    if (key >= '1' && key <= '5') { event.preventDefault(); go(VIEWS[Number(key) - 1]); return; }
    if (key === '?') { event.preventDefault(); openKeys(); return; }
    if (key === 'r' || key === 'R') { event.preventDefault(); refresh(); return; }
    if (key === '/') {
      event.preventDefault();
      if (state.view !== 'security') { go('security'); }
      window.setTimeout(function () { $('ev-filter').focus(); }, 0);
    }
  }

  function openKeys() {
    var dialog = $('keys');
    $('keys-on').checked = state.keysOn;
    if (typeof dialog.showModal === 'function' && !dialog.open) { dialog.showModal(); $('keys-close').focus(); }
  }

  function refresh() {
    if (state.view === 'setup') { loadSetup(listsDirty() ? { domain: true, email: true, more: true } : null); }
    else if (state.view === 'logs') { loadLogs(); }
    else {
      if (state.view === 'health') { loadDoctor(); }
      pollNow();
    }
    announce('Refreshed.', false);
  }

  /* ------------------------------------------------------------------ start */

  function wire() {
    $('signin-form').addEventListener('submit', onSignIn);
    $('signout').addEventListener('click', function () { signOut('out'); });
    $('open-keys').addEventListener('click', openKeys);
    $('keys-close').addEventListener('click', function () { $('keys').close(); });
    $('keys-on').addEventListener('change', function () {
      state.keysOn = $('keys-on').checked;
      store('local', 'ludora-dash-keys', state.keysOn ? null : 'off');
    });
    $('msg-x').addEventListener('click', function () { say(''); });
    $('last-change-x').addEventListener('click', function () {
      store('session', 'ludora-dash-seen-change', $('last-change').getAttribute('data-at'));
      show($('last-change'), false);
      $('h-overview').focus();
    });
    $('idle-stay').addEventListener('click', stay);
    $('idle-out').addEventListener('click', function () { signOut('out'); });
    $('idle').addEventListener('cancel', function (event) { event.preventDefault(); stay(); });

    Array.prototype.forEach.call($('rail').querySelectorAll('a'), function (link) {
      link.addEventListener('click', function () { state.navByUser = true; });
    });
    window.addEventListener('hashchange', function () {
      var byUser = state.navByUser;
      state.navByUser = false;
      if (state.signedIn) { route(byUser || true); }
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { clearTimeout(state.pollTimer); } else { pollNow(); }
    });
    document.addEventListener('keydown', onKey);
    ['keydown', 'pointerdown', 'wheel', 'touchstart'].forEach(function (name) {
      document.addEventListener(name, touch, { passive: true, capture: true });
    });

    $('ban-form').addEventListener('submit', onBan);
    $('shield-modes').addEventListener('click', onShield);
    $('lock-toggle').addEventListener('click', onLockdown);
    $('ev-filter').addEventListener('change', renderEvents);

    $('dom-name').addEventListener('input', recordLines);
    $('dns-check').addEventListener('click', onDnsCheck);
    $('dom-apply').addEventListener('click', onDomainApply);
    $('smtp-preset').addEventListener('change', onPreset);
    $('email-form').addEventListener('submit', onEmailSave);
    $('email-test').addEventListener('click', function () {
      sendTest(null, $('email-test'), $('email-out'), $('email-test-ico').firstElementChild);
    });
    buildLists();
    $('lists-save').addEventListener('click', onListsSave);
    $('ntfy-make').addEventListener('click', onNtfy);
    $('tg-form').addEventListener('submit', onTelegram);
    $('more-form').addEventListener('submit', onMoreSave);

    $('doctor-run').addEventListener('click', onDoctor);
    $('view-health').addEventListener('click', onRestart);
    $('backup-run').addEventListener('click', function () {
      act({ action: 'backup' }, { button: $('backup-run'), near: $('backup-out'), working: 'Backing up now. This can take a couple of minutes.', done: 'The backup is made.' });
    });
    $('support-close').addEventListener('click', function () {
      act({ action: 'support_close' }, {
        button: $('support-close'), near: $('support-out'), working: 'Closing support access.', done: 'Support access is closed.',
        confirm: {
          title: 'Close support access now?',
          lines: ['The helper is cut off straight away and cannot connect again.', 'Opening it again is done at the server\'s own screen.'],
          yes: 'Close support access',
          danger: true
        }
      });
    });

    $('log-what').addEventListener('change', loadLogs);
    $('log-lines').addEventListener('change', loadLogs);
    $('log-refresh').addEventListener('click', loadLogs);
  }

  async function start() {
    var why = store('session', 'ludora-dash-left');
    store('session', 'ludora-dash-left', null);
    var moved = store('session', 'ludora-dash-moved');
    var movedLine = $('signin-moved');
    empty(movedLine);
    if (moved && /^https:\/\/[a-z0-9.-]{1,253}(:\d{1,5})?\/$/i.test(moved) && moved.indexOf('//' + window.location.host + '/') < 0) {
      add(movedLine, ['The server was changing its address. If this page does not let you in, open ',
        el('a', { href: moved, text: moved }), ' instead.']);
    }
    show(movedLine, movedLine.childNodes.length > 0);
    state.keysOn = store('local', 'ludora-dash-keys') !== 'off';
    try {
      state.session = await api('/api/session');
    } catch (e) {
      state.session = state.session || {};
      showSignIn(e.message + ' Trying again in a few seconds.', true);
      window.setTimeout(start, 5000);
      return;
    }
    if (state.session.signed_in) {
      enterApp();
      if (why === 'reconnected' || why === 'back') { say('The server is back and this page is connected again.', 'ok', $('restart-out')); }
      return;
    }
    showSignIn(why === 'idle' ? 'You were signed out because nobody used the dashboard for a while.'
      : why === 'expired' ? 'Your sign-in ended. Sign in again to carry on.'
        : why === 'out' ? 'You are signed out.'
          : why === 'back' ? 'The server is back at this address. Sign in again to see what happened to the change.'
            : why === 'reconnected' ? 'The server is back. Sign in again to carry on.' : '', false);
  }

  wire();
  start();
}());
