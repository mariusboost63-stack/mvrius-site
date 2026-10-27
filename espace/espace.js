/* ==========================================================================
   Espace client — mvriuus.fr/espace/#clé
   La clé (après le #) n'est jamais envoyée dans l'adresse : elle part seulement
   vers le serveur de l'agenda, qui renvoie les rendez-vous, le projet et les
   factures de ce client, et rien d'autre.
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
    const cle = decodeURIComponent(location.hash.slice(1));
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
    etat = corps;
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

    page.innerHTML = `<section class="e-hero"><p class="e-sur">Votre espace client</p><h1>Bonjour ${esc(e.client.nom)} 👋</h1>`
      + `<p class="e-intro">Retrouvez ici vos rendez-vous, l'avancement de votre projet et vos factures. Mis à jour le ${esc(maj.toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }))}.</p></section>`
      + (e.message ? `<section class="e-message"><img src="../assets/img/profile-sm.jpg" alt="" width="44" height="44"><div><b>Message de ${esc(e.pro.nom)}</b><p>${esc(e.message).replace(/\n/g, '<br>')}</p></div></section>` : '')
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

  document.addEventListener('click', ev => {
    if (ev.target.closest('[data-reessayer]')) { page.innerHTML = '<div class="e-chargement"><span class="e-roue" aria-hidden="true"></span>Chargement…</div>'; charger(); return; }
    const pdf = ev.target.closest('[data-pdf]');
    const voir = ev.target.closest('[data-voir]');
    const f = etat && etat.factures.find(x => x.id === (pdf || voir || {}).dataset?.[pdf ? 'pdf' : 'voir']);
    if (pdf && f) { F.telecharger(complete(f)); return; }
    if (voir && f) {
      $('#apercu-titre').textContent = `${f.type === 'avoir' ? 'Avoir' : 'Facture'} ${f.numero}`;
      $('#apercu-corps').innerHTML = `<div class="r-boutons"><button type="button" class="btn btn--primaire btn--petit" data-pdf="${esc(f.id)}">${icone('telecharger')}Télécharger le PDF</button></div><div class="fa-papier">${F.html(complete(f))}</div>`;
      $('#apercu').showModal();
      return;
    }
    if (ev.target.closest('[data-fermer]') || ev.target.matches('dialog.dialogue')) $('#apercu').close();
  });
  window.addEventListener('hashchange', charger);
  charger();
})();
