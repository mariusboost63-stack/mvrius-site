/* ==========================================================================
   Mvrius — interactions & motion design (aucune dépendance)
   ========================================================================== */
(() => {
  'use strict';
  window.MV = true;

  const root = document.documentElement;
  const reduced = root.classList.contains('reduced');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const wide = matchMedia('(min-width: 961px)');

  /* ---------- Mode allégé (ordinateurs modestes) ---------- */
  // Quand la page manque de fluidité, les effets décoratifs les plus coûteux sont coupés (classe « lite »,
  // voir style.css). La mesure est faite une fois, après l'intro, et son résultat est gardé une semaine.
  const LITE_KEY = 'mv-lite';
  let liteMemo = null;
  try { liteMemo = JSON.parse(localStorage.getItem(LITE_KEY) || 'null'); } catch (e) { /* stockage indisponible */ }
  if (!liteMemo || typeof liteMemo.t !== 'number' || Date.now() - liteMemo.t > 7 * 864e5) liteMemo = null;
  if (liteMemo?.lite || (navigator.deviceMemory || 8) <= 2 || (navigator.hardwareConcurrency || 8) <= 2) root.classList.add('lite');
  const lite = () => root.classList.contains('lite');

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const SPACES = /([ \t\n\r]+)/; // l'espace insécable reste collé au mot
  const PUNCT = /^[  ]?[.,;:!?…)»]+$/;

  /* ---------- Découpage des titres en mots ---------- */
  function splitWords(el) {
    let i = 0;
    const walk = node => {
      [...node.childNodes].forEach(child => {
        if (child.nodeType === Node.TEXT_NODE) {
          const frag = document.createDocumentFragment();
          child.textContent.split(SPACES).forEach(part => {
            if (!part) return;
            if (SPACES.test(part) && !part.trim()) { frag.append(part); return; }
            const w = document.createElement('span');
            const inner = document.createElement('span');
            w.className = 'w';
            inner.textContent = part;
            inner.style.setProperty('--i', i++);
            w.append(inner);
            frag.append(w);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName !== 'BR') {
          walk(child);
        }
      });
    };
    walk(el);
    // Évite qu'une ponctuation se retrouve seule en début de ligne
    $$('.w', el).forEach(w => {
      if (!PUNCT.test(w.textContent)) return;
      const prev = w.previousSibling;
      if (!prev || prev.nodeType !== Node.ELEMENT_NODE) return;
      const nw = document.createElement('span');
      nw.className = 'nw';
      prev.before(nw);
      nw.append(prev, w);
    });
    el.classList.add('is-split');
  }
  $$('[data-split]').forEach(splitWords);

  /* ---------- Intro ---------- */
  // Position de défilement (le navigateur ne la restaure pas, voir <head>) : on repart du haut
  // à chaque rechargement, et on retrouve sa position avec le bouton Retour.
  if (root.dataset.nav) {
    const scrollKey = `mv-scroll-${location.pathname}`;
    const jump = top => scrollTo({ top, left: 0, behavior: 'instant' });
    if (root.dataset.nav === 'reload') {
      jump(0);
      addEventListener('load', () => jump(0), { once: true });
    } else if (root.dataset.nav === 'back_forward') {
      let saved = null;
      try { saved = sessionStorage.getItem(scrollKey); } catch (e) { /* stockage indisponible */ }
      if (saved !== null) addEventListener('load', () => jump(+saved), { once: true });
    }
    addEventListener('pagehide', () => {
      try { sessionStorage.setItem(scrollKey, String(Math.round(scrollY))); } catch (e) { /* stockage indisponible */ }
    });
  }
  const loader = $('.loader');
  const startIntro = () => {
    root.classList.add('is-ready');
    setTimeout(measureSmoothness, 400);
  };

  // Le mode allégé est retenu une semaine ; un ordinateur fluide est re-mesuré à chaque visite.
  function rememberLite() {
    try { localStorage.setItem(LITE_KEY, JSON.stringify({ lite: true, t: Date.now() })); } catch (e) { /* stockage indisponible */ }
  }

  // Fluidité mesurée pendant 2,5 s, au moment où l'intro s'anime : si plus d'une image sur quatre
  // met plus de 34 ms (moins de 30 images par seconde), on passe en mode allégé.
  function measureSmoothness() {
    if (liteMemo || lite() || reduced || document.hidden) return;
    const frames = [];
    let last = 0;
    const start = performance.now();
    const tick = t => {
      if (document.hidden) return; // onglet masqué : mesure faussée, on réessaiera à la prochaine visite
      if (last) frames.push(t - last);
      last = t;
      if (t - start < 2500) { requestAnimationFrame(tick); return; }
      if (frames.length < 20) return;
      if (frames.filter(d => d > 34).length / frames.length > .25) {
        rememberLite();
        enableLite();
      }
    };
    requestAnimationFrame(tick);
  }

  // Pendant l'utilisation (défilement, souris), la boucle d'animation note la durée de ses images :
  // si plus d'une sur cinq dépasse 34 ms, on passe aussi en mode allégé.
  const usage = { prev: 0, n: 0, slow: 0 };
  function noteFrame(t) {
    if (lite() || reduced) return;
    // Seulement les images qui se suivent (la boucle était active), pas la reprise après un repos
    if (usage.prev && t - usage.prev < 250) {
      usage.n++;
      if (t - usage.prev > 34) usage.slow++;
      if (usage.n >= 120) {
        if (usage.slow / usage.n > .2) {
          rememberLite();
          enableLite();
        }
        usage.n = usage.slow = 0;
      }
    }
    usage.prev = t;
  }

  if (loader && getComputedStyle(loader).display !== 'none') {
    // La barre et le titre sont animés en CSS : ils restent fluides même pendant le chargement.
    // L'intro se termine au plus tôt à MIN ms après l'ouverture de la page, une fois les polices prêtes.
    const tips = $$('.loader__tips li');
    const tipEl = $('.js-loader-tip');
    if (tips.length && tipEl) tipEl.textContent = tips[Math.floor(Math.random() * tips.length)].textContent;
    const MIN = tips.length ? 1900 : 1300;
    Promise.all([
      wait(Math.max(0, MIN - performance.now())),
      Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), wait(1200)]),
    ]).then(() => {
      loader.classList.add('is-done');
      setTimeout(startIntro, 250);
      setTimeout(() => loader.remove(), 1100);
    });
  } else {
    if (loader) loader.remove();
    requestAnimationFrame(() => requestAnimationFrame(startIntro));
  }

  /* ---------- Apparitions au scroll ---------- */
  $$('[data-stagger]').forEach(group => {
    $$(':scope > [data-reveal]', group).forEach((el, i) => el.style.setProperty('--d', i * 90));
  });
  $$('.footer__word span').forEach((s, i) => s.style.setProperty('--d', i * 70));

  const revealTargets = $$('[data-reveal], [data-split], .footer__word');
  if (reduced || !('IntersectionObserver' in window)) {
    revealTargets.forEach(el => el.classList.add('is-in'));
  } else {
    const show = (entries, obs) => entries.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-in');
      obs.unobserve(e.target);
    });
    const io = new IntersectionObserver(show, { rootMargin: '0px 0px -12% 0px', threshold: 0 }); // fiable même pour les blocs très hauts
    // Tout en bas de la page, la marge empêcherait l'apparition : on observe sans marge
    const ioEnd = new IntersectionObserver(show, { threshold: 0 });
    const endY = document.documentElement.scrollHeight - innerHeight * .15;
    revealTargets.forEach(el => (el.getBoundingClientRect().bottom + scrollY > endY ? ioEnd : io).observe(el));
  }
  // Une fois apparu, on retire le délai pour que les survols restent vifs
  document.addEventListener('transitionend', e => {
    if (e.propertyName === 'transform' && e.target.matches?.('[data-reveal].is-in')) e.target.classList.add('revealed');
  });

  const pad2 = n => String(n).padStart(2, '0');
  // Textes de l'interface selon la langue de la page (<html lang>)
  const LANG = root.lang === 'en' ? 'en' : 'fr';
  const T = {
    fr: {
      locale: 'fr-FR', typing: "est en train d'écrire…", today: "Aujourd'hui à",
      reviewsPause: 'Mettre en pause le défilement des avis', reviewsPlay: 'Reprendre le défilement des avis',
      copied: 'Adresse copiée !', linkCopied: 'Lien copié !', sending: 'Envoi en cours…',
      invalid: 'Merci de compléter les champs en rouge.', failed: "L'envoi n'a pas fonctionné. Écrivez-moi directement à",
      menuOpen: 'Ouvrir le menu', menuClose: 'Fermer le menu',
      diagDone: 'Résultat', colon: '\u00a0: ',
      diagShare: score => ({
        text: `J'ai obtenu ${score}/100 au diagnostic express de mon serveur Discord. Et le vôtre\u00a0?`,
        url: `https://mvriuus.fr/diagnostic/${score}/`,
      }),
      shareCopied: 'Copié ! Collez-le sur Discord',
      diagMessage: (score, weak) => `Bonjour, j'ai fait le diagnostic express : ${score}/100.`
        + (weak.length ? ` Points à améliorer : ${weak.join(', ')}.` : '') + ' J\'aimerais en discuter avec vous.',
    },
    en: {
      locale: 'en-US', typing: 'is typing…', today: 'Today at',
      reviewsPause: 'Pause the reviews', reviewsPlay: 'Resume the reviews',
      copied: 'Address copied!', linkCopied: 'Link copied!', sending: 'Sending…',
      invalid: 'Please fill in the fields in red.', failed: "Sending didn't work. Email me directly at",
      menuOpen: 'Open menu', menuClose: 'Close menu',
      diagDone: 'Result', colon: ': ',
      diagShare: score => ({
        text: `My Discord server scored ${score}/100 on the quick check-up. What about yours?`,
        url: 'https://mvriuus.fr/en/#diagnostic',
      }),
      shareCopied: 'Copied! Paste it on Discord',
      diagMessage: (score, weak) => `Hi, I took the quick check-up: ${score}/100.`
        + (weak.length ? ` Areas to improve: ${weak.join(', ')}.` : '') + ' I would like to discuss it with you.',
    },
  }[LANG];
  const numberFormat = new Intl.NumberFormat(T.locale);
  const fmt = n => numberFormat.format(n);

  /* ---------- Compteurs Discord en direct ---------- */
  function animateNumber(el, to) {
    if (reduced) { el.textContent = fmt(to); return; }
    const t0 = performance.now();
    const step = t => {
      const p = clamp((t - t0) / 1400, 0, 1);
      el.textContent = fmt(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  function whenVisible(el, fn) {
    if (!('IntersectionObserver' in window)) return fn();
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      fn();
    }, { rootMargin: '0px 0px -20% 0px' });
    io.observe(el);
  }
  // Les chiffres viennent de l'invitation publique de chaque serveur, demandée à Discord depuis le
  // navigateur et gardée 10 min. Si Discord ne répond pas (limite d'appels, bloqueur, VPN…), le site
  // se sert du relevé fait toutes les heures par GitHub (tools/discord_counts.py), puis de la
  // dernière valeur vue par le visiteur.
  const store = {
    get: key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; } },
    set: (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* stockage indisponible */ } },
  };
  const SNAPSHOT = 'https://raw.githubusercontent.com/mariusboost63-stack/mvrius-site/data/discord.json';
  let snapshot = null;
  const getSnapshot = () => (snapshot = snapshot || fetch(SNAPSHOT, { cache: 'no-cache' })
    .then(r => (r.ok ? r.json() : null)).then(d => (d && d.servers) || {}).catch(() => ({})));
  let discordDown = false;
  let inviteQueue = Promise.resolve();
  function fetchInvite(code) {
    const key = `mv-invite-${code}`;
    const cached = store.get(key);
    if (cached && Date.now() - cached.t < 10 * 60 * 1000) return Promise.resolve(cached);
    // Une requête à la fois : Discord refuse les appels trop rapprochés
    const request = async () => {
      if (discordDown) throw new Error('Discord indisponible');
      for (let attempt = 0; attempt < 2; attempt++) {
        const timeout = window.AbortSignal && AbortSignal.timeout ? AbortSignal.timeout(4000) : undefined;
        const res = await fetch(`https://discord.com/api/v10/invites/${code}?with_counts=true`, { signal: timeout });
        if (res.status === 429 && !attempt) {
          const { retry_after: retry = 1 } = await res.json().catch(() => ({}));
          await wait(Math.min(retry, 3) * 1000);
          continue;
        }
        if (!res.ok) throw new Error(res.status);
        const d = await res.json();
        const data = { t: Date.now(), members: d.approximate_member_count, online: d.approximate_presence_count };
        store.set(key, data);
        return data;
      }
      throw new Error('Discord indisponible');
    };
    const result = inviteQueue.then(request).catch(async err => {
      // Discord injoignable ou limité depuis ce navigateur : inutile d'insister pour les serveurs
      // suivants (seule une invitation introuvable ne concerne que ce serveur)
      if (!['400', '404'].includes(err.message)) discordDown = true;
      const snap = (await getSnapshot())[code];
      if (snap && snap.members) return { members: snap.members, online: snap.online || 0 };
      if (cached) return { ...cached, online: 0 }; // dernière valeur connue, sans « en ligne »
      throw new Error('Aucun chiffre disponible');
    });
    inviteQueue = result.catch(() => {});
    return result;
  }
  const invites = $$('[data-invite]').map(row => {
    const code = row.dataset.invite;
    return fetchInvite(code).then(({ members: total, online }) => {
      if (!total) return 0;
      const count = $('.prow__count', row);
      const live = $('.prow__live', row);
      whenVisible(row, () => {
        count.hidden = false;
        live.hidden = !online;
        animateNumber($('[data-members]', row), total);
        if (online) animateNumber($('[data-online]', row), online);
      });
      // Carte d'aperçu au survol
      const card = $(`.pcard[data-code="${code}"] .pcard__count`);
      if (card) { $('b', card).textContent = fmt(total); card.hidden = false; }
      document.dispatchEvent(new CustomEvent('mv:counts', { detail: { code, members: total, online } }));
      return total;
    }).catch(() => 0); // Discord injoignable : on garde les valeurs affichées
  });

  // Somme des membres de toutes les communautés, affichée sous l'accueil
  const totalEl = $('.js-total');
  if (totalEl && invites.length) {
    Promise.all(invites).then(values => {
      const sum = values.reduce((a, b) => a + b, 0);
      if (!sum) return;
      totalEl.closest('[hidden]')?.removeAttribute('hidden');
      const start = () => animateNumber(totalEl, sum);
      if (root.classList.contains('is-ready')) start(); else setTimeout(start, 1600);
    });
  }

  /* ---------- Projets : autres communautés sur demande ---------- */
  const plistMore = $('.js-plist-more');
  plistMore?.addEventListener('click', () => {
    const extra = $$('.plist__item--more');
    extra.forEach((el, i) => { el.style.setProperty('--d', i * 90); el.classList.add('is-shown'); });
    plistMore.closest('.plist__foot').remove();
    $('.prow', extra[0])?.focus({ preventScroll: true });
  });

  /* ---------- Projets : aperçu qui suit la souris ---------- */
  const preview = $('.js-ppreview');
  const pv = { x: 0, y: 0, s: 0, target: 0 };
  if (preview && finePointer && !reduced) {
    root.classList.add('has-preview');
    const strip = $('.ppreview__strip', preview);
    $$('.prow').forEach(row => {
      row.addEventListener('pointerenter', e => {
        if (lite()) return;
        if (pv.s < .05) { pv.x = e.clientX; pv.y = e.clientY; }
        pv.target = 1;
        strip.style.transform = `translateY(${-row.dataset.preview * 100}%)`;
        wake();
      });
      row.addEventListener('pointerleave', () => { pv.target = 0; wake(); });
    });
  }

  /* ---------- Formulaires (devis, candidature) ---------- */
  $$('.js-quote').forEach(form => {
    const status = $('.quote__status', form);
    const label = $('.quote__label', form);
    const labelText = label.textContent;
    const mailto = data => 'mailto:contact@mvriuus.fr?subject=' + encodeURIComponent(form.dataset.mailSubject || 'mvriuus.fr')
      + '&body=' + encodeURIComponent(Object.entries(data).filter(([k]) => !k.startsWith('_')).map(([k, v]) => `${k} : ${v}`).join('\n'));
    form.addEventListener('submit', async e => {
      e.preventDefault();
      status.textContent = '';
      if (!form.checkValidity()) {
        form.classList.add('was-validated');
        status.textContent = T.invalid;
        $(':invalid:not(fieldset)', form)?.focus();
        return;
      }
      if (form.elements._honey.value) return;
      const data = Object.fromEntries(new FormData(form));
      form.classList.add('is-sending');
      label.textContent = T.sending;
      try {
        const res = await fetch('https://formsubmit.co/ajax/contact@mvriuus.fr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(data),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || String(json.success) !== 'true') throw new Error(json.message || res.status);
        form.classList.add('is-done');
        $('.quote__done', form).hidden = false;
        form.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
      } catch (err) {
        status.innerHTML = `${T.failed} <a href="${mailto(data)}">contact@mvriuus.fr</a>.`;
      } finally {
        form.classList.remove('is-sending');
        label.textContent = labelText;
      }
    });
  });

  /* ---------- Copier l'adresse e-mail ---------- */
  $$('.js-copy').forEach(btn => {
    const status = $('.copy__status', btn);
    let t;
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
        status.textContent = T.copied;
      } catch (e) {
        window.location.href = 'mailto:' + btn.dataset.copy;
        return;
      }
      btn.classList.add('is-copied');
      clearTimeout(t);
      t = setTimeout(() => { btn.classList.remove('is-copied'); status.textContent = ''; }, 2200);
    });
  });

  /* ---------- Articles : partage ---------- */
  const shareBtn = $('.js-share');
  if (shareBtn && navigator.share) {
    shareBtn.hidden = false;
    shareBtn.addEventListener('click', () => {
      navigator.share({ title: shareBtn.dataset.title, url: shareBtn.dataset.url }).catch(() => {});
    });
  }
  $$('.js-share-copy').forEach(btn => {
    const label = $('.js-share-label', btn);
    const text = label.textContent;
    let t;
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.url);
      } catch (e) {
        window.prompt(text, btn.dataset.url);
        return;
      }
      label.textContent = T.linkCopied;
      btn.classList.add('is-copied');
      clearTimeout(t);
      t = setTimeout(() => { btn.classList.remove('is-copied'); label.textContent = text; }, 2200);
    });
  });

  /* ---------- Articles : sommaire (partie en cours de lecture) ---------- */
  const toc = $('.js-toc');
  if (toc && 'IntersectionObserver' in window) {
    const tocLinks = $$('a', toc);
    const heads = tocLinks.map(a => document.getElementById(decodeURIComponent(a.hash.slice(1))));
    const setToc = i => tocLinks.forEach((a, k) => a.classList.toggle('is-active', k === i));
    // Partie en cours : le dernier intertitre passé au-dessus du tiers haut de l'écran.
    // Recalculé seulement quand un intertitre franchit cette ligne.
    const io = new IntersectionObserver(() => {
      const line = innerHeight * .34;
      let current = -1;
      heads.forEach((h, i) => { if (h && h.getBoundingClientRect().top < line) current = i; });
      setToc(current);
    }, { rootMargin: '0px 0px -66% 0px' });
    heads.forEach(h => h && io.observe(h));
  }

  /* ---------- Bots Arvenis : photos et bannières à jour ---------- */
  const botCards = $$('[data-bot]');
  if (botCards.length) {
    fetch('https://api.arvenis.fr/profiles')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!data || !data.bots) return;
        botCards.forEach(card => {
          const bot = data.bots[card.dataset.bot];
          if (!bot) return;
          const base = url => (url || '').split('?')[0];
          const av = $('.js-bot-avatar', card);
          if (av && bot.avatar && base(av.src) !== base(bot.avatar)) {
            av.onerror = () => { av.onerror = null; av.src = av.dataset.fallback; };
            av.src = base(bot.avatar) + '?size=128';
          }
          const banner = $('.js-bot-banner', card);
          if (banner && bot.banner && base(banner.src) !== base(bot.banner)) banner.src = bot.banner;
        });
      })
      .catch(() => {});
  }

  /* ---------- Avis : salon Discord, un avis à la fois ---------- */
  const dchan = $('.js-dchan');
  if (dchan) {
    const msgs = $$('.dmsg', dchan);
    const tabs = $$('[role="tab"]', dchan);
    const typing = $('.dchan__typing', dchan);
    const typingName = $('.js-dtyping', dchan);
    const num = $('.js-dchan-num', dchan);
    const pauseBtn = $('.js-dchan-pause', dchan);
    let current = -1;
    let run = 0;
    // Temps de lecture de chaque avis : environ 4 mots par seconde, entre 6 et 18 s
    tabs.forEach((tab, i) => {
      const words = $('.dmsg__text', msgs[i]).textContent.trim().split(/\s+/).length;
      tab.style.setProperty('--dur', `${clamp(3 + words / 4, 6, 18).toFixed(1)}s`);
    });
    // L'avis arrive après « … est en train d'écrire », comme sur Discord
    const show = async (i, focus = false) => {
      i = (i + msgs.length) % msgs.length;
      if (i === current) return;
      const first = current < 0;
      current = i;
      const id = ++run;
      tabs.forEach((tab, j) => {
        tab.setAttribute('aria-selected', String(j === i));
        tab.tabIndex = j === i ? 0 : -1;
      });
      if (focus) tabs[i].focus();
      num.textContent = i + 1;
      msgs.forEach(m => m.classList.remove('is-in'));
      if (!reduced) {
        dchan.classList.add('is-typing');
        typingName.textContent = `${msgs[i].dataset.name} ${T.typing}`;
        typing.classList.add('is-on');
        await wait(first ? 900 : 650);
        if (id !== run) return;
        typing.classList.remove('is-on');
      }
      dchan.classList.remove('is-typing');
      msgs[i].classList.add('is-in');
    };
    const setPaused = paused => {
      dchan.classList.toggle('is-paused', paused);
      pauseBtn.setAttribute('aria-label', paused ? T.reviewsPlay : T.reviewsPause);
    };
    // Choisir un avis met le défilement en pause (le bouton le relance)
    const choose = (i, focus) => { setPaused(true); show(i, focus); };

    // Défilement automatique : la barre de l'avis affiché sert de minuteur. Elle s'arrête
    // au survol, quand le salon a le focus ou quand il sort de l'écran.
    whenVisible(dchan, () => {
      show(0);
      if (!reduced) dchan.classList.add('is-live');
    });
    dchan.addEventListener('animationend', e => { if (e.animationName === 'dchan-progress') show(current + 1); });
    if (finePointer) {
      dchan.addEventListener('mouseenter', () => dchan.classList.add('is-hold'));
      dchan.addEventListener('mouseleave', () => dchan.classList.remove('is-hold'));
    }
    // (au clavier seulement, et pas sur le bouton pause, qui doit pouvoir relancer)
    dchan.addEventListener('focusin', e => {
      if (e.target !== pauseBtn && e.target.matches(':focus-visible')) dchan.classList.add('is-hold');
    });
    dchan.addEventListener('focusout', e => { if (!dchan.contains(e.relatedTarget)) dchan.classList.remove('is-hold'); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => dchan.classList.toggle('is-off', !e.isIntersecting)).observe(dchan);
    }

    pauseBtn.addEventListener('click', () => {
      const paused = !dchan.classList.contains('is-paused');
      setPaused(paused);
      if (!paused) dchan.classList.remove('is-hold');
    });
    $('.js-dchan-prev', dchan).addEventListener('click', () => choose(current - 1));
    $('.js-dchan-next', dchan).addEventListener('click', () => choose(current + 1));
    tabs.forEach((tab, i) => tab.addEventListener('click', () => choose(i)));
    // Clavier : flèches, Début et Fin dans la liste des clients
    $('[role="tablist"]', dchan).addEventListener('keydown', e => {
      const to = { ArrowRight: current + 1, ArrowDown: current + 1, ArrowLeft: current - 1, ArrowUp: current - 1, Home: 0, End: msgs.length - 1 }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      choose(to, true);
    });
    // Mobile : glisser le doigt sur l'avis pour passer au suivant ou au précédent
    const stage = $('.dchan__stage', dchan);
    let startX = null;
    let startY = 0;
    stage.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') { startX = e.clientX; startY = e.clientY; } });
    stage.addEventListener('pointercancel', () => { startX = null; });
    stage.addEventListener('pointerup', e => {
      if (startX === null) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      startX = null;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) choose(current + (dx < 0 ? 1 : -1));
    });
  }

  /* ---------- Diagnostic express ---------- */
  const diag = $('.js-diag');
  if (diag) {
    const qs = $$('.diag__q', diag);
    const result = $('.js-diag-result', diag);
    const panels = [...qs, result];
    const stepEl = $('.js-diag-step', diag);
    const bar = $('.js-diag-bar', diag);
    const back = $('.js-diag-back', diag);
    const ring = $('.js-diag-ring', diag);
    const answers = new Array(qs.length).fill(0);
    let cur = 0;
    let summary = null;

    const go = (n, dir = 1) => {
      const from = panels[cur];
      const to = panels[n];
      from.style.setProperty('--from', `${-40 * dir}px`);
      from.classList.remove('is-active');
      to.hidden = false;
      to.style.setProperty('--from', `${40 * dir}px`);
      void to.offsetWidth; // point de départ de l'animation
      to.classList.add('is-active');
      cur = n;
      const done = n === qs.length;
      stepEl.textContent = done ? T.diagDone : `Question ${n + 1} / ${qs.length}`;
      bar.style.width = `${(done ? 1 : n / qs.length) * 100}%`;
      back.hidden = n === 0 || done;
      if (!done && diag.contains(document.activeElement)) $('.diag__a', to).focus({ preventScroll: true });
    };

    const showResult = () => {
      const score = Math.round(answers.reduce((a, b) => a + b, 0) / (qs.length * 2) * 100);
      const verdict = $$('.diag__verdicts li', diag).find(li => score >= +li.dataset.min);
      $('.js-diag-title', diag).textContent = verdict.dataset.title;
      $('.js-diag-text', diag).textContent = verdict.dataset.text;
      // Les 3 points les plus faibles deviennent des conseils
      const weak = qs.map((q, i) => ({ q, s: answers[i] })).filter(x => x.s < 2).sort((a, b) => a.s - b.s).slice(0, 3);
      const list = $('.js-diag-tips', diag);
      list.innerHTML = '';
      const items = weak.length ? weak.map(x => [x.q.dataset.label, x.q.dataset.tip]) : [[null, $('.diag__perfect', diag).textContent]];
      items.forEach(([label, tip]) => {
        const li = document.createElement('li');
        if (label) {
          const b = document.createElement('b');
          b.textContent = label + T.colon;
          li.append(b);
        }
        li.append(tip);
        list.append(li);
      });
      go(qs.length);
      ring.style.stroke = score >= 80 ? 'var(--online)' : score >= 50 ? '#f0b232' : '#ff6b6b';
      requestAnimationFrame(() => { ring.style.strokeDashoffset = 327 * (1 - score / 100); });
      animateNumber($('.js-diag-score', diag), score);
      summary = { score, weak: weak.map(x => x.q.dataset.label) };
    };

    qs.forEach((q, i) => {
      $$('.diag__a', q).forEach(btn => btn.addEventListener('click', () => {
        answers[i] = +btn.dataset.score;
        $$('.diag__a', q).forEach(b => b.classList.toggle('is-picked', b === btn));
        setTimeout(() => (i < qs.length - 1 ? go(i + 1) : showResult()), reduced ? 0 : 280);
      }));
    });
    // Raccourcis clavier A / B / C
    diag.addEventListener('keydown', e => {
      const idx = 'abc'.indexOf(e.key.toLowerCase());
      if (idx < 0 || cur >= qs.length || e.target.matches('input, textarea')) return;
      $$('.diag__a', qs[cur])[idx]?.click();
    });
    back.addEventListener('click', () => go(cur - 1, -1));
    $('.js-diag-restart', diag).addEventListener('click', () => {
      answers.fill(0);
      $$('.diag__a', diag).forEach(b => b.classList.remove('is-picked'));
      ring.style.strokeDashoffset = 327;
      summary = null;
      go(0, -1);
    });

    // « Partager mon score » : lien vers une page dont l'aperçu (Discord, X…) affiche le score
    const shareBtn = $('.js-diag-share', diag);
    const shareLabel = $('.js-diag-share-label', diag);
    const shareText = shareLabel.textContent;
    let shareT;
    shareBtn.addEventListener('click', async () => {
      if (!summary) return;
      const { text, url } = T.diagShare(summary.score);
      if (navigator.share) {
        try { await navigator.share({ text, url }); return; } catch (e) { if (e.name === 'AbortError') return; }
      }
      try {
        await navigator.clipboard.writeText(`${text} ${url}`);
      } catch (e) {
        window.prompt(shareText, url);
        return;
      }
      shareLabel.textContent = T.shareCopied;
      shareBtn.classList.add('is-copied');
      clearTimeout(shareT);
      shareT = setTimeout(() => { shareLabel.textContent = shareText; shareBtn.classList.remove('is-copied'); }, 2600);
    });

    // « Améliorer mon serveur » : le formulaire de devis est pré-rempli avec le résultat
    $('.js-diag-cta', diag).addEventListener('click', () => {
      const form = $('#contact .js-quote');
      if (!form || !summary) return;
      let hidden = form.elements.Diagnostic;
      if (!hidden) {
        hidden = document.createElement('input');
        hidden.type = 'hidden';
        hidden.name = 'Diagnostic';
        form.prepend(hidden);
      }
      hidden.value = `${summary.score}/100` + (summary.weak.length ? ` — à améliorer : ${summary.weak.join(', ')}` : '');
      if (!$('input[name="Projet"]:checked', form)) {
        const value = summary.score < 50 ? 'Restructuration' : 'Gestion & modération';
        const chip = $$('input[name="Projet"]', form).find(r => r.value === value);
        if (chip) chip.checked = true;
      }
      const msg = form.elements.Message;
      if (msg && !msg.value.trim()) msg.value = T.diagMessage(summary.score, summary.weak);
    });
  }

  /* ---------- Statut Discord (heure de Paris) ---------- */
  const statusEls = $$('.js-status');
  if (statusEls.length) {
    const LABELS = {
      fr: { online: 'En ligne', idle: 'Inactif', offline: 'Hors ligne' },
      en: { online: 'Online', idle: 'Idle', offline: 'Offline' },
    }[LANG];
    const parisHour = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: 'numeric', hourCycle: 'h23' });
    const update = () => {
      const h = +parisHour.formatToParts(new Date()).find(part => part.type === 'hour').value;
      // En ligne de 8 h à 19 h, inactif de 19 h à 1 h, hors ligne de 1 h à 8 h
      const state = h >= 8 && h < 19 ? 'online' : h >= 19 || h < 1 ? 'idle' : 'offline';
      statusEls.forEach(el => {
        el.hidden = false;
        el.dataset.state = state;
        el.title = LABELS[state];
      });
    };
    update();
    setInterval(update, 60 * 1000);
  }

  /* ---------- Annonce de recrutement ---------- */
  const reacts = $$('.js-react');
  if (reacts.length) {
    whenVisible(reacts[0].closest('.recruit'), () => {
      reacts.forEach((el, i) => setTimeout(() => animateNumber(el, +el.dataset.to), reduced ? 0 : 600 + i * 250));
    });
  }

  /* ---------- Bouton flottant (mobile) ---------- */
  const fab = $('.js-fab');
  const fabHero = $('.hero');
  const fabContact = $('#contact');
  if (fab && fabHero && fabContact && 'IntersectionObserver' in window) {
    const seen = new Map();
    const update = () => {
      const show = !seen.get(fabHero) && !seen.get(fabContact);
      fab.classList.toggle('is-visible', show);
      fab.toggleAttribute('inert', !show);
    };
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => seen.set(e.target, e.isIntersecting));
      update();
    });
    io.observe(fabHero);
    io.observe(fabContact);
  }

  /* ---------- FAQ ---------- */
  const faqItems = $$('.faq__item');
  faqItems.forEach(item => {
    const btn = $('.faq__q', item);
    btn.addEventListener('click', () => {
      const open = !item.classList.contains('is-open');
      // Une seule réponse ouverte à la fois
      faqItems.forEach(other => {
        other.classList.toggle('is-open', other === item && open);
        $('.faq__q', other).setAttribute('aria-expanded', String(other === item && open));
      });
    });
  });

  // Questions supplémentaires affichées sur demande
  const faqMore = $('.js-faq-more');
  faqMore?.addEventListener('click', () => {
    const extra = $$('.faq__item--more');
    extra.forEach((el, i) => { el.style.setProperty('--d', i * 70); el.classList.add('is-shown'); });
    faqMore.remove();
    $('.faq__q', extra[0])?.focus({ preventScroll: true });
  });

  /* ---------- Bandeau défilant ---------- */
  // Animé par le navigateur (Web Animations) : il reste fluide même quand la page est occupée.
  // Le défilement de la page ne fait que changer sa vitesse et son sens (boucle plus bas).
  const marquee = $('.js-marquee');
  const marqueeWrap = marquee?.closest('.marquee-wrap');
  let mqAnim = null;
  let mqRate = 1;
  let mqDir = 1;
  let buildMarquee = () => {};
  if (marquee && !reduced && marquee.animate) {
    const n = marquee.children.length;
    marquee.innerHTML += marquee.innerHTML;
    buildMarquee = () => {
      const period = marquee.children[n].offsetLeft - marquee.children[0].offsetLeft;
      if (!period) return;
      const duration = period / 33 * 1000; // 33 px par seconde au repos
      const progress = mqAnim ? (mqAnim.currentTime % mqAnim.effect.getTiming().duration) / mqAnim.effect.getTiming().duration : 0;
      mqAnim?.cancel();
      mqAnim = marquee.animate([{ transform: 'translate3d(0, 0, 0)' }, { transform: `translate3d(${-period}px, 0, 0)` }], { duration, iterations: Infinity });
      // Très loin dans la boucle : le bandeau peut repartir en arrière (défilement vers le haut) sans jamais s'arrêter
      mqAnim.currentTime = duration * (1000 + progress);
      mqAnim.playbackRate = mqRate;
      if (marqueeWrap?.classList.contains('is-off')) mqAnim.pause();
    };
    buildMarquee();
  }

  /* ---------- Navigation ---------- */
  const nav = $('#nav');
  const navLinks = $$('.nav__links a');
  const indicator = $('.nav__indicator');
  const navSections = navLinks.map(a => { const h = a.getAttribute('href'); return h.startsWith('#') ? $(h) : null; });
  let activeLink = null;
  function setActive(link) {
    if (link === activeLink) return;
    activeLink = link;
    navLinks.forEach(a => a.classList.toggle('is-active', a === link));
    if (!indicator) return;
    if (!link) { indicator.style.opacity = 0; return; }
    indicator.style.opacity = 1;
    indicator.style.width = link.offsetWidth - 28 + 'px';
    indicator.style.transform = `translateX(${link.offsetLeft + 14}px)`;
  }

  const burger = $('.burger');
  const menu = $('#menu');
  const toggleMenu = open => {
    root.classList.toggle('menu-open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? T.menuClose : T.menuOpen);
    menu.setAttribute('aria-hidden', String(!open));
    if (open) nav.classList.remove('is-hidden');
  };
  // Les pages sans menu (page « Liens ») n'ont ni burger ni navigation
  if (burger && menu) {
    burger.addEventListener('click', () => toggleMenu(!root.classList.contains('menu-open')));
    $$('a', menu).forEach(a => a.addEventListener('click', () => toggleMenu(false)));
    addEventListener('keydown', e => { if (e.key === 'Escape') toggleMenu(false); });
  }

  /* ---------- Effets au pointeur ---------- */
  // Les mouvements de la souris sont seulement notés ici : la boucle d'animation (plus bas) applique
  // les changements une fois par image, et se met au repos dès que tout est immobile.
  const hero = $('.hero');
  const mock = $('.mock');
  const chips = $$('.chip');
  const spot = $('.hero__spot');
  const ptr = { x: -200, y: -200, hx: 0, hy: 0, cx: 0, cy: 0, heroX: null, heroY: null };
  let spotlightNext = null;

  if (finePointer && !reduced) {
    addEventListener('pointermove', e => {
      ptr.x = e.clientX;
      ptr.y = e.clientY;
      if (pv.target || pv.s > .001) wake();
    }, { passive: true });

    hero?.addEventListener('pointermove', e => {
      if (lite()) return;
      ptr.heroX = e.clientX;
      ptr.heroY = e.clientY;
      wake();
    }, { passive: true });
    hero?.addEventListener('pointerleave', () => { ptr.hx = 0; ptr.hy = 0; wake(); });

    $$('.spotlight').forEach(el => el.addEventListener('pointermove', e => {
      if (lite()) return;
      spotlightNext = { el, x: e.clientX, y: e.clientY };
      wake();
    }, { passive: true }));

    $$('.magnetic').forEach(el => {
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        const x = e.clientX - r.left - r.width / 2;
        const y = e.clientY - r.top - r.height / 2;
        el.style.transform = `translate(${x * .22}px, ${y * .32}px)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }

  // Passage en mode allégé en cours de visite : on remet les effets au pointeur au repos
  function enableLite() {
    root.classList.add('lite');
    mock?.style.removeProperty('transform');
    chips.forEach(c => { c.style.transform = ''; });
    pv.target = 0;
    pv.s = 0;
  }

  /* ---------- Maquette Discord animée ---------- */
  const chat = $('.js-chat');
  const members = $('.js-members');
  const membersRaw = $('.js-members-raw');
  const now = new Date();
  const hhmm = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  // Conversation du salon #discussion du Café Français
  const NEWCOMERS = [['Lina', 330], ['Yanis', 200], ['Chloé', 290], ['Rayan', 140]];
  const SEED = [
    { name: 'Inès', h: 280, text: 'Bonne soirée à tous ☕' },
    { name: 'Tom', h: 200, text: 'Qui est chaud pour un vocal ce soir ? 🎧', react: '🎧 4' },
  ];
  const SCRIPT = [
    n => ({ name: n[0], h: n[1], join: true, text: "Coucou, je viens d'arriver sur le serveur ! 🥐", react: '👋 9' }),
    n => ({ name: 'Hugo', h: 160, text: `Bienvenue <b>@${n[0]}</b> ! Installe-toi, le café est servi ☕` }),
    () => ({ me: true, name: 'Mvrius', tag: 'GÉRANT', text: 'Nouveau concours ce soir à 21h, tous les détails dans <b>#🍬 | concours</b> !' }),
    () => ({ name: 'Sarah', h: 20, text: 'Trop bien, je participe 🔥', react: '🔥 7' }),
    n => ({ name: n[0], h: n[1], text: "L'ambiance ici est vraiment top 🎃", react: '❤️ 12' }),
  ];

  function messageEl(m) {
    const el = document.createElement('div');
    el.className = 'msg';
    const av = m.me
      ? '<span class="msg__av msg__av--me">M</span>'
      : `<span class="msg__av" style="--h:${m.h}">${m.name[0]}</span>`;
    const tag = m.tag ? `<span class="msg__tag msg__tag--mod">${m.tag}</span>` : '';
    const react = m.react ? `<span class="msg__react">${m.react}</span>` : '';
    el.innerHTML = `${av}<div><p class="msg__name">${m.name}${tag}<time>${T.today} ${hhmm}</time></p><p class="msg__text">${m.text}</p>${react}</div>`;
    return el;
  }
  function trimChat() {
    while (chat.children.length > 6) chat.firstElementChild.remove();
  }

  let memberCount = 9208;
  const showMembers = () => {
    if (!members) return;
    members.textContent = fmt(memberCount);
    membersRaw.textContent = memberCount;
  };
  document.addEventListener('mv:counts', e => {
    if (e.detail.code !== 'france') return;
    memberCount = e.detail.members;
    showMembers();
  });

  if (chat) {
    // La conversation a déjà commencé quand on arrive
    SEED.forEach(m => chat.append(messageEl(m)));
    if (reduced) {
      SCRIPT.slice(0, 3).forEach(f => chat.append(messageEl(f(NEWCOMERS[0]))));
    } else {
      let idx = 0;
      let heroVisible = true;
      new IntersectionObserver(([e]) => { heroVisible = e.isIntersecting; }).observe(hero);
      const next = async () => {
        if (!heroVisible || document.hidden) { setTimeout(next, 800); return; }
        // Un nouvel arrivant différent à chaque tour de la conversation
        const newcomer = NEWCOMERS[Math.floor(idx / SCRIPT.length) % NEWCOMERS.length];
        const m = SCRIPT[idx % SCRIPT.length](newcomer);
        idx++;
        const typing = document.createElement('div');
        typing.className = 'typing';
        typing.innerHTML = `<i><span></span><span></span><span></span></i>${m.name} ${T.typing}`;
        chat.append(typing);
        trimChat();
        await wait(1300);
        typing.remove();
        chat.append(messageEl(m));
        trimChat();
        // Chaque nouvel arrivant fait grimper le compteur de membres
        if (m.join) {
          memberCount++;
          showMembers();
        }
        setTimeout(next, 2200);
      };
      setTimeout(next, loader ? 2400 : 1000);
    }
  }

  /* ---------- Boucle d'animation ---------- */
  // Une seule boucle pour tout ce qui suit le défilement ou la souris. Elle ne tourne que lorsqu'il y a
  // quelque chose à animer, puis se met au repos : rien ne tourne quand la page est immobile.
  const progressBar = $('.progress span');
  const prose = $('.js-prose');
  // La position de défilement et la hauteur d'écran sont mises en cache : la boucle ne force
  // aucun calcul de mise en page tant que rien ne bouge.
  let scrollTop = scrollY;
  let vh = innerHeight;
  let raf = 0;
  function wake() { if (!raf) raf = requestAnimationFrame(frame); }
  addEventListener('scroll', () => { scrollTop = scrollY; wake(); }, { passive: true });

  // Ce qui est hors de l'écran est mis en pause (classe « is-off » : aurore, orbites, bandeau…)
  const onScreen = new Set([hero]);
  if ('IntersectionObserver' in window) {
    const vis = new IntersectionObserver(entries => entries.forEach(e => {
      onScreen[e.isIntersecting ? 'add' : 'delete'](e.target);
      e.target.classList.toggle('is-off', !e.isIntersecting);
      if (e.target === marqueeWrap && mqAnim) e.isIntersecting ? mqAnim.play() : mqAnim.pause();
    }));
    [hero, marqueeWrap, ...$$('main > section, main > header, .hero__bg, .recruit')].forEach(el => el && vis.observe(el));
  }
  let lastY = -1;
  let navY = scrollY;
  let vel = 0;
  let prevY = scrollY;
  let dirty = true;

  function onScroll(y, vh) {
    // Lectures
    // Sur un article, la barre suit la lecture du texte ; ailleurs, toute la page
    let progress;
    if (prose) {
      const r = prose.getBoundingClientRect();
      progress = clamp((vh * .7 - r.top) / r.height, 0, 1);
    } else {
      const docH = document.documentElement.scrollHeight - vh;
      progress = docH > 0 ? y / docH : 0;
    }
    const probe = vh * .4;
    let current = null;
    navSections.forEach((sec, i) => {
      if (!sec) return;
      const r = sec.getBoundingClientRect();
      if (r.top <= probe && r.bottom > probe) current = navLinks[i];
    });

    // Écritures
    if (progressBar) progressBar.style.transform = `scaleX(${progress})`;
    if (nav) {
      nav.classList.toggle('is-scrolled', y > 30);
      if (Math.abs(y - navY) > 8) {
        nav.classList.toggle('is-hidden', y > navY && y > 500 && !root.classList.contains('menu-open'));
        navY = y;
      }
    }
    setActive(current);
  }

  function frame(t) {
    raf = 0;
    noteFrame(t);
    let more = false;
    const y = scrollTop;

    // Lectures d'abord (positions), écritures ensuite : pas de calcul de mise en page forcé
    let heroRect = null;
    let spotlightRect = null;
    if (ptr.heroX !== null && hero) heroRect = hero.getBoundingClientRect();
    if (spotlightNext) spotlightRect = spotlightNext.el.getBoundingClientRect();

    if (y !== lastY || dirty) {
      onScroll(y, vh);
      lastY = y;
      dirty = false;
    }

    // Vitesse de défilement lissée : elle accélère le bandeau et inverse son sens
    vel = lerp(vel, y - prevY, .12);
    prevY = y;
    if (Math.abs(vel) > .02) more = true;
    else vel = 0;
    if (mqAnim) {
      if (Math.abs(vel) > .5) mqDir = vel > 0 ? 1 : -1;
      const rate = mqDir * (1 + Math.min(Math.abs(vel) * .35, 14) / .55);
      if (Math.abs(rate - mqRate) > .02) {
        mqRate = rate;
        if (mqAnim.updatePlaybackRate) mqAnim.updatePlaybackRate(rate);
        else mqAnim.playbackRate = rate;
      }
    }

    if (spotlightRect) {
      spotlightNext.el.style.setProperty('--mx', spotlightNext.x - spotlightRect.left + 'px');
      spotlightNext.el.style.setProperty('--my', spotlightNext.y - spotlightRect.top + 'px');
      spotlightNext = null;
    }

    if (heroRect) {
      ptr.hx = (ptr.heroX - heroRect.left) / heroRect.width - .5;
      ptr.hy = (ptr.heroY - heroRect.top) / heroRect.height - .5;
      // La lueur suit la souris : un petit calque déplacé, rien n'est repeint
      spot?.style.setProperty('transform', `translate3d(${ptr.heroX - heroRect.left - heroRect.width * .5}px, ${ptr.heroY - heroRect.top - heroRect.height * .4}px, 0)`);
      ptr.heroX = ptr.heroY = null;
    }

    if (!lite()) {
      if (preview && (pv.s > .001 || pv.target)) {
        const px = pv.x;
        pv.x = lerp(pv.x, ptr.x, .14);
        pv.y = lerp(pv.y, ptr.y, .14);
        pv.s = lerp(pv.s, pv.target, .14);
        const tilt = clamp((pv.x - px) * .9, -12, 12);
        const x = Math.min(pv.x + 32, innerWidth - 360);
        preview.style.opacity = pv.s;
        preview.style.transform = `translate3d(${x}px, ${pv.y - 110}px, 0) rotate(${tilt}deg) scale(${.6 + pv.s * .4})`;
        if (pv.target || pv.s > .001 || Math.abs(pv.x - ptr.x) > .5) more = true;
      }

      // Maquette Discord inclinée selon la souris (transformation directe : rien d'autre n'est recalculé)
      if (mock && finePointer && !reduced && wide.matches && onScreen.has(hero)) {
        const dx = ptr.hx - ptr.cx;
        const dy = ptr.hy - ptr.cy;
        if (Math.abs(dx) > .0005 || Math.abs(dy) > .0005) {
          ptr.cx += dx * .07;
          ptr.cy += dy * .07;
          mock.style.transform = `translate3d(${(ptr.cx * 18).toFixed(2)}px, ${(ptr.cy * 18).toFixed(2)}px, 0) rotateX(${(6 - ptr.cy * 12).toFixed(3)}deg) rotateY(${(-10 + ptr.cx * 16).toFixed(3)}deg)`;
          chips.forEach(c => {
            const d = +c.dataset.depth || 1;
            c.style.transform = `translate3d(${(ptr.cx * d * 46).toFixed(2)}px, ${(ptr.cy * d * 46).toFixed(2)}px, 0)`;
          });
          more = true;
        }
      }
    }

    if (more) wake();
  }

  /* ---------- Initialisation & redimensionnement ---------- */
  const relayout = () => { vh = innerHeight; scrollTop = scrollY; buildMarquee(); activeLink = undefined; dirty = true; wake(); };
  let rT;
  addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(relayout, 150); });
  addEventListener('load', relayout);
  document.fonts?.ready.then(relayout);
  wide.addEventListener?.('change', () => {
    if (!wide.matches && mock) { mock.style.removeProperty('transform'); chips.forEach(c => { c.style.transform = ''; }); }
  });

  $$('.js-year').forEach(el => { el.textContent = new Date().getFullYear(); });
  wake();
})();
