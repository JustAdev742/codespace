/* Wiring for the demo bar. Runs after mock.js and before dash.js. */
(function () {
  'use strict';
  var demo = window.ludoraDemo;
  document.body.setAttribute('data-threat', '0');
  ['calm', 'watchful', 'attack'].forEach(function (name) {
    var button = document.getElementById('demo-' + name);
    button.setAttribute('aria-pressed', String(demo.scenario === name));
    button.addEventListener('click', function () { demo.start(name); });
  });
  document.getElementById('demo-again').addEventListener('click', function () { demo.start(demo.scenario); });
  /* On the sign-in screen, offer to type the demo password. */
  var fill = document.getElementById('demo-fill');
  var signin = document.getElementById('signin');
  function offer() { fill.hidden = signin.hidden; }
  new MutationObserver(offer).observe(signin, { attributes: true, attributeFilter: ['hidden'] });
  offer();
  fill.addEventListener('click', function () {
    var field = document.getElementById('signin-password');
    field.value = demo.password;
    field.focus();
  });
}());
