/* ==========================================================================
   Espace client — mvriuus.fr/espace/#clé
   La clé (après le #) n'est jamais envoyée dans l'adresse : elle part seulement
   vers le serveur de l'agenda, qui renvoie les rendez-vous, le projet, les devis
   et les factures de ce client, et rien d'autre. Le client peut y accepter
   (« Bon pour accord ») ou refuser un devis.
   ========================================================================== */
(() => {
  'use strict';
  const SERVEUR = String(window.AGENDA_SERVEUR || '').replace(/\/+$/, '');
  const $ = (s, c = document) => c.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const icone = nom => `<svg class="i" aria-hidden="true"><use href="#i-${nom}"/></svg>`;
  const F = window.Facture;
  const page = $('#page');
  let etat = null;
  let cle = '';

  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const aujourdhui = () => iso(new Date());
  const jour = s => { const [a, m, j] = s.split('-').map(Number); return new Date(a, m - 1, j); };
  const fmt = (s, o) => new Intl.DateTimeFormat('fr-FR', o).format(jour(s));
  const maj1 = s => s.charAt(0).toUpperCase() + s.slice(1);
  const heures = m => { const h = Math.floor(m / 60); const mm = Math.round(m % 60); return h ? `${h} h${mm ? ` ${pad(mm)}` : ''}` : `${mm} min`; };
  const quand = d => {
    const auj = aujourdhui();
    const demain = iso(new Date(jour(auj).getFullYear(), jour(auj).getMonth(), jour(auj).getDate() + 1));
    return d === auj ? "Aujourd'hui" : d === demain ? 'Demain' : maj1(fmt(d, { weekday: 'long', day: 'numeric', month: 'long' }));
  };
  const horaire = r => (r.journee ? 'Toute la journée' : `${r.debut.replace(':', ' h ').replace(' h 00', ' h')} – ${r.fin.replace(':', ' h ').replace(' h 00', ' h')}`);

  function erreur(titre, texte, reessayer) {
    page.innerHTML = `<section class="e-erreur"><span class="vide-icone">${icone('cadenas')}</span><h1>${esc(titre)}</h1><p>${esc(texte)}</p>`
      + (reessayer ? '<button type="button" class="btn btn--primaire" data-reessayer>Réessayer</button>' : '<a class="btn btn--ghost" href="../">Aller sur mvriuus.fr</a>')
      + '</section>';
  }

  async function charger() {
    cle = decodeURIComponent(location.hash.slice(1));
    if (!/^[A-Za-z0-9_-]{20,80}$/.test(cle)) { erreur('Lien incomplet', "L'adresse de votre espace client semble coupée. Ouvrez le lien complet reçu de Mvrius."); return; }
    if (!SERVEUR) { erreur('Espace indisponible', 'Le serveur n\'est pas configuré.'); return; }
    let rep;
    try {
      rep = await fetch(`${SERVEUR}/espace`, { cache: 'no-store', headers: { Authorization: `Cle ${cle}` } });
    } catch (e) {
      erreur('Pas de connexion', "Impossible de joindre le serveur. Vérifiez votre connexion internet.", true);
      return;
    }
    const corps = await rep.json().catch(() => ({}));
    if (!rep.ok) {
      if (rep.status === 404 || rep.status === 401) erreur('Lien expiré', corps.message || "Ce lien n'est plus valide.");
      else erreur('Un souci est survenu', 'Le serveur a répondu une erreur. Réessayez dans un instant.', true);
      return;
    }
    etat = { ...corps, devis: Array.isArray(corps.devis) ? corps.devis : [] };
    rendre();
  }

  // Statut d'une facture vu par le client
  function statut(f) {
    if (f.type === 'avoir') return f.paiement ? ['Remboursé', '#3ddc84', `le ${fmt(f.paiement.date, { day: 'numeric', month: 'long' })}`] : ['Avoir', '#c3a6ff', f.ref ? `annule la facture ${f.ref}` : ''];
    if (f.statut === 'annulee') return ['Annulée', '#7c705f', ''];
    if (f.paiement) return ['Payée', '#3ddc84', `le ${fmt(f.paiement.date, { day: 'numeric', month: 'long' })}`];
    if (f.echeance && f.echeance < aujourdhui()) return ['En retard', '#ff6b8b', `échéance le ${fmt(f.echeance, { day: 'numeric', month: 'long' })}`];
    return ['À régler', '#e8b46a', f.echeance ? `avant le ${fmt(f.echeance, { day: 'numeric', month: 'long' })}` : ''];
  }
  const complete = f => ({ ...f, refNumero: f.ref || null });
  const jourLong = d => (d ? fmt(d, { day: 'numeric', month: 'long', year: 'numeric' }) : '');
  // Statut d'un devis vu par le client
  const expire = x => x.statut === 'envoye' && (x.expire || (x.validite && x.validite < aujourdhui()));
  const aRepondre = x => x.statut === 'envoye' && !expire(x);
  function statutDevis(x) {
    if (x.statut === 'accepte') return ['Accepté', '#3ddc84', x.reponse ? `le ${fmt(x.reponse.date, { day: 'numeric', month: 'long' })}` : ''];
    if (x.statut === 'refuse') return ['Refusé', '#ff6b8b', x.reponse ? `le ${fmt(x.reponse.date, { day: 'numeric', month: 'long' })}` : ''];
    if (expire(x)) return ['Expiré', '#7c705f', x.validite ? `le ${fmt(x.validite, { day: 'numeric', month: 'long' })}` : ''];
    return ['À valider', '#e8b46a', x.validite ? `avant le ${fmt(x.validite, { day: 'numeric', month: 'long' })}` : ''];
  }
  const ligneDocument = (x, [t, c, detail], nature) => `<li><div class="e-f-txt"><b>${nature} ${esc(x.numero)}</b><small>${esc(fmt(x.date, { day: 'numeric', month: 'long', year: 'numeric' }))}${x.objet ? ` · ${esc(x.objet)}` : ''}</small></div>`
    + `<span class="e-f-montant">${esc(F.euros(F.totaux(x).ttc))}</span>`
    + `<span class="e-f-statut"><em class="e-badge" style="--c:${c}">${esc(t)}</em>${detail ? `<small>${esc(detail)}</small>` : ''}</span>`
    + `<span class="e-f-boutons"><button type="button" class="icone-btn" data-voir="${esc(x.id)}" aria-label="Voir ${esc(x.numero)}" title="Voir">${icone('oeil')}</button>`
    + `<button type="button" class="icone-btn" data-pdf="${esc(x.id)}" aria-label="Télécharger ${esc(x.numero)} en PDF" title="Télécharger (PDF)">${icone('telecharger')}</button></span></li>`;

  function rendre() {
    const e = etat;
    const prochain = e.rdv.aVenir[0];
    const autres = e.rdv.aVenir.slice(1, 6);
    const projet = e.projet;
    const faites = projet ? projet.etapes.filter(x => x.fait).length : 0;
    const total = projet ? projet.etapes.length : 0;
    const pct = total ? Math.round(faites / total * 100) : 0;
    const aRegler = e.factures.filter(f => f.type !== 'avoir' && f.statut === 'emise' && !f.paiement);
    const montantDu = aRegler.reduce((t, f) => t + F.totaux(f).ttc, 0);
    const maj = new Date(e.maj);
    const enAttente = e.devis.filter(aRepondre);

    page.innerHTML = `<section class="e-hero"><p class="e-sur">Votre espace client</p><h1>Bonjour ${esc(e.client.nom)} 👋</h1>`
      + `<p class="e-intro">Retrouvez ici vos rendez-vous, l'avancement de votre projet${e.devis.length ? ', vos devis' : ''} et vos factures. Mis à jour le ${esc(maj.toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }))}.</p></section>`
      + (e.message ? `<section class="e-message"><img src="../assets/img/profile-sm.jpg" alt="" width="44" height="44"><div><b>Message de ${esc(e.pro.nom)}</b><p>${esc(e.message).replace(/\n/g, '<br>')}</p></div></section>` : '')
      // Devis qui attendent une réponse
      + enAttente.map(x => `<section class="e-attente"><span class="e-attente-ic">${icone('devis')}</span><div><b>Un devis attend votre réponse</b><p>Devis ${esc(x.numero)}${x.objet ? ` · ${esc(x.objet)}` : ''} · ${esc(F.euros(F.totaux(x).ttc))}${x.validite ? ` · valable jusqu'au ${esc(jourLong(x.validite))}` : ''}</p></div>`
        + `<button type="button" class="btn btn--primaire" data-voir="${esc(x.id)}">Voir et répondre</button></section>`).join('')
      + `<div class="e-grille">`
      // Prochain rendez-vous
      + `<section class="e-carte e-carte--rdv"><h2>${icone('calendrier')}Prochain rendez-vous</h2>`
      + (prochain ? `<div class="e-prochain"><b>${esc(quand(prochain.date))}</b><span>${esc(horaire(prochain))}</span><p>${esc(prochain.titre)}</p>`
        + (prochain.statut === 'attente' ? '<em class="e-badge" style="--c:#f5b971">En attente de confirmation</em>' : '<em class="e-badge" style="--c:#3ddc84">Confirmé · sur Discord</em>') + '</div>'
        + (autres.length ? `<ul class="e-liste">${autres.map(r => `<li><span>${esc(quand(r.date))}</span><b>${esc(horaire(r))}</b><small>${esc(r.titre)}</small></li>`).join('')}</ul>` : '')
        : '<p class="e-vide">Aucun rendez-vous prévu pour le moment.</p>')
      + `<a class="btn btn--ghost btn--petit" href="../rendez-vous/">${icone('plus')}Réserver un appel</a></section>`
      // Projet
      + (projet ? `<section class="e-carte"><h2>${icone('projet')}${esc(projet.titre || 'Votre projet')}</h2>`
        + (total ? `<div class="e-progres"><div class="e-barre-progres" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Avancement"><i style="width:${pct}%"></i></div><b>${pct} %</b></div>`
          + `<ul class="e-etapes">${projet.etapes.map(x => `<li class="${x.fait ? 'is-fait' : ''}"><span class="e-case">${x.fait ? icone('coche') : ''}</span>${esc(x.t)}</li>`).join('')}</ul>`
          : '<p class="e-vide">Les étapes du projet apparaîtront ici.</p>')
        + '</section>' : '')
      // Devis
      + (e.devis.length ? `<section class="e-carte e-carte--factures"><h2>${icone('devis')}Devis</h2>`
        + `<ul class="e-factures">${e.devis.map(x => ligneDocument(x, statutDevis(x), 'Devis')).join('')}</ul></section>` : '')
      // Factures
      + `<section class="e-carte e-carte--factures"><h2>${icone('facture')}Factures</h2>`
      + (aRegler.length ? `<p class="e-du">Reste à régler : <b>${esc(F.euros(montantDu))}</b></p>` : '')
      + (e.factures.length ? `<ul class="e-factures">${e.factures.map(f => {
        const [t, c, detail] = statut(f);
        return `<li><div class="e-f-txt"><b>${f.type === 'avoir' ? 'Avoir' : 'Facture'} ${esc(f.numero)}</b><small>${esc(fmt(f.date, { day: 'numeric', month: 'long', year: 'numeric' }))}${f.objet ? ` · ${esc(f.objet)}` : ''}</small></div>`
          + `<span class="e-f-montant">${esc(F.euros(F.totaux(f).ttc))}</span>`
          + `<span class="e-f-statut"><em class="e-badge" style="--c:${c}">${esc(t)}</em>${detail ? `<small>${esc(detail)}</small>` : ''}</span>`
          + `<span class="e-f-boutons"><button type="button" class="icone-btn" data-voir="${esc(f.id)}" aria-label="Voir ${esc(f.numero)}" title="Voir">${icone('oeil')}</button>`
          + `<button type="button" class="icone-btn" data-pdf="${esc(f.id)}" aria-label="Télécharger ${esc(f.numero)} en PDF" title="Télécharger (PDF)">${icone('telecharger')}</button></span></li>`;
      }).join('')}</ul>` : '<p class="e-vide">Aucune facture pour le moment.</p>')
      + '</section>'
      // Historique
      + `<section class="e-carte"><h2>${icone('horloge')}Rendez-vous passés</h2>`
      + (e.rdv.total ? `<p class="e-stats"><b>${e.rdv.total}</b> rendez-vous · <b>${esc(heures(e.rdv.minutes))}</b> au total</p>`
        + `<ul class="e-liste">${e.rdv.passes.slice(0, 10).map(r => `<li><span>${esc(maj1(fmt(r.date, { day: 'numeric', month: 'short', year: 'numeric' })))}</span><b>${esc(r.journee ? 'Journée' : heures(r.duree))}</b><small>${esc(r.titre)}</small></li>`).join('')}</ul>`
        : '<p class="e-vide">Pas encore de rendez-vous passé.</p>')
      + '</section></div>'
      + `<footer class="e-pied"><p>${icone('cadenas')}Ce lien est personnel : ne le partagez pas.${e.pro.email ? ` Une question ? <a href="mailto:${esc(e.pro.email)}">${esc(e.pro.email)}</a>` : ''}</p></footer>`;
  }

  /* ---------- Devis : aperçu et réponse ---------- */
  function zoneReponse(x) {
    const r = x.reponse || {};
    if (x.statut === 'accepte') return `<p class="e-reponse e-reponse--ok">${icone('coche')}<span>Devis accepté le ${esc(jourLong(r.date))}${r.nom ? ` par ${esc(r.nom)}` : ''}. Merci pour votre confiance !</span></p>`;
    if (x.statut === 'refuse') return `<p class="e-reponse">${icone('info')}<span>Ce devis a été refusé le ${esc(jourLong(r.date))}.</span></p>`;
    if (expire(x)) return `<p class="e-reponse">${icone('horloge')}<span>Ce devis a expiré le ${esc(jourLong(x.validite))}. Demandez-en une nouvelle version à ${esc(etat.pro.nom)}${etat.pro.email ? ` (<a href="mailto:${esc(etat.pro.email)}">${esc(etat.pro.email)}</a>)` : ''}.</span></p>`;
    return `<form class="e-accord" id="e-accord" data-id="${esc(x.id)}" novalidate><h3>Votre réponse</h3>`
      + `<p class="r-aide">En acceptant, vous donnez votre « Bon pour accord » pour ce devis de <b>${esc(F.euros(F.totaux(x).ttc))}</b>. ${esc(etat.pro.nom)} est prévenu tout de suite.</p>`
      + `<label class="champ"><span>Votre nom et prénom</span><input name="nom" maxlength="80" autocomplete="name" placeholder="Ex. Camille Martin"></label>`
      + `<label class="e-coche"><input type="checkbox" name="accord"><span>Bon pour accord : j'accepte ce devis${x.validite ? `, valable jusqu'au ${esc(jourLong(x.validite))}` : ''}, et ses conditions.</span></label>`
      + `<div class="e-refus" hidden><label class="champ"><span>Pourquoi refusez-vous ? (facultatif)</span><textarea name="motif" rows="2" maxlength="500" placeholder="Ex. Le budget est trop élevé pour le moment"></textarea></label></div>`
      + `<p class="f-erreur" id="e-accord-erreur" role="alert"></p>`
      + `<div class="e-accord-boutons"><button type="submit" class="btn btn--primaire">${icone('coche')}Accepter le devis</button><button type="button" class="btn btn--lien" data-refus>Refuser le devis</button></div></form>`;
  }
  function ouvrirDocument(x) {
    const devis = x.type === 'devis';
    $('#apercu-titre').textContent = `${devis ? 'Devis' : x.type === 'avoir' ? 'Avoir' : 'Facture'} ${x.numero}`;
    $('#apercu-corps').innerHTML = `<div class="r-boutons"><button type="button" class="btn btn--primaire btn--petit" data-pdf="${esc(x.id)}">${icone('telecharger')}Télécharger le PDF</button>`
      + (devis && aRepondre(x) ? `<button type="button" class="btn btn--ghost btn--petit" data-aller-reponse>Répondre au devis</button>` : '') + '</div>'
      + `<div class="fa-papier">${F.html(devis ? x : complete(x))}</div>`
      + (devis ? zoneReponse(x) : '');
    if (!$('#apercu').open) $('#apercu').showModal();
  }
  async function repondre(form, action) {
    const x = etat.devis.find(d => d.id === form.dataset.id);
    const erreur = $('#e-accord-erreur');
    const nom = form.elements.nom.value.trim();
    const accord = form.elements.accord.checked;
    erreur.textContent = '';
    if (action === 'accepter' && nom.length < 2) { erreur.textContent = 'Indiquez votre nom et prénom.'; form.elements.nom.focus(); return; }
    if (action === 'accepter' && !accord) { erreur.textContent = 'Cochez « Bon pour accord » pour accepter le devis.'; return; }
    const boutons = [...form.querySelectorAll('button')];
    boutons.forEach(b => { b.disabled = true; });
    try {
      const rep = await fetch(`${SERVEUR}/espace/devis`, {
        method: 'POST', cache: 'no-store',
        headers: { Authorization: `Cle ${cle}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: x.id, action, nom, accord, motif: form.elements.motif.value.trim() }),
      });
      const corps = await rep.json().catch(() => ({}));
      if (!rep.ok) throw new Error(corps.message || 'La réponse n\'a pas pu être enregistrée. Réessayez.');
      x.statut = corps.statut;
      x.reponse = corps.reponse;
      rendre();
      ouvrirDocument(x);
    } catch (e) {
      erreur.textContent = e.message === 'Failed to fetch' ? 'Impossible de joindre le serveur. Vérifiez votre connexion.' : e.message;
      boutons.forEach(b => { b.disabled = false; });
    }
  }

  document.addEventListener('submit', ev => {
    if (ev.target.id !== 'e-accord') return;
    ev.preventDefault();
    repondre(ev.target, 'accepter');
  });
  document.addEventListener('click', ev => {
    if (ev.target.closest('[data-reessayer]')) { page.innerHTML = '<div class="e-chargement"><span class="e-roue" aria-hidden="true"></span>Chargement…</div>'; charger(); return; }
    if (ev.target.closest('[data-aller-reponse]')) { ev.preventDefault(); const f = $('#e-accord'); if (f) { f.scrollIntoView({ behavior: 'smooth', block: 'center' }); f.elements.nom.focus({ preventScroll: true }); } return; }
    const refus = ev.target.closest('[data-refus]');
    if (refus) {
      const form = refus.closest('form');
      const zone = $('.e-refus', form);
      // Premier clic : on demande un motif (facultatif) ; second clic : on envoie le refus
      if (zone.hidden) { zone.hidden = false; refus.textContent = 'Confirmer le refus'; form.elements.motif.focus(); return; }
      repondre(form, 'refuser');
      return;
    }
    const pdf = ev.target.closest('[data-pdf]');
    const voir = ev.target.closest('[data-voir]');
    const id = pdf ? pdf.dataset.pdf : voir ? voir.dataset.voir : null;
    const x = etat && id ? [...etat.devis, ...etat.factures].find(d => d.id === id) : null;
    if (pdf && x) { F.telecharger(x.type === 'devis' ? x : complete(x)); return; }
    if (voir && x) { ouvrirDocument(x); return; }
    if (ev.target.closest('[data-fermer]') || ev.target.matches('dialog.dialogue')) $('#apercu').close();
  });
  window.addEventListener('hashchange', charger);
  charger();
})();
