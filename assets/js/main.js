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

  /* ---------- Compteurs ---------- */
  const counters = $$('[data-count]');
  if (!reduced && 'IntersectionObserver' in window) {
    counters.forEach(el => { el.textContent = '0'; });
    const cio = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        cio.unobserve(e.target);
        const el = e.target;
        const target = +el.dataset.count;
        const t0 = performance.now();
        const step = now => {
          const p = clamp((now - t0) / 1800, 0, 1);
          el.textContent = p < 1 ? Math.round(target * (1 - Math.pow(2, -10 * p))) : target;
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    }, { threshold: 0.6 });
    counters.forEach(el => cio.observe(el));
  }

  /* ---------- Paragraphe « scrub » (les mots s'allument au scroll) ---------- */
  const scrub = $('.js-scrub');
  let scrubWords = [];
  if (scrub) {
    const text = scrub.textContent.trim();
    scrub.textContent = '';
    text.split(SPACES).forEach(part => {
      if (!part.trim()) { scrub.append(part); return; }
      const s = document.createElement('span');
      s.className = 'sw';
      s.textContent = part;
      scrub.append(s);
    });
    scrubWords = $$('.sw', scrub);
    if (reduced) scrubWords.forEach(w => w.classList.add('is-lit'));
  }

  /* ---------- Méthode : ligne de progression ---------- */
  const stepsEl = $('.js-steps');
  const rail = stepsEl && $('.steps__rail', stepsEl);
  const steps = stepsEl ? $$('.step', stepsEl) : [];
  if (reduced) steps.forEach(s => s.classList.add('is-lit'));

  /* ---------- Projets : défilement horizontal épinglé ---------- */
  const projects = $('#projets');
  const track = $('.js-track');
  const viewport = $('.projects__viewport');
  const projIndex = $('.js-proj-index');
  const projCards = track ? $$('.project', track) : [];
  const pad2 = n => String(n).padStart(2, '0');
  let pin = { on: false, top: 0, dist: 0 };
  if (projCards.length) $('.js-proj-total').textContent = pad2(projCards.length);

  function setupPin() {
    if (!projects) return;
    const should = !reduced && wide.matches && innerHeight >= 700;
    projects.classList.toggle('is-pinned', should);
    track.style.transform = '';
    if (!should) { projects.style.height = ''; pin = { on: false }; return; }
    const dist = Math.max(0, track.scrollWidth - viewport.clientWidth);
    projects.style.height = innerHeight + dist + 'px';
    pin = { on: true, dist, top: projects.getBoundingClientRect().top + scrollY };
  }
  viewport?.addEventListener('scroll', () => {
    if (pin.on) return;
    const max = viewport.scrollWidth - viewport.clientWidth;
    const p = max > 0 ? viewport.scrollLeft / max : 0;
    projIndex.textContent = pad2(Math.round(p * (projCards.length - 1)) + 1);
  }, { passive: true });

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

    const photo = $('.tilt');
    if (photo) {
      const area = photo.parentElement;
      area.addEventListener('pointermove', e => {
        const r = photo.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - .5;
        const y = (e.clientY - r.top) / r.height - .5;
        photo.style.transform = `rotateY(${x * 12}deg) rotateX(${-y * 12}deg)`;
      });
      area.addEventListener('pointerleave', () => { photo.style.transform = ''; });
    }
  }

  /* ---------- Maquette Discord animée ---------- */
  const chat = $('.js-chat');
  const online = $('.js-online');
  const now = new Date();
  const hhmm = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  const BOT_ICON = '<svg viewBox="0 0 24 24"><use href="#i-bot"/></svg>';
  const SCRIPT = [
    { kind: 'bot', name: 'Assistant', tag: 'BOT', text: 'Bienvenue <b>@Lina</b> ! Pense à lire le <b>#règlement</b> 👋' },
    { kind: 'user', name: 'Lina', h: 330, text: 'Merci ! Le serveur est super bien organisé 😍', react: '❤️ 12' },
    { kind: 'me', name: 'Mvrius', tag: 'MOD', text: '📅 Soirée jeux vendredi à 21h, inscriptions dans <b>#événements</b> !' },
    { kind: 'user', name: 'Hugo', h: 160, text: 'Je suis chaud 🔥 je ramène des potes', react: '🔥 8' },
    { kind: 'bot', name: 'Assistant', tag: 'BOT', text: '🎉 <b>@Hugo</b> passe au niveau 10 !' },
    { kind: 'user', name: 'Sarah', h: 20, text: 'Les nouveaux rôles sont trop propres 👀', react: '✨ 6' },
  ];

  function messageEl(m) {
    const el = document.createElement('div');
    el.className = 'msg';
    const av = m.kind === 'bot'
      ? `<span class="msg__av msg__av--bot">${BOT_ICON}</span>`
      : m.kind === 'me'
        ? '<span class="msg__av msg__av--me">M</span>'
        : `<span class="msg__av" style="--h:${m.h}">${m.name[0]}</span>`;
    const tag = m.tag ? `<span class="msg__tag${m.tag === 'MOD' ? ' msg__tag--mod' : ''}">${m.tag}</span>` : '';
    const react = m.react ? `<span class="msg__react">${m.react}</span>` : '';
    el.innerHTML = `${av}<div><p class="msg__name">${m.name}${tag}<time>Aujourd'hui à ${hhmm}</time></p><p class="msg__text">${m.text}</p>${react}</div>`;
    return el;
  }
  function trimChat() {
    while (chat.children.length > 6) chat.firstElementChild.remove();
  }

  if (chat) {
    if (reduced) {
      SCRIPT.slice(0, 3).forEach(m => chat.append(messageEl(m)));
    } else {
      let idx = 0;
      let heroVisible = true;
      new IntersectionObserver(([e]) => { heroVisible = e.isIntersecting; }).observe(hero);
      const next = async () => {
        if (!heroVisible || document.hidden) { setTimeout(next, 800); return; }
        const m = SCRIPT[idx % SCRIPT.length];
        idx++;
        if (m.kind !== 'bot') {
          const typing = document.createElement('div');
          typing.className = 'typing';
          typing.innerHTML = `<i><span></span><span></span><span></span></i>${m.name} est en train d'écrire…`;
          chat.append(typing);
          trimChat();
          await wait(1300);
          typing.remove();
        }
        chat.append(messageEl(m));
        trimChat();
        setTimeout(next, m.kind === 'bot' ? 1600 : 2200);
      };
      setTimeout(next, loader ? 2200 : 900);

      let count = 1284;
      setInterval(() => {
        if (!heroVisible) return;
        count += Math.round(Math.random() * 9) - 3;
        online.textContent = count.toLocaleString('fr-FR');
      }, 2400);
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
    const scrubRect = scrub && !reduced ? scrub.getBoundingClientRect() : null;
    const stepsRect = stepsEl && !reduced ? stepsEl.getBoundingClientRect() : null;
    const railVisible = rail && rail.offsetParent !== null;
    const stepTops = !railVisible && !reduced ? steps.map(s => s.getBoundingClientRect().top) : null;
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

    if (scrubRect) {
      const p = clamp((vh * .82 - scrubRect.top) / (scrubRect.height + vh * .3), 0, 1);
      const lit = Math.round(p * scrubWords.length);
      scrubWords.forEach((w, i) => w.classList.toggle('is-lit', i < lit));
    }

    if (stepsRect) {
      if (railVisible) {
        const p = clamp((vh * .78 - stepsRect.top) / (vh * .45), 0, 1);
        rail.style.setProperty('--p', p);
        steps.forEach((s, i) => s.classList.toggle('is-lit', p >= i / (steps.length - 1) - .001 && p > 0));
      } else {
        steps.forEach((s, i) => s.classList.toggle('is-lit', stepTops[i] < vh * .78));
      }
    }

    if (pin.on) {
      const p = clamp((y - pin.top) / (pin.dist || 1), 0, 1);
      track.style.transform = `translate3d(${-p * pin.dist}px, 0, 0)`;
      projIndex.textContent = pad2(Math.round(p * (projCards.length - 1)) + 1);
    }
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
  const relayout = () => { setupPin(); mq.measure?.(); activeLink = undefined; dirty = true; };
  let rT;
  addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(relayout, 150); });
  addEventListener('load', relayout);
  document.fonts?.ready.then(relayout);
  wide.addEventListener?.('change', () => {
    if (!wide.matches) { mock.removeAttribute('style'); chips.forEach(c => { c.style.transform = ''; }); }
  });

  $('.js-year').textContent = new Date().getFullYear();
  setupPin();
  requestAnimationFrame(frame);
})();
