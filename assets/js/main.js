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

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const easeInOut = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
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
  const loader = $('.loader');
  const startIntro = () => root.classList.add('is-ready');

  if (loader && getComputedStyle(loader).display !== 'none') {
    const count = $('.loader__count');
    const bar = $('.loader__bar span');
    const t0 = performance.now();
    const DURATION = 1300;
    const tick = now => {
      const p = clamp((now - t0) / DURATION, 0, 1);
      const e = easeInOut(p);
      count.textContent = String(Math.round(e * 100)).padStart(2, '0');
      bar.style.transform = `scaleX(${e})`;
      if (p < 1) return requestAnimationFrame(tick);
      Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), wait(1200)]).then(() => {
        loader.classList.add('is-done');
        setTimeout(startIntro, 250);
        setTimeout(() => loader.remove(), 1200);
        try { sessionStorage.setItem('mv-intro', '1'); } catch (e) { /* stockage indisponible */ }
      });
    };
    requestAnimationFrame(tick);
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
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
    revealTargets.forEach(el => io.observe(el));
  }
  // Une fois apparu, on retire le délai pour que les survols restent vifs
  document.addEventListener('transitionend', e => {
    if (e.propertyName === 'transform' && e.target.matches?.('[data-reveal].is-in')) e.target.classList.add('revealed');
  });

  const pad2 = n => String(n).padStart(2, '0');
  const fmt = n => n.toLocaleString('fr-FR');

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
    }, { threshold: 0.4 });
    io.observe(el);
  }
  // Les chiffres viennent de l'invitation publique de chaque serveur (mis en cache 10 min)
  async function fetchInvite(code) {
    const key = `mv-invite-${code}`;
    try {
      const cached = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (cached && Date.now() - cached.t < 10 * 60 * 1000) return cached;
    } catch (e) { /* stockage indisponible */ }
    const res = await fetch(`https://discord.com/api/v10/invites/${code}?with_counts=true`);
    if (!res.ok) throw new Error(res.status);
    const d = await res.json();
    const data = { t: Date.now(), members: d.approximate_member_count, online: d.approximate_presence_count };
    try { sessionStorage.setItem(key, JSON.stringify(data)); } catch (e) { /* stockage indisponible */ }
    return data;
  }
  $$('[data-invite]').forEach(row => {
    const code = row.dataset.invite;
    fetchInvite(code).then(({ members: total, online }) => {
      if (!total) return;
      const count = $('.prow__count', row);
      const live = $('.prow__live', row);
      whenVisible(row, () => {
        count.hidden = false;
        live.hidden = !online;
        animateNumber($('[data-members]', row), total);
        if (online) animateNumber($('[data-online]', row), online);
      });
      document.dispatchEvent(new CustomEvent('mv:counts', { detail: { code, members: total, online } }));
    }).catch(() => { /* Discord injoignable : on garde les valeurs affichées */ });
  });

  /* ---------- Projets : aperçu qui suit la souris ---------- */
  const preview = $('.js-ppreview');
  const pv = { x: 0, y: 0, s: 0, target: 0 };
  if (preview && finePointer && !reduced) {
    const strip = $('.ppreview__strip', preview);
    $$('.prow').forEach(row => {
      row.addEventListener('pointerenter', e => {
        if (pv.s < .05) { pv.x = e.clientX; pv.y = e.clientY; }
        pv.target = 1;
        strip.style.transform = `translateY(${-row.dataset.preview * 100}%)`;
      });
      row.addEventListener('pointerleave', () => { pv.target = 0; });
    });
  }

  /* ---------- Demande de devis ---------- */
  const quote = $('.js-quote');
  if (quote) {
    const status = $('.quote__status', quote);
    const label = $('.quote__label', quote);
    const mailto = data => 'mailto:contact@mvriuus.fr?subject=' + encodeURIComponent('Demande de devis')
      + '&body=' + encodeURIComponent(Object.entries(data).filter(([k]) => !k.startsWith('_')).map(([k, v]) => `${k} : ${v}`).join('\n'));
    quote.addEventListener('submit', async e => {
      e.preventDefault();
      status.textContent = '';
      if (!quote.checkValidity()) {
        quote.classList.add('was-validated');
        status.textContent = 'Merci de compléter les champs en rouge.';
        $(':invalid:not(fieldset)', quote)?.focus();
        return;
      }
      if (quote.elements._honey.value) return;
      const data = Object.fromEntries(new FormData(quote));
      quote.classList.add('is-sending');
      label.textContent = 'Envoi en cours…';
      try {
        const res = await fetch('https://formsubmit.co/ajax/contact@mvriuus.fr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(data),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || String(json.success) !== 'true') throw new Error(json.message || res.status);
        quote.classList.add('is-done');
        $('.quote__done', quote).hidden = false;
        quote.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
      } catch (err) {
        status.innerHTML = `L'envoi n'a pas fonctionné. Écrivez-moi directement à <a href="${mailto(data)}">contact@mvriuus.fr</a>.`;
      } finally {
        quote.classList.remove('is-sending');
        label.textContent = 'Envoyer ma demande';
      }
    });
  }

  /* ---------- Copier l'adresse e-mail ---------- */
  $$('.js-copy').forEach(btn => {
    const status = $('.copy__status', btn);
    let t;
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
        status.textContent = 'Adresse copiée !';
      } catch (e) {
        window.location.href = 'mailto:' + btn.dataset.copy;
        return;
      }
      btn.classList.add('is-copied');
      clearTimeout(t);
      t = setTimeout(() => { btn.classList.remove('is-copied'); status.textContent = ''; }, 2200);
    });
  });

  /* ---------- Carrousel d'avis ---------- */
  const carousel = $('.js-testimonials');
  if (carousel) {
    const slides = $$('.testimonial', carousel);
    const dots = $$('.t-dot', carousel);
    let current = 0;
    slides.forEach(sl => splitWords($('.testimonial__text', sl)));

    const show = (n, dir = 1) => {
      n = (n + slides.length) % slides.length;
      if (n === current) return;
      slides[current].style.setProperty('--from', `${-48 * dir}px`);
      slides[current].classList.remove('is-active');
      slides[n].style.setProperty('--from', `${48 * dir}px`);
      // force le point de départ avant d'activer la nouvelle diapositive
      void slides[n].offsetWidth;
      slides[n].classList.add('is-active');
      dots.forEach((d, i) => {
        d.classList.toggle('is-active', i === n);
        d.setAttribute('aria-selected', String(i === n));
      });
      current = n;
    };
    const next = () => show(current + 1, 1);
    const prev = () => show(current - 1, -1);

    $('.js-t-next').addEventListener('click', next);
    $('.js-t-prev').addEventListener('click', prev);
    dots.forEach((d, i) => d.addEventListener('click', () => show(i, i > current ? 1 : -1)));
    // Défilement automatique : la barre de progression du point actif donne le tempo
    if (!reduced) dots.forEach(d => $('span', d).addEventListener('animationend', next));
    // Le défilement ne tourne que lorsque les avis sont à l'écran
    carousel.classList.add('is-offscreen');
    new IntersectionObserver(([e]) => carousel.classList.toggle('is-offscreen', !e.isIntersecting), { threshold: 0.4 }).observe(carousel);
    carousel.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') carousel.classList.add('is-paused'); });
    carousel.addEventListener('pointerleave', () => carousel.classList.remove('is-paused'));
    carousel.addEventListener('focusin', () => carousel.classList.add('is-paused'));
    carousel.addEventListener('focusout', () => carousel.classList.remove('is-paused'));

    // Balayage sur mobile
    let x0 = null;
    const stage = $('.testimonials__stage', carousel);
    stage.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    stage.addEventListener('touchend', e => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 50) (dx < 0 ? next : prev)();
      x0 = null;
    });
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

  /* ---------- Bandeau défilant ---------- */
  const marquee = $('.js-marquee');
  let mq = { x: 0, period: 0, dir: -1 };
  if (marquee && !reduced) {
    const n = marquee.children.length;
    marquee.innerHTML += marquee.innerHTML;
    const measure = () => { mq.period = marquee.children[n].offsetLeft - marquee.children[0].offsetLeft; };
    measure();
    mq.measure = measure;
  }

  /* ---------- Navigation ---------- */
  const nav = $('#nav');
  const navLinks = $$('.nav__links a');
  const indicator = $('.nav__indicator');
  const navSections = navLinks.map(a => $(a.getAttribute('href')));
  let activeLink = null;
  function setActive(link) {
    if (link === activeLink) return;
    activeLink = link;
    navLinks.forEach(a => a.classList.toggle('is-active', a === link));
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
    burger.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
    menu.setAttribute('aria-hidden', String(!open));
    if (open) nav.classList.remove('is-hidden');
  };
  burger.addEventListener('click', () => toggleMenu(!root.classList.contains('menu-open')));
  $$('a', menu).forEach(a => a.addEventListener('click', () => toggleMenu(false)));
  addEventListener('keydown', e => { if (e.key === 'Escape') toggleMenu(false); });

  /* ---------- Effets au pointeur ---------- */
  const hero = $('.hero');
  const mock = $('.mock');
  const chips = $$('.chip');
  const cursor = $('.cursor');
  const cursorLabel = $('.cursor__label');
  const ptr = { x: -200, y: -200, rx: -200, ry: -200, hx: 0, hy: 0, cx: 0, cy: 0 };

  if (finePointer && !reduced) {
    root.classList.add('has-cursor');
    addEventListener('pointermove', e => { ptr.x = e.clientX; ptr.y = e.clientY; }, { passive: true });
    document.addEventListener('pointerover', e => {
      const t = e.target.closest('a, button, [data-cursor]');
      const labelled = t && t.closest('[data-cursor]');
      cursor.classList.toggle('is-hover', !!t && !labelled);
      cursor.classList.toggle('is-label', !!labelled);
      cursorLabel.textContent = labelled ? labelled.dataset.cursor : '';
    });
    document.documentElement.addEventListener('pointerleave', () => cursor.classList.add('is-hidden'));
    document.documentElement.addEventListener('pointerenter', () => cursor.classList.remove('is-hidden'));

    hero.addEventListener('pointermove', e => {
      const r = hero.getBoundingClientRect();
      ptr.hx = (e.clientX - r.left) / r.width - .5;
      ptr.hy = (e.clientY - r.top) / r.height - .5;
      hero.style.setProperty('--sx', e.clientX - r.left + 'px');
      hero.style.setProperty('--sy', e.clientY - r.top + 'px');
    });
    hero.addEventListener('pointerleave', () => { ptr.hx = 0; ptr.hy = 0; });

    $$('.spotlight').forEach(el => el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', e.clientX - r.left + 'px');
      el.style.setProperty('--my', e.clientY - r.top + 'px');
    }));

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
    el.innerHTML = `${av}<div><p class="msg__name">${m.name}${tag}<time>Aujourd'hui à ${hhmm}</time></p><p class="msg__text">${m.text}</p>${react}</div>`;
    return el;
  }
  function trimChat() {
    while (chat.children.length > 6) chat.firstElementChild.remove();
  }

  let memberCount = 9208;
  const showMembers = () => {
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
        typing.innerHTML = `<i><span></span><span></span><span></span></i>${m.name} est en train d'écrire…`;
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
  const progressBar = $('.progress span');
  let lastY = -1;
  let navY = scrollY;
  let vel = 0;
  let prevY = scrollY;
  let lastT = performance.now();
  let dirty = true;

  function onScroll(y, vh) {
    // Lectures
    const docH = document.documentElement.scrollHeight - vh;
    const probe = vh * .4;
    let current = null;
    navSections.forEach((sec, i) => {
      if (!sec) return;
      const r = sec.getBoundingClientRect();
      if (r.top <= probe && r.bottom > probe) current = navLinks[i];
    });

    // Écritures
    progressBar.style.transform = `scaleX(${docH > 0 ? y / docH : 0})`;
    nav.classList.toggle('is-scrolled', y > 30);
    if (Math.abs(y - navY) > 8) {
      nav.classList.toggle('is-hidden', y > navY && y > 500 && !root.classList.contains('menu-open'));
      navY = y;
    }
    setActive(current);
  }

  function frame(t) {
    const dt = Math.min(64, t - lastT);
    lastT = t;
    const y = scrollY;
    const vh = innerHeight;

    if (y !== lastY || dirty) {
      onScroll(y, vh);
      lastY = y;
      dirty = false;
    }

    vel = lerp(vel, y - prevY, .12);
    prevY = y;

    if (mq.period) {
      if (Math.abs(vel) > .5) mq.dir = vel > 0 ? -1 : 1;
      const speed = (.55 + Math.min(Math.abs(vel) * .35, 14)) * (dt / 16.67);
      mq.x += mq.dir * speed;
      if (mq.x <= -mq.period) mq.x += mq.period;
      if (mq.x > 0) mq.x -= mq.period;
      marquee.style.transform = `translate3d(${mq.x}px, 0, 0)`;
    }

    if (finePointer && !reduced) {
      ptr.rx = lerp(ptr.rx, ptr.x, .2);
      ptr.ry = lerp(ptr.ry, ptr.y, .2);
      cursor.style.transform = `translate3d(${ptr.rx}px, ${ptr.ry}px, 0)`;

      if (preview && (pv.s > .001 || pv.target)) {
        const px = pv.x;
        pv.x = lerp(pv.x, ptr.x, .14);
        pv.y = lerp(pv.y, ptr.y, .14);
        pv.s = lerp(pv.s, pv.target, .14);
        const tilt = clamp((pv.x - px) * .9, -12, 12);
        const x = Math.min(pv.x + 32, innerWidth - 360);
        preview.style.opacity = pv.s;
        preview.style.transform = `translate3d(${x}px, ${pv.y - 110}px, 0) rotate(${tilt}deg) scale(${.6 + pv.s * .4})`;
      }

      if (wide.matches && y < vh) {
        ptr.cx = lerp(ptr.cx, ptr.hx, .07);
        ptr.cy = lerp(ptr.cy, ptr.hy, .07);
        mock.style.setProperty('--ry', `${-10 + ptr.cx * 16}deg`);
        mock.style.setProperty('--rx', `${6 - ptr.cy * 12}deg`);
        mock.style.setProperty('--tx', `${ptr.cx * 18}px`);
        mock.style.setProperty('--ty', `${ptr.cy * 18}px`);
        chips.forEach(c => {
          const d = +c.dataset.depth || 1;
          c.style.transform = `translate3d(${ptr.cx * d * 46}px, ${ptr.cy * d * 46}px, 0)`;
        });
      }
    }

    requestAnimationFrame(frame);
  }

  /* ---------- Initialisation & redimensionnement ---------- */
  const relayout = () => { mq.measure?.(); activeLink = undefined; dirty = true; };
  let rT;
  addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(relayout, 150); });
  addEventListener('load', relayout);
  document.fonts?.ready.then(relayout);
  wide.addEventListener?.('change', () => {
    if (!wide.matches) { mock.removeAttribute('style'); chips.forEach(c => { c.style.transform = ''; }); }
  });

  $('.js-year').textContent = new Date().getFullYear();
  requestAnimationFrame(frame);
})();
