/* ==========================================================================
   Mvrius — page « Réserver un appel » (rendez-vous/)
   Les créneaux libres viennent du serveur de l'agenda (tools/agenda-worker.js) :
   il ne renvoie que des heures libres, jamais le contenu de l'agenda. Une demande
   arrive « En attente » dans l'agenda, et Mvrius la confirme par e-mail ou Discord.
   ========================================================================== */
(() => {
  'use strict';

  const racine = document.querySelector('.js-resa');
  if (!racine) return;
  const SERVEUR = String(window.AGENDA_SERVEUR || '').replace(/\/+$/, '');
  const $ = (s, c = racine) => c.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // Les dates « AAAA-MM-JJ » sont affichées telles quelles (heure de Paris), sans conversion de fuseau
  const fmt = (d, o) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', ...o }).format(new Date(`${d}T12:00:00Z`));
  const maj1 = s => s.charAt(0).toUpperCase() + s.slice(1);
  const etat = { jours: [], duree: 30, jour: null, heure: null, ouvert: performance.now() };
  const blocs = ['chargement', 'choix', 'form', 'ok', 'ferme'];

  function montrer(nom) {
    blocs.forEach(b => { $(`.js-resa-${b}`).hidden = b !== nom; });
  }
  function fermer(message) {
    $('.js-resa-ferme-texte').textContent = message;
    montrer('ferme');
  }
  const recap = () => `${maj1(fmt(etat.jour, { weekday: 'long', day: 'numeric', month: 'long' }))} à ${etat.heure.replace(':', ' h ')} · ${etat.duree} min`;

  async function charger() {
    if (!SERVEUR) { fermer('La prise de rendez-vous en ligne arrive bientôt.'); return; }
    montrer('chargement');
    try {
      const rep = await fetch(`${SERVEUR}/reservation/creneaux`, { cache: 'no-store' });
      const corps = await rep.json();
      if (!rep.ok || !corps.actif) { fermer('Les réservations sont fermées pour le moment.'); return; }
      etat.jours = corps.jours || [];
      etat.duree = corps.duree || 30;
      document.querySelectorAll('.js-resa-duree').forEach(el => { el.textContent = etat.duree; });
      if (!etat.jours.length) { fermer('Tous les créneaux des prochains jours sont déjà pris.'); return; }
      if (!etat.jours.some(j => j.date === etat.jour)) etat.jour = etat.jours[0].date;
      afficherJours();
      montrer('choix');
    } catch (e) {
      fermer("Les créneaux n'ont pas pu être chargés. Réessayez dans un instant.");
    }
  }

  function afficherJours() {
    $('.js-resa-jours').innerHTML = etat.jours.map(j => `<button type="button" class="resa__jour" data-jour="${j.date}" aria-pressed="${j.date === etat.jour}">`
      + `<span>${esc(fmt(j.date, { weekday: 'short' }))}</span><b>${esc(fmt(j.date, { day: 'numeric' }))}</b><small>${esc(fmt(j.date, { month: 'short' }))}</small>`
      + `<i>${j.creneaux.length} créneau${j.creneaux.length > 1 ? 'x' : ''}</i></button>`).join('');
    afficherHeures();
  }
  function afficherHeures() {
    const jour = etat.jours.find(j => j.date === etat.jour);
    $('.js-resa-jour-texte').textContent = maj1(fmt(etat.jour, { weekday: 'long', day: 'numeric', month: 'long' }));
    $('.js-resa-heures').innerHTML = (jour ? jour.creneaux : []).map(h => `<button type="button" class="resa__heure" data-heure="${h}">${h.replace(':', ' h ')}</button>`).join('');
  }

  racine.addEventListener('click', e => {
    const j = e.target.closest('[data-jour]');
    if (j) {
      etat.jour = j.dataset.jour;
      racine.querySelectorAll('[data-jour]').forEach(b => b.setAttribute('aria-pressed', String(b === j)));
      afficherHeures();
      return;
    }
    const h = e.target.closest('[data-heure]');
    if (h) {
      etat.heure = h.dataset.heure;
      $('.js-resa-recap').textContent = recap();
      $('.js-resa-erreur').textContent = '';
      montrer('form');
      $('.js-resa-form input[name="nom"]').focus();
      return;
    }
    if (e.target.closest('.js-resa-changer')) { montrer('choix'); return; }
    if (e.target.closest('.js-resa-recharger')) charger();
  });

  const form = $('.js-resa-form');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const c = Object.fromEntries(new FormData(form));
    const erreur = $('.js-resa-erreur');
    form.classList.add('was-validated');
    if (!c.nom.trim()) { erreur.textContent = 'Indiquez votre nom ou votre pseudo.'; form.nom.focus(); return; }
    if (!c.email.trim() && !c.discord.trim()) { erreur.textContent = 'Indiquez une adresse e-mail ou un pseudo Discord pour que je puisse vous répondre.'; form.email.focus(); return; }
    if (c.email.trim() && !form.email.checkValidity()) { erreur.textContent = "Cette adresse e-mail n'a pas l'air valide."; form.email.focus(); return; }
    erreur.textContent = '';
    const bouton = $('button[type="submit"]', form);
    bouton.disabled = true;
    form.classList.add('is-sending');
    try {
      const rep = await fetch(`${SERVEUR}/reservation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Temps passé sur la page (contre les robots), mesuré ici : l'horloge du serveur peut différer
        body: JSON.stringify({ ...c, date: etat.jour, heure: etat.heure, rempli: Math.round(performance.now() - etat.ouvert) }),
      });
      const corps = await rep.json().catch(() => ({}));
      if (rep.ok) {
        $('.js-resa-ok-recap').textContent = recap();
        $('.js-resa-ok-contact').textContent = c.email.trim() ? `par e-mail (${c.email.trim()})` : `sur Discord (${c.discord.trim()})`;
        form.reset();
        form.classList.remove('was-validated');
        montrer('ok');
      } else if (rep.status === 409 && /pris|disponible/.test(corps.message || '')) {
        await charger();
        $('.js-resa-info').textContent = corps.message;
      } else {
        erreur.textContent = corps.message || "La demande n'a pas pu être envoyée. Réessayez.";
      }
    } catch (err) {
      erreur.textContent = 'Connexion impossible. Vérifiez votre réseau et réessayez.';
    } finally {
      bouton.disabled = false;
      form.classList.remove('is-sending');
    }
  });

  charger();
})();
