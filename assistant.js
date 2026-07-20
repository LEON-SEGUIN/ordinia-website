/* ═══════════════════════════════════════════════════════════════════
   D&S Intelligence — Assistant + capture de leads
   ───────────────────────────────────────────────────────────────────
   CONFIG N8N — collez vos URLs de webhook ici quand l'instance n8n
   est en production. Tant qu'un champ est vide, le site fonctionne
   en mode autonome (bot scripté + envoi des leads par email).

   • chatWebhook : POST {sessionId, message, page}
                   → réponse JSON {reply: "…", chips?: ["…"]}
                   (agent IA branché sur la base vectorielle)
   • leadWebhook : POST {type: "contact"|"rdv", name, email, company,
                   need, message, availability, page, ts}
                   → 200 = succès (formulaire de contact + prise de RDV)
   ═══════════════════════════════════════════════════════════════════ */
window.DS_CONFIG = {
  chatWebhook: 'https://ordinia.app.n8n.cloud/webhook/chat-ds-intelligence',
  leadWebhook: '',
  contactEmail: 'contact@ds-intelligence.tech',
}

;(function () {
  'use strict'

  var CFG = window.DS_CONFIG
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  var onPricing = /pricing\.html/.test(location.pathname)
  var HOME = onPricing ? 'index.html' : ''

  /* ── Session id (réutilisé plus tard par l'agent n8n pour la mémoire) ── */
  var sessionId = sessionStorage.getItem('ds-session')
  if (!sessionId) {
    sessionId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
      : 'ds-' + Date.now() + '-' + Math.random().toString(36).slice(2)
    sessionStorage.setItem('ds-session', sessionId)
  }

  /* ═══════════════════ STYLES ═══════════════════ */
  var css = [
    '#ds-assistant{position:fixed;bottom:24px;right:24px;z-index:9000;font-family:Inter,sans-serif}',

    /* Bouton flottant */
    '#ds-fab{position:relative;width:58px;height:58px;border-radius:50%;border:none;cursor:pointer;',
    '  background:linear-gradient(135deg,#6a5cff,#00b2ff);color:#fff;',
    '  display:flex;align-items:center;justify-content:center;',
    '  box-shadow:0 10px 30px rgba(106,92,255,0.35),0 3px 10px rgba(13,13,18,0.10);',
    '  transition:transform .3s cubic-bezier(0.16,1,0.3,1),box-shadow .3s cubic-bezier(0.16,1,0.3,1)}',
    '#ds-fab:hover{transform:translateY(-3px);box-shadow:0 16px 40px rgba(106,92,255,0.45),0 5px 14px rgba(13,13,18,0.12)}',
    '#ds-fab:active{transform:scale(0.94)}',
    '#ds-fab:focus-visible{outline:2px solid #6a5cff;outline-offset:3px}',
    '#ds-fab svg{position:absolute;transition:opacity .22s ease,transform .3s cubic-bezier(0.16,1,0.3,1)}',
    '#ds-fab .ds-ic-close{opacity:0;transform:rotate(-45deg) scale(0.6)}',
    '#ds-assistant.is-open .ds-ic-chat{opacity:0;transform:rotate(45deg) scale(0.6)}',
    '#ds-assistant.is-open .ds-ic-close{opacity:1;transform:rotate(0) scale(1)}',
    '@keyframes dsHalo{0%{transform:scale(1);opacity:.45}70%{transform:scale(1.55);opacity:0}100%{transform:scale(1.55);opacity:0}}',
    '#ds-fab::before{content:"";position:absolute;inset:0;border-radius:50%;',
    '  border:1.5px solid rgba(106,92,255,0.55);animation:dsHalo 3.2s cubic-bezier(0.16,1,0.3,1) infinite;pointer-events:none}',
    '#ds-assistant.is-open #ds-fab::before{animation:none;opacity:0}',

    /* Invite ("Une question ?") */
    '#ds-nudge{position:absolute;bottom:70px;right:0;white-space:nowrap;',
    '  font-family:"JetBrains Mono",monospace;font-size:11px;letter-spacing:0.08em;color:#0d0d12;',
    '  background:#fff;border:1px solid #e6e8ec;border-radius:999px;padding:10px 16px;',
    '  box-shadow:0 8px 26px rgba(106,92,255,0.14),0 2px 8px rgba(13,13,18,0.06);',
    '  opacity:0;transform:translateY(8px);pointer-events:none;',
    '  transition:opacity .4s ease,transform .4s cubic-bezier(0.16,1,0.3,1)}',
    '#ds-nudge.is-visible{opacity:1;transform:translateY(0);pointer-events:auto;cursor:pointer}',

    /* Panneau */
    '#ds-panel{position:fixed;bottom:100px;right:24px;z-index:9000;',
    '  width:min(392px,calc(100vw - 32px));height:min(600px,calc(100vh - 130px));',
    '  display:flex;flex-direction:column;overflow:hidden;',
    '  background:#fff;border:1px solid #e6e8ec;border-radius:16px;',
    '  box-shadow:0 30px 80px -18px rgba(106,92,255,0.28),0 10px 28px rgba(13,13,18,0.09);',
    '  opacity:0;transform:translateY(16px) scale(0.97);transform-origin:bottom right;pointer-events:none;',
    '  transition:opacity .28s ease,transform .34s cubic-bezier(0.16,1,0.3,1)}',
    '#ds-panel.is-open{opacity:1;transform:translateY(0) scale(1);pointer-events:auto}',
    '#ds-panel::before{content:"";position:absolute;top:0;left:0;right:0;height:1.5px;z-index:1;',
    '  background:linear-gradient(90deg,transparent,#6a5cff 25%,#00b2ff 75%,transparent)}',

    /* En-tête */
    '.ds-head{display:flex;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid #eef0f3;flex-shrink:0;background:#fff}',
    '.ds-avatar{width:36px;height:36px;border-radius:50%;flex-shrink:0;',
    '  background:linear-gradient(135deg,#6a5cff,#00b2ff);display:flex;align-items:center;justify-content:center}',
    '.ds-head-txt{flex:1;min-width:0}',
    '.ds-title{font-family:"Space Grotesk",sans-serif;font-weight:700;font-size:13.5px;letter-spacing:-0.01em;color:#0d0d12;line-height:1.3}',
    '.ds-status{display:flex;align-items:center;gap:6px;font-family:"JetBrains Mono",monospace;',
    '  font-size:9.5px;letter-spacing:0.18em;text-transform:uppercase;color:#6b7280;line-height:1.6}',
    '@keyframes dsDot{0%,100%{opacity:1}50%{opacity:.35}}',
    '.ds-status i{width:6px;height:6px;border-radius:50%;background:#00b2ff;animation:dsDot 2.4s ease-in-out infinite}',
    '.ds-close{width:32px;height:32px;border-radius:8px;border:none;background:transparent;color:#6b7280;cursor:pointer;',
    '  display:flex;align-items:center;justify-content:center;transition:opacity .18s ease,transform .18s ease}',
    '.ds-close:hover{opacity:0.6}',
    '.ds-close:active{transform:scale(0.9)}',
    '.ds-close:focus-visible{outline:2px solid #6a5cff;outline-offset:2px}',

    /* Fil de messages */
    '.ds-msgs{flex:1;overflow-y:auto;padding:20px 18px 8px;display:flex;flex-direction:column;gap:10px;',
    '  background:radial-gradient(420px 260px at 100% 0%,rgba(0,178,255,0.045),transparent 70%),',
    '  radial-gradient(420px 300px at 0% 100%,rgba(106,92,255,0.05),transparent 70%),#fff;',
    '  scrollbar-width:thin;scrollbar-color:#e6e8ec transparent}',
    '.ds-msgs::-webkit-scrollbar{width:4px}',
    '.ds-msgs::-webkit-scrollbar-thumb{background:#e6e8ec;border-radius:2px}',
    '.ds-msg{max-width:86%;padding:11px 14px;font-size:13.5px;line-height:1.62;font-weight:300;',
    '  opacity:0;transform:translateY(8px);animation:dsIn .38s cubic-bezier(0.16,1,0.3,1) forwards;overflow-wrap:break-word}',
    '@keyframes dsIn{to{opacity:1;transform:translateY(0)}}',
    '.ds-msg.bot{align-self:flex-start;background:#f6f7f9;border:1px solid #eef0f3;color:#0d0d12;',
    '  border-radius:12px;border-top-left-radius:4px}',
    '.ds-msg.bot strong{font-weight:500}',
    '.ds-msg.bot a{color:#6a5cff;text-decoration:underline;text-underline-offset:2px}',
    '.ds-msg.user{align-self:flex-end;background:linear-gradient(135deg,#6a5cff,#00b2ff);color:#fff;',
    '  border-radius:12px;border-bottom-right-radius:4px;font-weight:400}',

    /* Indicateur de frappe */
    '.ds-typing{display:flex;gap:4px;align-items:center;padding:14px 16px}',
    '@keyframes dsTyp{0%,60%,100%{opacity:.25;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}',
    '.ds-typing i{width:5px;height:5px;border-radius:50%;background:#6b7280;animation:dsTyp 1.1s ease-in-out infinite}',
    '.ds-typing i:nth-child(2){animation-delay:.15s}',
    '.ds-typing i:nth-child(3){animation-delay:.3s}',

    /* Boutons de réponse rapide */
    '.ds-chips{display:flex;flex-wrap:wrap;gap:7px;padding:2px 0 4px;align-self:flex-start;max-width:100%;',
    '  opacity:0;transform:translateY(8px);animation:dsIn .38s cubic-bezier(0.16,1,0.3,1) .12s forwards}',
    '.ds-chip{font-family:"JetBrains Mono",monospace;font-size:10.5px;letter-spacing:0.06em;',
    '  color:#0d0d12;background:#fff;border:1px solid #e6e8ec;border-radius:999px;',
    '  padding:8px 14px;cursor:pointer;transition:border-color .18s ease,background-color .18s ease,transform .18s ease}',
    '.ds-chip:hover{border-color:#6a5cff;background:rgba(106,92,255,0.07)}',
    '.ds-chip:active{transform:scale(0.96)}',
    '.ds-chip:focus-visible{outline:2px solid #6a5cff;outline-offset:2px}',

    /* Zone de saisie */
    '.ds-inputrow{display:flex;gap:8px;padding:12px 14px;border-top:1px solid #eef0f3;background:#fff;flex-shrink:0}',
    '.ds-inputrow input{flex:1;min-width:0;background:#f6f7f9;border:1px solid #e6e8ec;border-radius:999px;',
    '  padding:10px 17px;font-family:Inter,sans-serif;font-size:13.5px;color:#0d0d12;outline:none;',
    '  transition:border-color .18s ease,box-shadow .18s ease}',
    '.ds-inputrow input::placeholder{color:#9ca3af}',
    '.ds-inputrow input:focus{border-color:#6a5cff;box-shadow:0 0 0 3px rgba(106,92,255,0.10)}',
    '.ds-send{width:40px;height:40px;border-radius:50%;border:none;flex-shrink:0;cursor:pointer;',
    '  background:linear-gradient(135deg,#6a5cff,#00b2ff);color:#fff;',
    '  display:flex;align-items:center;justify-content:center;',
    '  box-shadow:0 4px 14px rgba(106,92,255,0.30);',
    '  transition:transform .18s ease,box-shadow .18s ease,opacity .18s ease}',
    '.ds-send:hover{transform:translateY(-1px);box-shadow:0 7px 20px rgba(106,92,255,0.40)}',
    '.ds-send:active{transform:scale(0.92)}',
    '.ds-send:focus-visible{outline:2px solid #6a5cff;outline-offset:2px}',
    '.ds-send:disabled{opacity:0.45;cursor:default;transform:none;box-shadow:none}',
    '.ds-foot{text-align:center;font-family:"JetBrains Mono",monospace;font-size:8.5px;letter-spacing:0.16em;',
    '  text-transform:uppercase;color:#9ca3af;padding:0 14px 10px;background:#fff;flex-shrink:0}',

    /* Mobile */
    '@media (max-width: 767px){',
    '  #ds-assistant{bottom:calc(16px + env(safe-area-inset-bottom));right:16px}',
    '  #ds-fab{width:54px;height:54px}',
    '  #ds-nudge{font-size:10px;letter-spacing:0.05em;padding:9px 14px;bottom:64px}',
    '  #ds-panel{right:12px;bottom:calc(84px + env(safe-area-inset-bottom));width:calc(100vw - 24px);height:min(560px,calc(100dvh - 118px))}',
    '  .ds-inputrow input{font-size:16px}',   /* évite le zoom iOS */
    '}',

    /* Reduced motion */
    '@media (prefers-reduced-motion: reduce){',
    '  #ds-fab::before,.ds-status i,.ds-typing i{animation:none}',
    '  .ds-msg,.ds-chips{animation:none;opacity:1;transform:none}',
    '  #ds-panel{transition:opacity .01s}',
    '  #ds-fab,#ds-fab svg{transition:none}',
    '}',
  ].join('\n')

  var styleEl = document.createElement('style')
  styleEl.textContent = css
  document.head.appendChild(styleEl)

  /* ═══════════════════ DOM ═══════════════════ */
  var icons = {
    chat: '<svg class="ds-ic-chat" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M21 12c0 4.418-4.03 8-9 8-1.02 0-2-.15-2.91-.43L4 21l1.18-3.53C4.04 16.2 3 14.2 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="8.5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="15.5" cy="12" r="1" fill="currentColor"/></svg>',
    close: '<svg class="ds-ic-close" width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    node: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M9 3v4.5M9 10.5l-4 3M9 10.5l4 3" stroke="rgba(255,255,255,0.85)" stroke-width="1.2"/><circle cx="9" cy="9" r="2" fill="#fff"/><circle cx="9" cy="2.6" r="1.4" fill="#fff"/><circle cx="4.4" cy="14" r="1.4" fill="#fff"/><circle cx="13.6" cy="14" r="1.4" fill="#fff"/></svg>',
    send: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2.5 8h10M8.5 3.5 13 8l-4.5 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    x: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  }

  var root = document.createElement('div')
  root.id = 'ds-assistant'
  root.innerHTML =
    '<div id="ds-nudge" role="button" tabindex="-1">Une question ? Discutons.</div>' +
    '<button id="ds-fab" aria-expanded="false" aria-controls="ds-panel" aria-label="Ouvrir l’assistant D&S">' +
    icons.chat + icons.close + '</button>'
  document.body.appendChild(root)

  var panel = document.createElement('div')
  panel.id = 'ds-panel'
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-label', 'Assistant D&S Intelligence')
  panel.innerHTML =
    '<div class="ds-head">' +
    '  <div class="ds-avatar">' + icons.node + '</div>' +
    '  <div class="ds-head-txt">' +
    '    <p class="ds-title">Assistant D&amp;S</p>' +
    '    <p class="ds-status"><i aria-hidden="true"></i>En ligne</p>' +
    '  </div>' +
    '  <button class="ds-close" aria-label="Fermer l’assistant">' + icons.x + '</button>' +
    '</div>' +
    '<div class="ds-msgs" role="log" aria-live="polite"></div>' +
    '<form class="ds-inputrow">' +
    '  <input type="text" placeholder="Écrivez votre message…" aria-label="Votre message" autocomplete="off" maxlength="600" />' +
    '  <button type="submit" class="ds-send" aria-label="Envoyer">' + icons.send + '</button>' +
    '</form>' +
    '<p class="ds-foot">Réponses instantanées · D&amp;S Intelligence</p>'
  document.body.appendChild(panel)

  var fab = document.getElementById('ds-fab')
  var nudge = document.getElementById('ds-nudge')
  var msgs = panel.querySelector('.ds-msgs')
  var inputForm = panel.querySelector('.ds-inputrow')
  var input = inputForm.querySelector('input')
  var closeBtn = panel.querySelector('.ds-close')

  /* Curseur custom du site : les éléments injectés doivent aussi gonfler l'orbe */
  if (window.matchMedia('(pointer: fine)').matches) {
    ;[root, panel].forEach(function (el) {
      el.addEventListener('mouseover', function (e) {
        if (e.target.closest('button, a, [role="button"]')) document.body.classList.add('cursor-hover')
      })
      el.addEventListener('mouseout', function (e) {
        if (e.target.closest('button, a, [role="button"]')) document.body.classList.remove('cursor-hover')
      })
    })
  }

  /* ═══════════════════ CONTENU DU BOT ═══════════════════ */
  var MAIN_CHIPS = ['Nos services', 'Comment ça marche', 'Tarifs', 'Sécurité des données', 'Prendre un rendez-vous', 'Être recontacté']

  var FAQ = {
    services: {
      reply: 'Nous concevons des <strong>systèmes agentiques sur mesure</strong> — des agents IA et des automatisations qui font le travail répétitif à votre place.<br><br>Trois volets : <strong>Diagnostic</strong> (on identifie où l’IA aura le plus gros impact financier chez vous), <strong>Création</strong> (des automatisations qui s’intègrent à vos outils existants) et <strong>Suivi</strong> (maintenance et évolution continue).',
      chips: ['Voir les services', 'Prendre un rendez-vous', 'Retour au menu'],
    },
    process: {
      reply: 'Tout commence par un <strong>appel stratégique gratuit d’une heure</strong> : on analyse vos processus et on identifie votre première piste d’automatisation rentable.<br><br>Ensuite : conception, déploiement, puis on reste à vos côtés pour faire évoluer le système au rythme de vos besoins.',
      chips: ['Prendre un rendez-vous', 'Tarifs', 'Retour au menu'],
    },
    tarifs: {
      reply: 'Chaque projet est dimensionné sur mesure après le diagnostic — nos formules d’accompagnement et leurs fourchettes sont détaillées sur la page Tarifs.',
      chips: ['Voir les tarifs', 'Prendre un rendez-vous', 'Retour au menu'],
    },
    securite: {
      reply: 'Vos automatisations tournent sur un <strong>cloud sécurisé</strong>, pas sur un poste de bureau : connexions chiffrées, accès cloisonnés, identifiants stockés dans un coffre chiffré.<br><br>Vos données restent les vôtres — elles ne servent jamais à entraîner des modèles tiers.',
      chips: ['Prendre un rendez-vous', 'Retour au menu'],
    },
  }

  /* Flow séquentiel de capture (RDV / recontact) */
  var FLOWS = {
    rdv: {
      intro: 'Avec plaisir. Je prends quelques informations et l’équipe revient vers vous très vite pour confirmer un créneau.',
      steps: [
        { key: 'name', q: 'Votre nom ?' },
        { key: 'email', q: 'Votre email professionnel ?', validate: 'email' },
        { key: 'company', q: 'Le nom de votre entreprise ? <em style="color:#6b7280">(optionnel)</em>', optional: true },
        { key: 'need', q: 'En une phrase, quel processus aimeriez-vous automatiser ?' },
        { key: 'availability', q: 'Quelles disponibilités vous arrangent ? <em style="color:#6b7280">(ex. mardi matin, jeudi après 14h)</em>' },
      ],
      done: function (d) {
        return 'C’est noté, <strong>' + esc(d.name) + '</strong> ! L’équipe vous enverra une invitation à <strong>' + esc(d.email) + '</strong> pour un appel stratégique d’une heure, sur l’un de vos créneaux.'
      },
    },
    recontact: {
      intro: 'Très bien — dites-m’en un peu plus et l’équipe vous recontacte sous 24h ouvrées.',
      steps: [
        { key: 'name', q: 'Votre nom ?' },
        { key: 'email', q: 'Votre email ?', validate: 'email' },
        { key: 'message', q: 'Quel est votre besoin ou votre question ?' },
      ],
      done: function (d) {
        return 'Merci <strong>' + esc(d.name) + '</strong>, c’est transmis. Vous recevrez une réponse à <strong>' + esc(d.email) + '</strong> sous 24h ouvrées.'
      },
    },
  }

  /* ═══════════════════ HELPERS ═══════════════════ */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    })
  }
  function norm(s) {
    return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  }
  function scrollBottom() {
    msgs.scrollTop = msgs.scrollHeight
  }
  function addMsg(who, html) {
    var el = document.createElement('div')
    el.className = 'ds-msg ' + who
    if (who === 'user') el.textContent = html
    else el.innerHTML = html
    msgs.appendChild(el)
    scrollBottom()
    return el
  }
  function clearChips() {
    var old = msgs.querySelector('.ds-chips')
    if (old) old.remove()
  }
  function addChips(labels) {
    clearChips()
    if (!labels || !labels.length) return
    var wrap = document.createElement('div')
    wrap.className = 'ds-chips'
    labels.forEach(function (label) {
      var b = document.createElement('button')
      b.type = 'button'
      b.className = 'ds-chip'
      b.textContent = label
      b.addEventListener('click', function () { handleChip(label) })
      wrap.appendChild(b)
    })
    msgs.appendChild(wrap)
    scrollBottom()
  }
  var typingEl = null
  function showTyping() {
    hideTyping()
    typingEl = document.createElement('div')
    typingEl.className = 'ds-msg bot ds-typing'
    typingEl.setAttribute('aria-label', 'L’assistant écrit')
    typingEl.innerHTML = '<i></i><i></i><i></i>'
    msgs.appendChild(typingEl)
    scrollBottom()
  }
  function hideTyping() {
    if (typingEl) { typingEl.remove(); typingEl = null }
  }
  function botSay(html, chips, delay) {
    showTyping()
    setTimeout(function () {
      hideTyping()
      addMsg('bot', html)
      if (chips) addChips(chips)
    }, reduced ? 60 : (delay || 500 + Math.min(html.length * 3, 500)))
  }

  /* ═══════════════════ ÉTAT & LOGIQUE ═══════════════════ */
  var flow = null          /* {name, stepIdx, data} pendant une capture */
  var greeted = false

  function greet() {
    if (greeted) return
    greeted = true
    botSay(
      'Bonjour ! Je suis l’assistant <strong>D&amp;S Intelligence</strong>.<br>Je peux répondre à vos questions ou organiser un rendez-vous avec l’équipe — que souhaitez-vous savoir ?',
      MAIN_CHIPS, 600
    )
  }

  function goto(anchor) {
    /* ancre locale sur index, sinon retour vers index.html#… */
    if (!onPricing || anchor === 'pricing.html') {
      if (anchor === 'pricing.html') { location.href = anchor; return }
      closePanel()
      var el = document.querySelector(anchor)
      if (el) el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' })
    } else {
      location.href = anchor === 'pricing.html' ? anchor : HOME + anchor
    }
  }

  function handleChip(label) {
    clearChips()
    addMsg('user', label)
    var n = norm(label)
    if (n.indexOf('services') > -1 && n.indexOf('voir') > -1) return void setTimeout(function () { goto('#services') }, 350)
    if (n.indexOf('tarifs') > -1 && n.indexOf('voir') > -1) return void setTimeout(function () { location.href = 'pricing.html' }, 350)
    if (n.indexOf('formulaire') > -1) return void setTimeout(function () { goto('#contact') }, 350)
    if (n.indexOf('email') > -1 && flow === null && pendingMailto) return void openMailto()
    if (n.indexOf('passer') > -1 && flow) return void flowAnswer('')
    if (n.indexOf('retour') > -1) return void botSay('Que souhaitez-vous savoir d’autre ?', MAIN_CHIPS, 350)
    if (n.indexOf('rendez-vous') > -1 || n.indexOf('rdv') > -1) return void startFlow('rdv')
    if (n.indexOf('recontact') > -1) return void startFlow('recontact')
    if (n.indexOf('services') > -1) return void answerFaq('services')
    if (n.indexOf('marche') > -1) return void answerFaq('process')
    if (n.indexOf('tarifs') > -1) return void answerFaq('tarifs')
    if (n.indexOf('securite') > -1) return void answerFaq('securite')
    botSay('Que souhaitez-vous savoir ?', MAIN_CHIPS, 350)
  }

  function answerFaq(key) {
    var f = FAQ[key]
    botSay(f.reply, f.chips)
  }

  /* ── Capture séquentielle ── */
  function startFlow(name) {
    flow = { name: name, stepIdx: -1, data: {} }
    var f = FLOWS[name]
    botSay(f.intro, null, 450)
    setTimeout(nextStep, reduced ? 120 : 1100)
  }
  function nextStep() {
    var f = FLOWS[flow.name]
    flow.stepIdx++
    if (flow.stepIdx >= f.steps.length) return void finishFlow()
    var step = f.steps[flow.stepIdx]
    botSay(step.q, step.optional ? ['Passer'] : null, 420)
    setTimeout(function () { input.focus() }, reduced ? 150 : 900)
  }
  function flowAnswer(text) {
    var f = FLOWS[flow.name]
    var step = f.steps[flow.stepIdx]
    if (text) addMsg('user', text)
    else if (step.optional) addMsg('user', 'Passer')
    if (step.validate === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text.trim())) {
      botSay('Hmm, cet email ne semble pas valide — pouvez-vous vérifier ?', null, 350)
      return
    }
    if (!text && !step.optional) {
      botSay(step.q, null, 300)
      return
    }
    flow.data[step.key] = text.trim()
    clearChips()
    nextStep()
  }

  var pendingMailto = null
  function finishFlow() {
    var f = FLOWS[flow.name]
    var data = flow.data
    var type = flow.name
    flow = null
    submitLead(type, data).then(function (ok) {
      if (ok) {
        botSay(f.done(data) + '<br><br>Autre chose ?', ['Retour au menu'])
      } else {
        /* Pas de webhook configuré (ou erreur réseau) : on bascule sur l'email */
        pendingMailto = buildMailto(type, data)
        botSay(
          f.done(data) + '<br><br>Pour finaliser l’envoi, cliquez ci-dessous — votre client email s’ouvrira avec le récapitulatif prêt à partir.',
          ['Envoyer par email', 'Retour au menu']
        )
      }
    })
  }
  function buildMailto(type, d) {
    var subject = type === 'rdv'
      ? 'Demande de rendez-vous — ' + (d.name || '')
      : 'Demande de contact — ' + (d.name || '')
    var labels = { name: 'Nom', email: 'Email', phone: 'Téléphone', company: 'Entreprise', need: 'Besoin', availability: 'Disponibilités', message: 'Message' }
    var lines = Object.keys(d)
      .filter(function (k) { return d[k] !== '' && d[k] != null })
      .map(function (k) { return (labels[k] || k) + ' : ' + d[k] })
    return 'mailto:' + CFG.contactEmail + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(lines.join('\n'))
  }
  function openMailto() {
    if (!pendingMailto) return
    location.href = pendingMailto
    pendingMailto = null
    botSay('Votre client email vient de s’ouvrir. Si rien ne s’est passé, écrivez-nous directement à <a href="mailto:' + CFG.contactEmail + '">' + CFG.contactEmail + '</a>.', ['Retour au menu'])
  }

  /* ── Envoi lead → n8n ── */
  function submitLead(type, data) {
    if (!CFG.leadWebhook) return Promise.resolve(false)
    var payload = Object.assign({ type: type, page: location.pathname, ts: new Date().toISOString(), sessionId: sessionId }, data)
    return fetch(CFG.leadWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(function (r) { return r.ok }).catch(function () { return false })
  }

  /* ── Texte libre ── */
  function handleFree(text) {
    addMsg('user', text)
    if (flow) { /* géré dans flowAnswer — ne devrait pas arriver ici */ }
    if (CFG.chatWebhook) {
      showTyping()
      fetch(CFG.chatWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionId, message: text, page: location.pathname }),
      })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json() })
        .then(function (j) {
          hideTyping()
          addMsg('bot', esc(j.reply || '').replace(/\n/g, '<br>'))
          addChips(j.chips || null)
        })
        .catch(function () { hideTyping(); localAnswer(text) })
      return
    }
    localAnswer(text)
  }
  function localAnswer(text) {
    var n = norm(text)
    var has = function (words) {
      return words.some(function (w) { return n.indexOf(w) > -1 })
    }
    if (has(['rdv', 'rendez', 'appel', 'reserver', 'creneau', 'dispo'])) {
      botSay('Bien sûr — je peux organiser ça tout de suite.', ['Prendre un rendez-vous'])
    } else if (has(['prix', 'tarif', 'cout', 'combien', 'budget', 'formule'])) {
      answerFaq('tarifs')
    } else if (has(['securit', 'donnee', 'rgpd', 'confident', 'chiffr'])) {
      answerFaq('securite')
    } else if (has(['marche', 'process', 'deroul', 'etape', 'commence', 'fonctionn'])) {
      answerFaq('process')
    } else if (has(['service', 'agent', 'automat', 'offre', 'faites', 'proposez'])) {
      answerFaq('services')
    } else if (has(['contact', 'joindre', 'recontact', 'ecrire'])) {
      botSay('Deux options : je prends vos coordonnées ici, ou vous passez par le formulaire de contact.', ['Être recontacté', 'Aller au formulaire'])
    } else if (has(['bonjour', 'salut', 'hello', 'bonsoir'])) {
      botSay('Bonjour ! Que puis-je faire pour vous ?', MAIN_CHIPS)
    } else if (has(['merci'])) {
      botSay('Avec plaisir ! Autre chose ?', ['Retour au menu'])
    } else {
      botSay(
        'Bonne question — je n’ai pas encore la réponse sous la main, mais l’équipe l’aura. Le plus simple : un échange rapide.',
        ['Prendre un rendez-vous', 'Être recontacté', 'Retour au menu']
      )
    }
  }

  /* ═══════════════════ OUVERTURE / FERMETURE ═══════════════════ */
  var isOpen = false
  function openPanel(startFlowName) {
    if (isOpen) { if (startFlowName) startFlow(startFlowName); return }
    isOpen = true
    root.classList.add('is-open')
    panel.classList.add('is-open')
    fab.setAttribute('aria-expanded', 'true')
    fab.setAttribute('aria-label', 'Fermer l’assistant D&S')
    hideNudge(true)
    var firstGreet = !greeted
    greet()
    if (startFlowName) {
      /* laisse le message d'accueil s'afficher avant de lancer le flow */
      setTimeout(function () { startFlow(startFlowName) }, firstGreet ? (reduced ? 200 : 1500) : 0)
    }
    setTimeout(function () { input.focus({ preventScroll: true }) }, 350)
  }
  function closePanel() {
    if (!isOpen) return
    isOpen = false
    root.classList.remove('is-open')
    panel.classList.remove('is-open')
    fab.setAttribute('aria-expanded', 'false')
    fab.setAttribute('aria-label', 'Ouvrir l’assistant D&S')
    fab.focus({ preventScroll: true })
  }

  fab.addEventListener('click', function () { isOpen ? closePanel() : openPanel() })
  closeBtn.addEventListener('click', closePanel)
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen) closePanel()
  })

  inputForm.addEventListener('submit', function (e) {
    e.preventDefault()
    var text = input.value.trim()
    if (!text) return
    input.value = ''
    if (flow) flowAnswer(text)
    else handleFree(text)
  })

  /* Invite après 3s (une seule fois par session) */
  function hideNudge(remember) {
    nudge.classList.remove('is-visible')
    if (remember) sessionStorage.setItem('ds-nudged', '1')
  }
  if (!sessionStorage.getItem('ds-nudged')) {
    setTimeout(function () {
      if (!isOpen) nudge.classList.add('is-visible')
      setTimeout(function () { hideNudge(true) }, 14000)
    }, 3000)
  }
  nudge.addEventListener('click', function () { openPanel() })

  /* API publique : les CTA du site peuvent ouvrir l'assistant (ex. flow RDV) */
  window.DSAssistant = { open: openPanel, close: closePanel }

  /* Deep-link : #assistant ou #assistant-rdv dans l'URL ouvre le panneau */
  if (/#assistant/.test(location.hash)) {
    setTimeout(function () { openPanel(/rdv/.test(location.hash) ? 'rdv' : null) }, 600)
  }

  /* ═══════════════════ FORMULAIRE DE CONTACT ═══════════════════ */
  var form = document.getElementById('ds-contact-form')
  if (form) {
    var submitBtn = form.querySelector('button[type="submit"]')
    var errEl = form.querySelector('.form-error')

    function setFieldError(field, on) {
      field.style.borderColor = on ? '#e5484d' : ''
      field.setAttribute('aria-invalid', on ? 'true' : 'false')
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault()
      if (form.querySelector('[name="website"]').value) return /* honeypot anti-spam */

      var name = form.querySelector('[name="name"]')
      var email = form.querySelector('[name="email"]')
      var message = form.querySelector('[name="message"]')
      var bad = false
      ;[name, email, message].forEach(function (f) {
        var empty = !f.value.trim()
        setFieldError(f, empty)
        if (empty) bad = true
      })
      if (!bad && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim())) {
        setFieldError(email, true)
        bad = true
      }
      if (bad) {
        errEl.textContent = 'Merci de compléter les champs entourés en rouge.'
        errEl.style.display = 'block'
        return
      }
      errEl.style.display = 'none'

      var data = {
        name: name.value.trim(),
        email: email.value.trim(),
        phone: (form.querySelector('[name="phone"]') || {}).value ? form.querySelector('[name="phone"]').value.trim() : '',
        company: form.querySelector('[name="company"]').value.trim(),
        need: form.querySelector('[name="need"]').value,
        message: message.value.trim(),
      }

      var label = submitBtn.querySelector('span')
      var initialLabel = label.textContent
      submitBtn.disabled = true
      label.textContent = 'Envoi en cours…'

      submitLead('contact', data).then(function (ok) {
        if (ok) {
          showFormSuccess(false)
        } else if (CFG.leadWebhook) {
          /* webhook configuré mais injoignable */
          submitBtn.disabled = false
          label.textContent = initialLabel
          errEl.textContent = 'L’envoi a échoué — réessayez, ou écrivez-nous à ' + CFG.contactEmail
          errEl.style.display = 'block'
        } else {
          /* pas encore de webhook : fallback email */
          location.href = buildMailto('contact', data)
          showFormSuccess(true)
        }
      })
    })

    function showFormSuccess(viaEmail) {
      form.innerHTML =
        '<div style="text-align:center;padding:46px 10px">' +
        '  <div style="width:52px;height:52px;border-radius:50%;margin:0 auto 22px;background:linear-gradient(135deg,#6a5cff,#00b2ff);display:flex;align-items:center;justify-content:center;box-shadow:0 10px 28px rgba(106,92,255,0.30)">' +
        '    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true"><path d="M4.5 11.5 9 16 17.5 6.5" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '  </div>' +
        '  <h3 class="font-heading" style="font-family:\'Space Grotesk\',sans-serif;font-weight:700;font-size:1.15rem;letter-spacing:-0.02em;margin-bottom:12px">' +
        (viaEmail ? 'Votre email est prêt' : 'Message envoyé') +
        '  </h3>' +
        '  <p style="color:#6b7280;font-size:14px;line-height:1.7;font-weight:300;max-width:340px;margin:0 auto">' +
        (viaEmail
          ? 'Votre client email vient de s’ouvrir avec votre demande pré-remplie — il ne reste qu’à cliquer sur envoyer. Si rien ne s’est ouvert, écrivez-nous à <a href="mailto:' + CFG.contactEmail + '" style="color:#6a5cff">' + CFG.contactEmail + '</a>.'
          : 'Merci ! L’équipe vous répond sous 24h ouvrées.') +
        '  </p>' +
        '</div>'
      form.setAttribute('aria-live', 'polite')
    }
  }
})()
