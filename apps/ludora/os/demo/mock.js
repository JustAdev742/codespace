/* The pretend server behind the dashboard demo.
 *
 * The demo page is the real dashboard (dash/index.html, dash.css, dash.js, unchanged) with this
 * script loaded first. It replaces fetch() for /api/ addresses with a small world kept in the page,
 * a JavaScript port of tests/dash_mock.py: the same answers, refusals and waits, so the dashboard
 * behaves as it does on a server. Nothing leaves the page and no real server is involved.
 *
 * What differs from the real thing, on purpose:
 *   - the viewer starts signed in (the password is shown in the demo bar for after signing out);
 *   - a change of address or certificate comes back to this page instead of moving to the new name;
 *   - sign-in pauses for one minute after five wrong tries, not fifteen;
 *   - the world lives in this tab's session storage, so a reload keeps it and closing the tab ends it.
 */
(function () {
  'use strict';

  var KEY = 'ludora-dash-demo';
  var PASSWORD = 'correct horse battery';
  var IDLE_MINUTES = 15;
  var DELAY = 1.2;
  var SITE_WAIT = 8;
  var PAUSE = 60;
  var TRIES = 5;
  var WINDOW = 15 * 60;
  var SERVER = 'ludora-school';
  var VERSION = '1.0.0';
  var ADDRESSES = ['10.20.0.5', '203.0.113.7'];
  var STAFF_NET = '10.20.9.';
  var CLIENT = '10.20.9.14';
  var MAIL_KEYS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURITY', 'SMTP_USER'];
  var MAIL_PORTS = [25, 465, 587, 2525];
  var ALERT_KEYS = ['ALERT_SECURITY_TO', 'ALERT_UPKEEP_TO', 'ALERT_CHEAT_TO'];
  var AUDIENCES = { security: ['ALERT_SECURITY_TO', 'Security'], upkeep: ['ALERT_UPKEEP_TO', 'Upkeep'], cheat: ['ALERT_CHEAT_TO', 'Fair play'] };
  var MASK = '****';

  var LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
  var FQDN = new RegExp('^(?=.{1,253}$)' + LABEL + '(?:\\.' + LABEL + ')*$');
  var IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
  var MAIL = /^[A-Za-z0-9._+-]{1,64}@(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
  var NTFY_TOPIC = /^[A-Za-z0-9_-]{8,64}$/;
  var TELEGRAM_CHAT = /^-?[0-9]{5,20}$/;
  var TELEGRAM_TOKEN = /^[0-9]{6,12}:[A-Za-z0-9_-]{30,50}$/;
  var TEXT_EXTRA = " .,'@:/_+()&-!?";

  var SETTINGS = {
    DOMAIN: ['The address people open', "The address people open: a name such as play.your-school.org, or the server's IPv4 address."],
    TLS_MODE: ['Certificate', "public: a free certificate from Let's Encrypt (the name must be reachable from the internet). internal: the server's own certificate authority, for a school network. custom: your own certificate in /etc/ludora-os/tls."],
    OPERATOR_NAME: ['Who runs this server', 'Who runs this copy. Shown on the privacy policy.'],
    OPERATOR_CONTACT: ['Contact for privacy questions', 'How people reach you about their data. Shown on the privacy policy.'],
    ALERT_SECURITY_TO: ['Told about attacks', 'Who is told about attacks: bans, floods, impersonation, lockdown, support access. Email addresses, ntfy:<topic> or telegram:<chat number>, separated by commas.'],
    ALERT_UPKEEP_TO: ['Told when the server needs care', 'Who is told when the server needs care: a failed backup or update, a self-check that starts failing, a full disk.'],
    ALERT_CHEAT_TO: ['Told about likely cheating', 'Who is told when Ludora spots likely cheating in a game.'],
    ALERT_QUIET_MINUTES: ['Minutes between alert batches', 'After an alert about bans, further ones are saved up and sent together after this many minutes.'],
    SMTP_HOST: ['Mail server', "The mail server that sends alert emails, e.g. smtp.gmail.com or the school's own. Needed for email recipients."],
    SMTP_PORT: ['Mail server port', 'Its port: 587 (the usual) or 465.'],
    SMTP_SECURITY: ['Mail encryption', 'starttls for port 587, tls for port 465. Mail is never sent unencrypted.'],
    SMTP_USER: ['Mail account', 'The account the server signs in to the mail server with. Its password is set with `ludoractl alerts secret smtp-password`.'],
    SMTP_FROM: ['Address alerts come from', 'The address alerts come from. Usually the same as the account.'],
    NTFY_SERVER: ['Phone push server', 'The ntfy server for phone pushes. ntfy.sh is free and public; a school can run its own.']
  };
  var SETTING_KEYS = Object.keys(SETTINGS);
  var PRESETS = [
    { id: 'google', label: 'Google Workspace or Gmail', host: 'smtp.gmail.com', port: 587, security: 'starttls',
      note: "Use the account's address, and an app password made in the Google account's security settings (not its normal password)." },
    { id: 'microsoft', label: 'Microsoft 365 or Outlook', host: 'smtp.office365.com', port: 587, security: 'starttls',
      note: 'The account must be allowed to send with SMTP ("authenticated SMTP"), which your Microsoft 365 administrator switches on per mailbox.' },
    { id: 'other', label: 'Another mail server', host: '', port: 587, security: 'starttls',
      note: "Ask whoever runs the school's email for the server name, port, account and password." }
  ];
  var CHECKS = [
    'SELinux is enforcing|Enforcing',
    "The firewall is loaded and refuses by default|the ludora table's input chain drops what it does not know",
    'The root account cannot sign in|locked',
    'No account has an empty password|none',
    "SSH matches the settings|SSH is off; the server is managed from its own screen",
    'Nothing unexpected is listening|only the decoy ports and what the settings allow',
    'Kernel hardening settings are in effect|31 settings checked',
    'The disk is encrypted|a LUKS volume is in use',
    'The clock is synchronised|in step with a time server',
    'Operating system updates are installed|nothing waiting',
    'Ludora answers its health check|healthy',
    'The sentinel is watching|last report 4s ago',
    'A backup was made in the last day and a half|newest is 5 hours old; 7 kept',
    'There is room on the disk|/var is 41% full',
    'Generated files match the settings|no file was changed outside ludoractl',
    'Every set-uid program came from a signed package|14 programs, all from packages',
    'The boot menu needs a password to edit|set',
    'Container images are pinned to exact versions|database and proxy pinned by digest',
    'System files are unchanged since the last baseline|no change in 48,112 files',
    'Security auditing is recording|running',
    'USB devices are restricted|running'
  ];
  /* Text an attacker chose, kept as text: the dashboard shows it and never runs it. */
  var HOSTILE = [
    '10.20.3.41 asked for /<script>alert("dash")</script> and 2 other pages that only other software has. Banned for 15 min.',
    'Game K7QX: a player calling themselves "<img src=x onerror=alert(1)>" answered five questions faster than a person can.',
    "Game R2MD: a player calling themselves \" gnp.exe  teacher\" sent messages the game's own screens never send.",
    '10.20.3.52 tried to sign in to Ludora as "admin\'--" 20 times in five minutes. Banned for 60 min.'
  ];

  function Refused(message) { this.message = message; }

  function nowS() { return Date.now() / 1000; }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
  function between(low, high) { return low + Math.floor(Math.random() * (high - low + 1)); }
  function commas(n) { return n.toLocaleString('en-US'); }
  function clean(text, limit) {
    var out = String(text).replace(/\p{C}/gu, ' ').split(/\s+/).filter(Boolean).join(' ');
    limit = limit || 300;
    return out.length <= limit ? out : out.slice(0, limit - 3).replace(/\s+$/, '') + '...';
  }
  function split(value) { return String(value).trim().split(/[,\s]+/).filter(Boolean); }
  function mask(r) { var i = r.indexOf(':'); return i > 0 && r.slice(0, i) === 'ntfy' ? 'ntfy:' + r.slice(i + 1, i + 5) + MASK : r; }
  function hide(r) {
    var i = r.indexOf(':');
    if (i >= 0) { return r.slice(0, i) + ':' + r.slice(i + 1, i + 4) + '…'; }
    var at = r.indexOf('@');
    return r.slice(0, 2) + '…@' + (at >= 0 ? r.slice(at + 1) : '');
  }
  function isNumberish(name) { return /^\d+$/.test(name.replace(/\./g, '')); }

  /* ---------------------------------------------------------------- the world */

  var saved = null;
  try { saved = JSON.parse(window.sessionStorage.getItem(KEY) || 'null'); } catch (e) { saved = null; }
  var SCENARIO = saved && ['calm', 'watchful', 'attack'].indexOf(saved.scenario) >= 0 ? saved.scenario : 'attack';
  var W = saved && saved.world && saved.world.scenario === SCENARIO ? saved.world : seed(SCENARIO);

  function persist() {
    try { window.sessionStorage.setItem(KEY, JSON.stringify({ scenario: SCENARIO, world: W })); } catch (e) { /* the demo then starts afresh on a reload */ }
  }

  function seed(scenario) {
    var now = nowS();
    var w = {
      scenario: scenario,
      session: { since: now, seen: now },
      failures: [], paused: 0,
      settings: {
        DOMAIN: '10.20.0.5', TLS_MODE: 'internal',
        OPERATOR_NAME: 'Example School', OPERATOR_CONTACT: 'privacy@school.example',
        ALERT_SECURITY_TO: 'it@school.example,ntfy:ludora-k3j9x2m8q7wz', ALERT_UPKEEP_TO: 'it@school.example', ALERT_CHEAT_TO: '',
        ALERT_QUIET_MINUTES: '10',
        SMTP_HOST: '', SMTP_PORT: '587', SMTP_SECURITY: 'starttls', SMTP_USER: '', SMTP_FROM: '',
        NTFY_SERVER: 'https://ntfy.sh'
      },
      secrets: { smtp_password: false, telegram_token: false },
      shield_mode: 'auto', lockdown: false, bans: {}, events: [],
      doctor_at: now - 17 * 60, backups: 7, backup_at: now - 5.2 * 3600,
      support: null, analyst: { enabled: false, installed: false },
      last_event: now, next_host: 60, last_change: null, outage: [0, 0], move: null
    };
    function add(ago, severity, kind, text) { w.events.push({ at: Math.floor(now - ago), severity: severity, kind: kind, text: text }); }
    add(26 * 3600, 'info', 'sentinel', 'Sentinel started. Watching 9 decoy listeners, SSH and the web log.');
    add(22 * 3600, 'info', 'backup', 'Nightly backup made and encrypted (212 MB). 7 kept.');
    add(9 * 3600, 'warning', 'decoy', '10.20.3.17 connected to decoy port 3389. Banned for 15 min.');
    add(9 * 3600 - 900, 'info', 'ban', '10.20.3.17 is let back in: its 15 minutes are over.');
    add(5.2 * 3600, 'info', 'backup', 'Nightly backup made and encrypted (214 MB). 7 kept.');
    add(3 * 3600, 'notice', 'probe', '10.20.9.10 asked for /.env. Not banned: it is a staff address.');
    add(55 * 60, 'notice', 'integrity', HOSTILE[1]);
    add(17 * 60, 'info', 'doctor', 'Self-check: 21 passed, 0 failed, 1 could not be checked.');
    if (scenario === 'watchful') {
      add(6 * 60, 'warning', 'probe', HOSTILE[0]);
      add(4 * 60, 'warning', 'login', HOSTILE[3]);
      add(3 * 60, 'notice', 'level', 'Threat level: watchful.');
      w.bans = { '10.20.3.41': now + 9 * 60, '10.20.3.52': now + 56 * 60 };
    }
    if (scenario === 'attack') {
      w.support = { until: Math.floor(now + 100 * 60), from: '203.0.113.50' };
      w.analyst = { enabled: true, installed: true };
      add(8 * 60, 'warning', 'probe', HOSTILE[0]);
      add(7 * 60, 'warning', 'login', HOSTILE[3]);
      add(6 * 60, 'warning', 'decoy', '10.20.3.44 connected to decoy port 445. Banned for 15 min.');
      add(5 * 60, 'warning', 'flood', '10.20.3.45 made 912 requests in ten seconds. Banned for 15 min.');
      add(4 * 60 + 30, 'warning', 'flood', '10.20.3.46 made 1,404 requests in ten seconds. Banned for 60 min.');
      add(4 * 60, 'alert', 'shield', 'Shield raised: 5 addresses misbehaved within two minutes. Every limit is quartered for everyone outside the staff addresses.');
      add(3 * 60 + 40, 'alert', 'level', 'Threat level: under attack.');
      add(3 * 60, 'alert', 'gateway', 'The gateway 10.20.0.1 answered from a different device (hardware address changed). Someone may be pretending to be the gateway.');
      add(2 * 60, 'notice', 'integrity', HOSTILE[2]);
      add(90, 'info', 'alert-delivery', 'Security alert sent to 2 of 2 recipients.');
      [9, 52, 7, 10, 55, 12, 13, 14, 236].forEach(function (left, i) { w.bans['10.20.3.' + (41 + i)] = now + left * 60 + 20; });
    }
    return w;
  }

  function event(now, severity, kind, text) {
    W.events.push({ at: Math.floor(now), severity: severity, kind: kind, text: text });
    if (W.events.length > 400) { W.events.splice(0, W.events.length - 400); }
  }
  function record(text, severity) { event(nowS(), severity || 'notice', 'dashboard', 'Dashboard (' + CLIENT + '): ' + text); }

  /* Time passing: bans run out, and the scenario keeps producing what a real one would. */
  function advance() {
    var now = nowS();
    Object.keys(W.bans).forEach(function (ip) {
      if (W.bans[ip] <= now) { delete W.bans[ip]; event(now, 'info', 'ban', ip + ' is let back in: its ban is over.'); }
    });
    var gap = { calm: 45, watchful: 16, attack: 5 }[SCENARIO];
    if (now - W.last_event < gap) { return; }
    W.last_event = now;
    var p = Math.random();
    if (SCENARIO === 'calm') {
      event(now, 'info', 'sentinel', pick([
        'All quiet: 0 bans, 0 refused sign-ins in the last hour.',
        'Game P4TT started with 24 players.',
        'Game P4TT ended. 24 players, no integrity signals.',
        'Certificate checked: 61 days left.'
      ]));
    } else if (SCENARIO === 'watchful') {
      if (p < 0.5) { event(now, 'notice', 'probe', '10.20.3.' + between(60, 90) + ' asked for /wp-login.php. One more and it is banned.'); }
      else { event(now, 'info', 'sentinel', 'Still watchful: the last ban was a few minutes ago.'); }
    } else {
      W.next_host += 1;
      var ip = '10.20.4.' + (W.next_host % 200 + 20);
      if (p < 0.45 && Object.keys(W.bans).length < 16) {
        W.bans[ip] = now + pick([15, 15, 60]) * 60;
        event(now, 'warning', 'flood', ip + ' made ' + commas(between(640, 2400)) + ' requests in ten seconds. Banned for 15 min.');
      } else if (p < 0.7) {
        event(now, 'warning', 'decoy', ip + ' connected to decoy port ' + pick([23, 445, 3306, 3389, 5900]) + '. It is already refused.');
      } else if (p < 0.82) {
        event(now, 'alert', 'flood', commas(between(1100, 4200)) + ' connection attempts a second from made-up addresses. The extra ones are refused before they use any memory.');
      } else if (p < 0.92) {
        event(now, 'notice', 'integrity', pick(HOSTILE.slice(1, 3)));
      } else {
        event(now, 'info', 'alert-delivery', 'Security alert sent to 2 of 2 recipients.');
      }
    }
  }

  /* A change of address or certificate, after its answer has gone: the proxy restarts, everyone is
     signed out, and then either the site answers under the new settings or the old ones come back. */
  function settleMove() {
    var m = W.move;
    var now = nowS();
    if (!m) { return; }
    if (!m.cut && now >= m.start) {
      m.cut = true;
      W.session = null;
      W.settings = m.cfg;
    }
    if (now < m.until) { return; }
    var said = 'Saved and in effect: ' + m.changed.map(function (k) { return SETTINGS[k][0].toLowerCase(); }).join(', ') + '.';
    var first = m.cfg.DOMAIN.split('.')[0];
    if (m.cfg.TLS_MODE === 'public' && (first === 'ludora' || first === 'intranet')) {
      W.settings = m.before;
      W.last_change = { at: Math.floor(now), ok: false, message:
        'With that name and certificate the site stopped answering over HTTPS, so the change was undone. ' +
        'For a public certificate the name must reach this server from the internet on ports 80 and 443.' };
      record("a change to the site's address or certificate did not hold.", 'warning');
    } else {
      W.last_change = { at: Math.floor(now), ok: true, message: said };
      record('changed ' + m.changed.map(function (k) { return SETTINGS[k][0].toLowerCase(); }).join(', ') + '.');
    }
    W.move = null;
  }

  /* ---------------------------------------------------------------- readings */

  function recipients(key) { return split(W.settings[key]); }
  function everyone() { return ALERT_KEYS.reduce(function (all, key) { return all.concat(recipients(key)); }, []); }
  function isMail(r) { return r.indexOf('@') >= 0 && r.indexOf(':') < 0; }

  function mailProblems() {
    var out = [];
    if (everyone().some(isMail)) {
      if (!W.settings.SMTP_HOST) { out.push('Email recipients are set but SMTP_HOST is not: no mail server to send through.'); }
      else if (!W.settings.SMTP_FROM) { out.push('SMTP_FROM is not set: mail needs an address to come from.'); }
      else if (W.settings.SMTP_USER && !W.secrets.smtp_password) { out.push('The mail account has no password yet: run `ludoractl alerts secret smtp-password`.'); }
    }
    return out;
  }
  function problems() {
    var out = mailProblems();
    if (everyone().some(function (r) { return r.indexOf('telegram:') === 0; }) && !W.secrets.telegram_token) {
      out.push('A Telegram chat is listed but TELEGRAM_BOT_TOKEN is not set: run `ludoractl alerts secret telegram-token`.');
    }
    return out;
  }

  function doctor() {
    var checks = CHECKS.map(function (line) { var p = line.split('|'); return { state: 'pass', title: p[0], detail: p[1] }; });
    var age = (nowS() - W.backup_at) / 3600;
    checks.forEach(function (c) {
      if (c.title.indexOf('A backup was made') === 0) { c.detail = 'newest is ' + age.toFixed(0) + ' hours old; ' + W.backups + ' kept'; }
    });
    checks.push({ state: 'unknown', title: 'The certificate is valid for a while yet', detail: 'the site uses an address, not a name, so there is no public certificate to check' });
    if (SCENARIO === 'attack') {
      checks.splice(3, 0, { state: 'fail', title: 'The gateway is the device it was',
        detail: 'the gateway 10.20.0.1 changed hardware address at 10:41; a device on the network may be pretending to be it. Check the network cupboard, and treat any certificate warning in a browser as real' });
    }
    function count(state) { return checks.filter(function (c) { return c.state === state; }).length; }
    return { at: Math.floor(W.doctor_at), passed: count('pass'), failed: count('fail'), unknown: count('unknown'),
      checks: checks.map(function (c) { return { state: c.state, title: clean(c.title, 600), detail: clean(c.detail, 600) }; }) };
  }

  function overview() {
    var now = nowS();
    var report = doctor();
    var attention = [];
    if ((now - W.backup_at) / 3600 > 36) { attention.push('no recent backup'); }
    if (SCENARIO === 'attack') { attention.push('under attack'); }
    if (report.failed) { attention.push(report.failed + ' self-check' + (report.failed !== 1 ? 's' : '') + ' failing'); }
    if (W.lockdown) { attention.push('lockdown is on'); }
    var wobble = 0.5 + 0.5 * Math.sin(now / 7.0);
    var busy = { calm: 1.0, watchful: 1.6, attack: 30.0 }[SCENARIO];
    function r1(n) { return Math.round(n * 10) / 10; }
    var rates = {
      'web requests': r1((38 + 30 * wobble) * busy + Math.random() * 6),
      'new connections': r1((6 + 5 * wobble) * busy + Math.random() * 2),
      'refused at the firewall': r1({ calm: 0.2, watchful: 4.0, attack: 1900.0 }[SCENARIO] * (0.6 + wobble)),
      'decoy port touches': r1({ calm: 0.0, watchful: 0.1, attack: 3.4 }[SCENARIO] * (0.5 + wobble))
    };
    var level = { calm: 0, watchful: 1, attack: 2 }[SCENARIO];
    var domain = W.settings.DOMAIN;
    return {
      server: SERVER, address: ADDRESSES.join(', '), site: domain ? 'https://' + domain : '', version: VERSION,
      time: Math.floor(now), state: attention.length ? 'attention' : 'ok', attention: attention,
      services: { database: 'active', app: 'active', proxy: 'active', sentinel: 'active', firewall: 'active',
        ssh: W.support ? 'active' : 'inactive', 'usb guard': 'active', auditing: 'active' },
      threat: { level: level, name: ['calm', 'watchful', 'under attack'][level], known: true },
      shield: { up: W.shield_mode === 'on' || (W.shield_mode === 'auto' && SCENARIO === 'attack'), mode: W.shield_mode },
      lockdown: W.lockdown,
      bans: Object.keys(W.bans).sort().map(function (ip) { return { ip: ip, seconds_left: Math.floor(W.bans[ip] - now) }; }),
      doctor: { at: report.at, passed: report.passed, failed: report.failed, unknown: report.unknown },
      backups: { count: W.backups, newest_hours: Math.round((now - W.backup_at) / 36) / 100 },
      support: W.support, analyst: W.analyst, rates: rates,
      last_change: W.last_change && now - W.last_change.at < 24 * 3600 ? W.last_change : null
    };
  }

  function settingsView() {
    var settings = {};
    SETTING_KEYS.forEach(function (k) {
      var v = W.settings[k];
      settings[k] = { value: ALERT_KEYS.indexOf(k) >= 0 ? split(v).map(mask).join(',') : v, label: SETTINGS[k][0], help: SETTINGS[k][1] };
    });
    return { settings: settings, secrets: { smtp_password: W.secrets.smtp_password, telegram_token: W.secrets.telegram_token } };
  }

  function setup() {
    var domain = W.settings.DOMAIN;
    var isName = !!domain && !isNumberish(domain);
    var mailOk = !!(W.settings.SMTP_HOST && W.settings.SMTP_FROM) && !mailProblems().length;
    var lists = {};
    Object.keys(AUDIENCES).forEach(function (a) { lists[a] = recipients(AUDIENCES[a][0]).map(mask); });
    return {
      domain: { current: domain, server_addresses: ADDRESSES, tls_mode: W.settings.TLS_MODE, is_name: isName },
      email: { configured: mailOk, problems: mailProblems(), presets: PRESETS },
      alerts: { security: lists.security, upkeep: lists.upkeep, cheat: lists.cheat, problems: problems() },
      done: { domain: isName, email: mailOk, alerts: lists.security.length > 0 }
    };
  }

  function logs(what, lines) {
    if (['app', 'db', 'proxy', 'sentinel'].indexOf(what) < 0) { throw new Refused('Choose the app, the database, the proxy or the sentinel.'); }
    if (!(lines >= 1 && lines <= 200)) { throw new Refused('Between 1 and 200 lines.'); }
    var now = nowS();
    function stamp(ago) { return new Date((now - ago) * 1000).toISOString().slice(0, 19) + '+0000'; }
    var ts = Math.floor(now);
    var pool;
    if (what === 'app') {
      pool = ['{"level":"info","msg":"request","method":"GET","path":"/api/rooms/K7QX","status":200,"ms":4}',
        '{"level":"info","msg":"ws join","room":"K7QX","players":24}',
        '{"level":"warn","ludora_event":"integrity","kind":"too_fast","room":"K7QX","player":"<img src=x onerror=alert(1)>"}',
        '{"level":"info","msg":"request","method":"POST","path":"/api/auth/sign-in","status":401,"ms":88}',
        '{"level":"info","msg":"health","db":"ok","uptime_s":93544}'];
    } else if (what === 'db') {
      pool = ['LOG:  checkpoint starting: time', 'LOG:  checkpoint complete: wrote 41 buffers (0.3%); write=4.012 s',
        'LOG:  connection authorized: user=ludora database=ludora', 'LOG:  automatic vacuum of table "ludora.public.answers": index scans: 0'];
    } else if (what === 'proxy') {
      pool = ['{"ts":' + ts + ',"request":{"remote_ip":"10.20.3.41","method":"GET","uri":"/<script>alert(1)</script>"},"status":404}',
        '{"ts":' + ts + ',"request":{"remote_ip":"10.20.3.52","method":"POST","uri":"/api/auth/sign-in"},"status":401}',
        '{"ts":' + ts + ',"request":{"remote_ip":"10.20.5.12","method":"GET","uri":"/play/K7QX"},"status":200}',
        '{"ts":' + ts + ',"request":{"remote_ip":"10.20.3.44","method":"GET","uri":"/.env"},"status":404}'];
    } else {
      pool = ['sentinel: watching 9 decoy listeners, SSH and the web log',
        'sentinel: 10.20.3.41 probe count 3/3 in 300s -> ban 15 min',
        'sentinel: 10.20.9.10 touched decoy 3389; staff address, recorded only',
        'sentinel: level calm -> watchful (2 bans in 600s)',
        'sentinel: player-chosen text kept as data',
        'sentinel: status written; 0 errors'];
    }
    var unit = { app: 'ludora-app', db: 'ludora-db', proxy: 'ludora-proxy', sentinel: 'ludora-sentinel' }[what];
    var out = [];
    for (var i = 0; i < lines; i++) {
      out.push(clean(stamp((lines - i) * 7) + ' ludora ' + unit + '[' + (1200 + i % 7) + ']: ' + pool[i % pool.length], 600));
    }
    return { lines: out };
  }

  function dnsCheck(name) {
    if (typeof name !== 'string') { throw new Refused('That was not understood.'); }
    name = name.trim().toLowerCase().replace(/\.$/, '');
    if (!name || name.indexOf('.') < 0 || !FQDN.test(name) || isNumberish(name)) { throw new Refused('Give a name such as play.your-school.org.'); }
    var found = { play: [ADDRESSES[1]], ludora: [ADDRESSES[0]], intranet: [ADDRESSES[0]], old: ['198.51.100.9'] }[name.split('.')[0]] || [];
    var matches = found.some(function (a) { return ADDRESSES.indexOf(a) >= 0; });
    var advice;
    if (!found.length) {
      advice = name + " does not exist yet, or the change has not spread. Ask whoever manages the school's domain for an A record for " + name + ' pointing to this server, then check again in a few minutes.';
    } else if (matches) {
      advice = name + ' points to this server. You can use it as the address now.';
    } else {
      advice = name + ' points to ' + found.join(', ') + ', not to this server (' + ADDRESSES.join(', ') + '). The record needs changing.';
    }
    return { name: name, resolves_to: found, server_addresses: ADDRESSES, matches: matches, public: true, advice: advice };
  }

  /* ---------------------------------------------------------------- changes */

  function reachable(name) {
    if (IPV4.test(name)) {
      if (ADDRESSES.indexOf(name) < 0) { throw new Refused('The address people open: ' + name + " is not one of this server's own addresses (" + ADDRESSES.join(', ') + ').'); }
      return;
    }
    var looked = dnsCheck(name);
    if (!looked.resolves_to.length) {
      throw new Refused('The address people open: this server cannot find ' + name + ' in DNS yet. Use the Check button, and try again once the name exists. ' +
        'A name that only some computers can look up is set at the server itself (`ludoractl set DOMAIN`).');
    }
    if (!looked.matches) { throw new Refused('The address people open: ' + looked.advice); }
  }

  function check(key, value, before) {
    var v = value.trim();
    if (key === 'DOMAIN') {
      v = v.toLowerCase().replace(/\.$/, '');
      if (v && !IPV4.test(v) && (!FQDN.test(v) || isNumberish(v))) { throw new Error('give a name such as play.your-school.org, or an IPv4 address such as 10.20.0.5'); }
      return v;
    }
    if (key === 'TLS_MODE' || key === 'SMTP_SECURITY') {
      var allowed = key === 'TLS_MODE' ? ['public', 'internal', 'custom'] : ['starttls', 'tls'];
      if (allowed.indexOf(v) < 0) { throw new Error('choose ' + allowed.slice(0, -1).join(', ') + ' or ' + allowed[allowed.length - 1]); }
      return v;
    }
    if (key === 'OPERATOR_NAME' || key === 'OPERATOR_CONTACT') {
      if (v.length > 120) { throw new Error('keep it under 120 characters'); }
      Array.from(v).forEach(function (ch) {
        if (!(/[\p{L}\p{N}]/u.test(ch) || TEXT_EXTRA.indexOf(ch) >= 0)) { throw new Error('the character ' + JSON.stringify(ch) + ' is not allowed here'); }
      });
      return v;
    }
    if (ALERT_KEYS.indexOf(key) >= 0) {
      var current = split(before[key]);
      var out = [];
      split(v).forEach(function (part) {
        if (part.indexOf('ntfy:') === 0 && part.slice(-MASK.length) === MASK) {
          var match = current.filter(function (c) { return c.indexOf('ntfy:') === 0 && mask(c) === part; });
          if (match.length !== 1) { throw new Refused('A hidden phone-push topic could not be matched. Remove it and add the full topic again.'); }
          part = match[0];
        }
        var i = part.indexOf(':');
        var kind = i >= 0 ? part.slice(0, i) : '';
        var rest = i >= 0 ? part.slice(i + 1) : '';
        var ok = (i < 0 && MAIL.test(part)) || (i >= 0 && kind === 'ntfy' && NTFY_TOPIC.test(rest)) || (i >= 0 && kind === 'telegram' && TELEGRAM_CHAT.test(rest));
        if (!ok) { throw new Error(JSON.stringify(part.slice(0, 60)) + ' is not an email address, ntfy:<topic of 8 or more letters and digits> or telegram:<chat number>'); }
        if (out.indexOf(part) < 0) { out.push(part); }
      });
      return out.join(',');
    }
    if (key === 'ALERT_QUIET_MINUTES' || key === 'SMTP_PORT') {
      var low = 1;
      var high = key === 'ALERT_QUIET_MINUTES' ? 1440 : 65535;
      if (!/^[+-]?\d+$/.test(v)) { throw new Error('give a whole number'); }
      var n = parseInt(v, 10);
      if (!(n >= low && n <= high)) { throw new Error('give a number from ' + low + ' to ' + high); }
      return String(n);
    }
    if (key === 'SMTP_HOST') {
      v = v.toLowerCase();
      if (v && !FQDN.test(v)) { throw new Error('give a host name such as smtp.your-school.org'); }
      return v;
    }
    if (key === 'SMTP_USER') {
      if (!/^[A-Za-z0-9._%+@-]{0,128}$/.test(v)) { throw new Error('letters, digits and . _ % + @ - only'); }
      return v;
    }
    if (key === 'SMTP_FROM') {
      if (v && !MAIL.test(v)) { throw new Error('give one email address'); }
      return v;
    }
    if (key === 'NTFY_SERVER') {
      if (v && !/^https:\/\/[A-Za-z0-9.-]{1,253}(?::\d{1,5})?(\/[A-Za-z0-9._~%\/-]{0,400})?$/.test(v)) { throw new Error('give an https:// address with no spaces, user name or password'); }
      return v;
    }
    return v;
  }

  function change(changes) {
    if (!changes || typeof changes !== 'object' || Array.isArray(changes) || !Object.keys(changes).length || Object.keys(changes).length > SETTING_KEYS.length) {
      throw new Refused('Nothing to change.');
    }
    var before = Object.assign({}, W.settings);
    var cfg = Object.assign({}, W.settings);
    Object.keys(changes).forEach(function (key) {
      if (!SETTINGS[key]) { throw new Refused(clean(key, 40) + ' cannot be changed from the dashboard.'); }
      var label = SETTINGS[key][0];
      var value = changes[key];
      if (typeof value !== 'string' || value.length > 2000) { throw new Refused(label + ': that value was not understood.'); }
      try { cfg[key] = check(key, value, before); }
      catch (err) { if (err instanceof Refused) { throw err; } throw new Refused(label + ': ' + err.message); }
    });
    if (cfg.TLS_MODE === 'public' && (!cfg.DOMAIN || isNumberish(cfg.DOMAIN) || cfg.DOMAIN.indexOf('.') < 0)) {
      throw new Refused('TLS_MODE=public needs DOMAIN to be a full name such as play.your-school.org, not an address.');
    }
    var changed = SETTING_KEYS.filter(function (k) { return cfg[k] !== before[k]; });
    if (!changed.length) { return { message: 'Nothing needed changing.' }; }
    if (changed.indexOf('SMTP_PORT') >= 0 && MAIL_PORTS.indexOf(parseInt(cfg.SMTP_PORT, 10)) < 0) {
      throw new Refused('Mail server port: from the dashboard this can be 587, 465, 25 or 2525. Any other port is set at the server itself.');
    }
    if (cfg.TLS_MODE === 'custom') {
      throw new Refused('Certificate: your own certificate has to be put on the server first, as /etc/ludora-os/tls/site.crt and site.key.');
    }
    var names = changed.map(function (k) { return SETTINGS[k][0].toLowerCase(); }).join(', ');
    if (changed.indexOf('DOMAIN') >= 0 || changed.indexOf('TLS_MODE') >= 0) {
      reachable(cfg.DOMAIN);
      var start = nowS() + 0.5;
      W.outage = [start, start + SITE_WAIT];
      W.move = { start: start, until: start + SITE_WAIT, cfg: cfg, before: before, changed: changed, cut: false };
      return { message: 'The server is changing its address or certificate now. On a real server that takes about a minute, and you would then open https://' + cfg.DOMAIN +
          ':8443 and sign in again. This demo comes back to this page in a few seconds. If the site does not answer under the new settings, the server puts the old ones back by itself and says why.',
        moving: { to: null, seconds: 12 } };
    }
    var extra = '';
    if (changed.some(function (k) { return MAIL_KEYS.indexOf(k) >= 0; }) && W.secrets.smtp_password) {
      W.secrets.smtp_password = false;
      extra = ' The mail password was forgotten because the mail server changed: enter it again.';
    }
    W.settings = cfg;
    record('changed ' + names + '.');
    return { message: 'Saved and in effect: ' + names + '.' + extra };
  }

  function address(value) {
    if (typeof value !== 'string' || !(IPV4.test(value.trim()) || /^[0-9a-fA-F:]{2,39}$/.test(value.trim()))) { throw new Refused('That is not an address such as 10.20.3.7.'); }
    return value.trim();
  }

  function token() {
    var bytes = new Uint8Array(24);
    window.crypto.getRandomValues(bytes);
    var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.prototype.map.call(bytes, function (b) { return alphabet[b % alphabet.length]; }).join('');
  }

  function action(body) {
    var name = body.action;
    var now = nowS();
    var ip;
    if (name === 'ban') {
      ip = address(body.ip);
      var minutes = body.minutes === undefined ? 60 : body.minutes;
      if (typeof minutes !== 'number' || Math.floor(minutes) !== minutes || !(minutes >= 1 && minutes <= 1440)) { throw new Refused('A ban lasts from 1 minute to 24 hours.'); }
      if (ADDRESSES.indexOf(ip) >= 0) { throw new Refused(ip + " is this server's own address: it cannot be banned."); }
      if (ip.indexOf(STAFF_NET) === 0) { throw new Refused(ip + " is an administrator's address: banning it would cut off the people who look after the server."); }
      W.bans[ip] = now + minutes * 60;
      record(ip + ' banned for ' + minutes + ' minutes.', 'warning');
      return { message: ip + ' is refused for ' + minutes + ' minutes.' };
    }
    if (name === 'unban') {
      ip = address(body.ip);
      if (!(ip in W.bans)) { throw new Refused(ip + ' is not banned.'); }
      delete W.bans[ip];
      record(ip + ' let back in.');
      return { message: ip + ' may connect again.' };
    }
    if (name === 'shield') {
      var mode = body.mode;
      if (['auto', 'on', 'off'].indexOf(mode) < 0) { throw new Refused('The shield is auto, on or off.'); }
      W.shield_mode = mode;
      record('shield set to ' + mode + '.');
      return { message: { auto: 'The sentinel raises the shield by itself under attack.', on: 'The shield is up: every limit is a quarter of normal.', off: 'The shield stays down.' }[mode] };
    }
    if (name === 'lockdown') {
      if (typeof body.on !== 'boolean') { throw new Refused('Lockdown is on or off.'); }
      W.lockdown = body.on;
      record('lockdown switched ' + (body.on ? 'on' : 'off') + '.', body.on ? 'alert' : 'notice');
      return { message: body.on ? 'Lockdown is on: only the staff addresses can open Ludora.' : 'Lockdown is off: Ludora is open again.' };
    }
    if (name === 'backup') {
      if (now - W.backup_at < 600) { throw new Refused('A backup was made a few minutes ago. Only so many are kept, so they are not made back to back.'); }
      W.backup_at = now;
      W.backups = Math.min(W.backups + 1, 14);
      record('a backup was made.');
      return { message: 'Backed up. The copy is encrypted and kept on the server: copy it somewhere else too.' };
    }
    if (name === 'doctor') {
      W.doctor_at = now;
      var report = doctor();
      return { message: report.passed + ' passing, ' + report.failed + ' failing.' };
    }
    if (name === 'alerts_test') {
      var audience = body.audience;
      if (audience !== undefined && audience !== null && !AUDIENCES[audience]) { throw new Refused('Choose security, upkeep or fair play.'); }
      var said = (audience ? [audience] : Object.keys(AUDIENCES)).map(function (who) {
        var label = AUDIENCES[who][1];
        var listed = recipients(AUDIENCES[who][0]);
        if (!listed.length) { return label + ': nobody is on that list.'; }
        return label + ': ' + listed.map(function (r) {
          if (isMail(r) && mailProblems().length) { return hide(r) + ' NOT delivered (the mail settings are not complete)'; }
          if (r.indexOf('telegram:') === 0 && !W.secrets.telegram_token) { return hide(r) + ' NOT delivered (no Telegram bot token)'; }
          return hide(r) + ' sent';
        }).join('; ');
      });
      return { message: said.join(' ') };
    }
    if (name === 'set') { return change(body.changes); }
    if (name === 'secret') {
      var which = body.name;
      if (!(which === 'smtp_password' || which === 'telegram_token')) { throw new Refused('That is not something the dashboard can set.'); }
      var value = body.value;
      if (typeof value !== 'string' || !value.length || value.length > 256 || /\p{C}/u.test(value)) { throw new Refused('A password or token is one line of ordinary characters.'); }
      value = which === 'smtp_password' ? value.trim().replace(/ /g, '') : value.trim();
      if (!value || /\s/.test(value)) { throw new Refused('A password or token is one line with no spaces.'); }
      if (which === 'telegram_token' && !TELEGRAM_TOKEN.test(value)) { throw new Refused('That does not look like a Telegram bot token (numbers, a colon, then letters and digits).'); }
      /* The demo keeps only the fact that one was set, never what was typed. */
      W.secrets[which] = true;
      record('the ' + which.replace('_', ' ') + ' was set.');
      return { message: 'Saved. Send a test to check it works.' };
    }
    if (name === 'ntfy_topic') {
      var topic = 'ludora-' + token();
      return { message: 'In the ntfy phone app, subscribe to this topic on ' + W.settings.NTFY_SERVER + ', then add ntfy:' + topic + ' to a list. Anyone who knows the name can read its messages.', topic: topic };
    }
    if (name === 'support_close') {
      var closed = W.support !== null;
      W.support = null;
      if (closed) { record('support access closed.'); }
      return { message: closed ? 'Support access is closed.' : 'Support access was not open.' };
    }
    if (name === 'restart') {
      if (body.what !== 'app' && body.what !== 'proxy') { throw new Refused('Only the app or the proxy can be restarted from here.'); }
      if (body.what === 'proxy') {
        W.outage = [now + 0.5, now + 3.5];
        record('the proxy was restarted.');
        return { message: 'The proxy is restarting. This page loses its connection for a few seconds and then carries on.', moving: { to: null, seconds: 15 } };
      }
      record('the ' + body.what + ' was restarted.');
      return { message: 'The ' + body.what + ' was restarted.' };
    }
    throw new Refused('That is not something the dashboard can do.');
  }

  /* ---------------------------------------------------------------- the web service in front */

  function signedIn(method, path) {
    var s = W.session;
    var now = nowS();
    if (!s) { return false; }
    if (now - s.seen > IDLE_MINUTES * 60 || now - s.since > 8 * 3600) { W.session = null; return false; }
    /* the page's own refreshes are not a person using it */
    if (!(method === 'GET' && (path === '/api/overview' || path === '/api/events'))) { s.seen = now; }
    return true;
  }

  function wait(seconds) { return new Promise(function (done) { window.setTimeout(done, seconds * 1000); }); }

  async function login(body) {
    var now = nowS();
    if (W.paused > now) {
      var left = Math.floor(W.paused - now) + 1;
      return [429, { error: 'Too many wrong tries. Sign-in is paused for ' + Math.max(1, Math.round(left / 60)) + ' more minutes.', retry_after: left }];
    }
    W.failures = W.failures.filter(function (t) { return now - t < WINDOW; }).concat([now]);
    if (W.failures.length >= TRIES) { W.paused = now + PAUSE; W.failures = []; }
    await wait(0.4);
    var good = typeof body.password === 'string' && body.password === PASSWORD;
    if (body.code !== undefined && body.code !== null && !(typeof body.code === 'string' && /^\d{6}$/.test(body.code))) { good = false; }
    if (!good) { return [401, { error: 'That password or code is not right.' }]; }
    W.failures = [];
    W.session = { since: nowS(), seen: nowS() };
    event(nowS(), 'info', 'dashboard', 'Dashboard (' + CLIENT + '): a member of staff signed in.');
    return [200, { ok: true }];
  }

  async function serve(method, path, params, body) {
    var now = nowS();
    settleMove();
    if (W.outage[0] <= now && now < W.outage[1]) { return [502, { error: 'The proxy is restarting.' }]; }
    if (method === 'POST' && (!body || typeof body !== 'object' || Array.isArray(body))) { return [400, { error: 'That was not understood.' }]; }
    var signed = signedIn(method, path);
    if (path === '/api/session' && method === 'GET') {
      return [200, { signed_in: signed, server: SERVER, version: VERSION, needs_code: false, idle_minutes: IDLE_MINUTES }];
    }
    if (path === '/api/login' && method === 'POST') { return login(body); }
    if (!signed) { return [401, { error: 'signed_out' }]; }
    if (path === '/api/logout' && method === 'POST') { W.session = null; return [200, { ok: true }]; }
    function number(text, fallback) { return typeof text === 'string' && /^\d{1,4}$/.test(text) ? parseInt(text, 10) : fallback; }
    var answer;
    try {
      if (method === 'GET') {
        advance();
        if (path === '/api/overview') { answer = overview(); }
        else if (path === '/api/doctor') { answer = doctor(); }
        else if (path === '/api/settings') { answer = settingsView(); }
        else if (path === '/api/setup') { answer = setup(); }
        else if (path === '/api/events') {
          var limit = number(params.get('limit'), 100);
          if (!(limit >= 1 && limit <= 300)) { throw new Refused('Between 1 and 300 events.'); }
          answer = { events: W.events.slice(-limit).map(function (e) { return { at: e.at, severity: e.severity, kind: e.kind, text: clean(e.text, 400) }; }) };
        } else if (path === '/api/logs') { answer = logs(params.get('what') || '', number(params.get('lines'), 80)); }
        else { return [404, { error: 'There is nothing at that address.' }]; }
      } else if (path === '/api/dns-check') {
        await wait(DELAY * 0.6);
        answer = dnsCheck(body.name);
      } else if (path === '/api/action') {
        await wait(DELAY * ({ backup: 2.0, doctor: 1.6, restart: 1.6, alerts_test: 1.4, set: 0.6 }[String(body.action)] || 0.5));
        answer = action(body);
      } else {
        return [404, { error: 'There is nothing at that address.' }];
      }
    } catch (err) {
      if (err instanceof Refused) { return [400, { error: err.message }]; }
      throw err;
    }
    return [200, Object.assign({ ok: true }, answer)];
  }

  var realFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = async function (input, options) {
    var address_ = typeof input === 'string' ? input : (input && input.url) || '';
    var url = new URL(address_, 'https://demo.invalid');
    if (url.pathname.indexOf('/api/') !== 0) {
      if (realFetch) { return realFetch(input, options); }
      throw new TypeError('no network in the demo');
    }
    options = options || {};
    var method = (options.method || 'GET').toUpperCase();
    var body;
    if (method === 'POST') {
      try { body = JSON.parse(options.body || '{}'); } catch (e) { body = null; }
    }
    var result;
    try { result = await serve(method, url.pathname, url.searchParams, body); }
    catch (e) { result = [500, { error: 'The demo server made a mistake.' }]; }
    persist();
    return new Response(JSON.stringify(result[1]), { status: result[0], headers: { 'Content-Type': 'application/json' } });
  };

  /* ---------------------------------------------------------------- the demo bar's own controls */

  window.ludoraDemo = {
    scenario: SCENARIO,
    password: PASSWORD,
    /* A different situation, or the same one from the start: a fresh world, then the page loads again. */
    start: function (scenario) {
      try { window.sessionStorage.setItem(KEY, JSON.stringify({ scenario: scenario })); } catch (e) { /* carries on in memory */ }
      ['ludora-dash-left', 'ludora-dash-moved'].forEach(function (k) { try { window.sessionStorage.removeItem(k); } catch (e) { /* nothing to clear */ } });
      SCENARIO = scenario;
      W = seed(scenario);
      persist();
      window.location.hash = '';
      window.location.reload();
    }
  };
  persist();
}());
