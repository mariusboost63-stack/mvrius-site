/* ==========================================================================
   Factures de Mvrius — calculs, aperçu et PDF
   Partagé par l'agenda (création des factures) et l'espace client (téléchargement).
   Le PDF est fabriqué ici, sans bibliothèque : polices standard Helvetica,
   encodage WinAnsi (accents, €, guillemets français).
   ========================================================================== */
(() => {
  'use strict';

  const MENTIONS = "En cas de retard de paiement : pénalités au taux annuel de 3 fois le taux d'intérêt légal et, pour les clients professionnels, indemnité forfaitaire de 40 € pour frais de recouvrement (art. L441-10 du Code de commerce). Pas d'escompte pour paiement anticipé.";
  const FRANCHISE = 'TVA non applicable, art. 293 B du CGI';
  const UNITES = [['h', 'h'], ['forfait', 'forfait'], ['unite', 'unité'], ['jour', 'jour'], ['mois', 'mois']];
  const MODES = [['virement', 'Virement'], ['paypal', 'PayPal'], ['carte', 'Carte'], ['especes', 'Espèces'], ['cheque', 'Chèque'], ['autre', 'Autre']];

  const arrondi = n => Math.round(n * 100) / 100;
  function totaux(f) {
    const lignes = (f.lignes || []).map(l => ({ ...l, total: arrondi((Number(l.qte) || 0) * (Number(l.pu) || 0)) }));
    const ht = arrondi(lignes.reduce((t, l) => t + l.total, 0));
    const taux = Number(f.tva) > 0 ? Number(f.tva) : 0;
    const tva = Math.round(ht * taux) / 100;
    return { lignes, ht, taux, tva, ttc: arrondi(ht + tva) };
  }
  const euros = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
  const nombre = n => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n);
  const dateLongue = d => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${d}T12:00:00Z`)) : '');
  const uniteDe = u => (UNITES.find(x => x[0] === u) || ['', ''])[1];

  // Numéro suivant, sans trou : F-2026-001, F-2026-002… (par préfixe et par année)
  function numeroSuivant(factures, prefixe, annee) {
    const motif = new RegExp(`^${prefixe.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-${annee}-(\\d+)$`);
    const max = (factures || []).reduce((m, f) => { const x = motif.exec((f && f.numero) || ''); return x ? Math.max(m, Number(x[1])) : m; }, 0);
    return `${prefixe}-${annee}-${String(max + 1).padStart(3, '0')}`;
  }
  const nomFichier = f => `${f.type === 'avoir' ? 'avoir' : 'facture'}-${String(f.numero || 'brouillon').replace(/[^\w-]+/g, '')}.pdf`;

  /* ---------- Aperçu (HTML) ---------- */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const lignesTxt = s => String(s || '').split('\n').map(x => x.trim()).filter(Boolean);
  function coordonnees(v) {
    return [v.identite && v.identite !== v.nom ? v.identite : '', ...lignesTxt(v.adresse), v.siret ? `SIRET ${v.siret}` : '', v.siren ? `SIREN ${v.siren}` : '', v.tvaNum ? `TVA ${v.tvaNum}` : '', v.email || ''].filter(Boolean);
  }
  function html(f) {
    const t = totaux(f);
    const v = f.vendeur || {};
    const a = f.acheteur || {};
    const avoir = f.type === 'avoir';
    const lignes = t.lignes.map(l => `<tr><td>${esc(l.desc).replace(/\n/g, '<br>')}</td><td class="fx-n">${esc(nombre(Number(l.qte) || 0))}${l.unite && l.unite !== 'unite' ? ` ${esc(uniteDe(l.unite))}` : ''}</td><td class="fx-n">${esc(euros(Number(l.pu) || 0))}</td><td class="fx-n">${esc(euros(l.total))}</td></tr>`).join('');
    return `<article class="fx">`
      + `<header class="fx-tete"><div><b class="fx-vendeur">${esc(v.nom || 'Mvrius')}</b>${coordonnees(v).map(x => `<span>${esc(x)}</span>`).join('')}</div>`
      + `<div class="fx-titre"><b>${avoir ? 'Avoir' : 'Facture'}</b><span>${f.numero ? `N° ${esc(f.numero)}` : 'Brouillon (pas encore numérotée)'}</span><span>Date : ${esc(dateLongue(f.date))}</span>${!avoir && f.echeance ? `<span>Échéance : ${esc(dateLongue(f.echeance))}</span>` : ''}</div></header>`
      + `<section class="fx-client"><small>${avoir ? 'Client' : 'Facturé à'}</small><b>${esc(a.nom || '—')}</b>${coordonnees(a).map(x => `<span>${esc(x)}</span>`).join('')}</section>`
      + (f.objet ? `<p class="fx-objet"><b>Objet :</b> ${esc(f.objet)}</p>` : '')
      + (avoir && f.refNumero ? `<p class="fx-objet">Avoir relatif à la facture n° ${esc(f.refNumero)}.</p>` : '')
      + `<table class="fx-table"><thead><tr><th>Description</th><th class="fx-n">Qté</th><th class="fx-n">Prix unitaire${t.taux ? ' HT' : ''}</th><th class="fx-n">Total${t.taux ? ' HT' : ''}</th></tr></thead><tbody>${lignes || '<tr><td colspan="4" class="fx-vide">Aucune ligne</td></tr>'}</tbody></table>`
      + `<dl class="fx-totaux">${t.taux ? `<div><dt>Total HT</dt><dd>${esc(euros(t.ht))}</dd></div><div><dt>TVA ${esc(nombre(t.taux))} %</dt><dd>${esc(euros(t.tva))}</dd></div><div class="fx-ttc"><dt>Total TTC</dt><dd>${esc(euros(t.ttc))}</dd></div>`
        : `<div class="fx-ttc"><dt>Total</dt><dd>${esc(euros(t.ttc))}</dd></div><p class="fx-franchise">${FRANCHISE}</p>`}</dl>`
      + (f.paiement && f.paiement.date ? `<p class="fx-paye">${avoir ? 'Remboursé' : 'Payée'} le ${esc(dateLongue(f.paiement.date))}</p>`
        : !avoir && (v.iban || v.bic) ? `<p class="fx-reglement"><b>Paiement par virement</b>${v.iban ? ` · IBAN ${esc(v.iban)}` : ''}${v.bic ? ` · BIC ${esc(v.bic)}` : ''}</p>` : '')
      + (f.notes ? `<p class="fx-notes">${esc(f.notes).replace(/\n/g, '<br>')}</p>` : '')
      + `<footer class="fx-pied">${esc(v.mentions || MENTIONS)}</footer></article>`;
  }

  /* ---------- PDF ---------- */
  // Largeurs Helvetica / Helvetica-Bold (codes WinAnsi 32 à 255, en millièmes de la taille)
  const LARGEURS = {
    n: [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,0,556,0,222,556,333,1000,556,556,333,1000,667,333,1000,0,611,0,0,222,222,333,333,350,556,1000,333,1000,500,333,944,0,500,500,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500],
    g: [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,0,556,0,278,556,500,1000,556,556,333,1000,667,333,1000,0,611,0,0,278,278,500,500,350,556,1000,333,1000,556,333,944,0,500,556,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556],
  };
  // Caractères hors Latin-1 présents dans WinAnsi (et espaces insécables d'Intl)
  const WINANSI = { 0x20ac: 128, 0x201a: 130, 0x192: 131, 0x201e: 132, 0x2026: 133, 0x2020: 134, 0x2021: 135, 0x2c6: 136, 0x2030: 137, 0x160: 138, 0x2039: 139, 0x152: 140, 0x17d: 142, 0x2018: 145, 0x2019: 146, 0x201c: 147, 0x201d: 148, 0x2022: 149, 0x2013: 150, 0x2014: 151, 0x2dc: 152, 0x2122: 153, 0x161: 154, 0x203a: 155, 0x153: 156, 0x17e: 158, 0x178: 159, 0x202f: 160, 0x2009: 32, 0x2010: 45, 0x2011: 45, 0x2212: 45 };
  const octets = s => [...String(s ?? '').normalize('NFC')].map(ch => {
    const u = ch.codePointAt(0);
    if ((u >= 32 && u <= 126) || (u >= 160 && u <= 255)) return u;
    return WINANSI[u] ?? (u === 9 ? 32 : 63); // « ? » pour ce que la police ne connaît pas (émojis…)
  });
  const largeur = (s, gras, taille) => octets(s).reduce((t, o) => t + ((gras ? LARGEURS.g : LARGEURS.n)[o - 32] || 556), 0) * taille / 1000;
  const chainePdf = s => `(${octets(s).map(o => (o === 40 || o === 41 || o === 92 ? `\\${String.fromCharCode(o)}` : o > 126 ? `\\${o.toString(8).padStart(3, '0')}` : String.fromCharCode(o))).join('')})`;
  // Coupe un texte en lignes qui tiennent dans « max » points
  function couper(texte, max, gras, taille) {
    const res = [];
    // Espaces insécables du français : pas de « ou de : seul en bout de ligne
    const typo = String(texte ?? '').replace(/« /g, '« ').replace(/ (»|[:;!?](?=\s|$))/g, ' $1');
    for (const para of typo.split('\n')) {
      let ligne = '';
      for (const mot of para.split(/ +/)) {
        const essai = ligne ? `${ligne} ${mot}` : mot;
        if (largeur(essai, gras, taille) <= max) { ligne = essai; continue; }
        if (ligne) res.push(ligne);
        // Mot trop long : coupé au caractère
        let reste = mot;
        while (largeur(reste, gras, taille) > max) {
          let k = reste.length;
          while (k > 1 && largeur(reste.slice(0, k), gras, taille) > max) k--;
          res.push(reste.slice(0, k));
          reste = reste.slice(k);
        }
        ligne = reste;
      }
      res.push(ligne);
    }
    return res;
  }
  const couleurPdf = hex => { const n = parseInt(hex.slice(1), 16); return `${((n >> 16) / 255).toFixed(3)} ${(((n >> 8) & 255) / 255).toFixed(3)} ${((n & 255) / 255).toFixed(3)}`; };
  const fx = n => (Math.round(n * 100) / 100).toString();

  function pdf(f) {
    const W = 595.28, H = 841.89, M = 48, LARGE = W - 2 * M;
    const ENCRE = '#1d1a16', GRIS = '#6f665a', TRAIT = '#e3dccf', OR = '#b9792b', FOND = '#f6f1e8';
    const pages = [];
    let ops = null;
    let y = 0;
    const nouvellePage = () => { ops = []; pages.push(ops); y = M; };
    const texte = (x, yy, s, { gras = false, taille = 10, couleur = ENCRE, align = 'g' } = {}) => {
      const l = largeur(s, gras, taille);
      const xx = align === 'd' ? x - l : align === 'c' ? x - l / 2 : x;
      ops.push(`BT /${gras ? 'F2' : 'F1'} ${fx(taille)} Tf ${couleurPdf(couleur)} rg ${fx(xx)} ${fx(H - yy)} Td ${chainePdf(s)} Tj ET`);
    };
    const rect = (x, yy, w, h, couleur) => ops.push(`${couleurPdf(couleur)} rg ${fx(x)} ${fx(H - yy - h)} ${fx(w)} ${fx(h)} re f`);
    const trait = (x1, yy, x2, couleur = TRAIT, ep = 0.8) => ops.push(`${couleurPdf(couleur)} RG ${fx(ep)} w ${fx(x1)} ${fx(H - yy)} m ${fx(x2)} ${fx(H - yy)} l S`);

    const t = totaux(f);
    const v = f.vendeur || {};
    const a = f.acheteur || {};
    const avoir = f.type === 'avoir';
    const tete = f.numero ? `${avoir ? 'Avoir' : 'Facture'} n° ${f.numero}` : 'Brouillon';
    nouvellePage();

    // En-tête : vendeur à gauche, titre à droite
    texte(M, y + 16, v.nom || 'Mvrius', { gras: true, taille: 18 });
    let yg = y + 34;
    for (const l of coordonnees(v)) for (const x of couper(l, LARGE * 0.5, false, 8.8)) { texte(M, yg, x, { taille: 8.8, couleur: GRIS }); yg += 12; }
    texte(W - M, y + 18, avoir ? 'AVOIR' : 'FACTURE', { gras: true, taille: 22, couleur: OR, align: 'd' });
    let yd = y + 38;
    const droite = [[f.numero ? `N° ${f.numero}` : 'Brouillon (non numérotée)', true], [`Date : ${dateLongue(f.date)}`, false]];
    if (!avoir && f.echeance) droite.push([`Échéance : ${dateLongue(f.echeance)}`, false]);
    for (const [l, g] of droite) { texte(W - M, yd, l, { gras: g, taille: 9.5, align: 'd' }); yd += 14; }
    y = Math.max(yg, yd) + 18;

    // Client
    const xc = W / 2 + 10;
    const lignesClient = [a.nom || '—', ...coordonnees(a)].flatMap((l, k) => couper(l, W - M - xc - 16, k === 0, k === 0 ? 11 : 9));
    const hClient = 30 + lignesClient.length * 13;
    rect(xc, y, W - M - xc, hClient, FOND);
    texte(xc + 12, y + 17, avoir ? 'CLIENT' : 'FACTURÉ À', { gras: true, taille: 7.5, couleur: GRIS });
    lignesClient.forEach((l, k) => texte(xc + 12, y + 33 + k * 13, l, { gras: k === 0, taille: k === 0 ? 11 : 9, couleur: k === 0 ? ENCRE : GRIS }));
    y += hClient + 22;
    if (f.objet) { for (const l of couper(`Objet : ${f.objet}`, LARGE, false, 10)) { texte(M, y, l, { taille: 10 }); y += 14; } y += 4; }
    if (avoir && f.refNumero) { texte(M, y, `Avoir relatif à la facture n° ${f.refNumero}.`, { taille: 10 }); y += 18; }

    // Tableau des lignes
    const col = { qte: M + LARGE * 0.63, pu: M + LARGE * 0.82, total: W - M };
    const enTete = () => {
      rect(M, y, LARGE, 22, ENCRE);
      texte(M + 10, y + 14.5, 'Description', { gras: true, taille: 8.5, couleur: '#ffffff' });
      texte(col.qte, y + 14.5, 'Qté', { gras: true, taille: 8.5, couleur: '#ffffff', align: 'd' });
      texte(col.pu, y + 14.5, `Prix unitaire${t.taux ? ' HT' : ''}`, { gras: true, taille: 8.5, couleur: '#ffffff', align: 'd' });
      texte(col.total - 10, y + 14.5, `Total${t.taux ? ' HT' : ''}`, { gras: true, taille: 8.5, couleur: '#ffffff', align: 'd' });
      y += 22;
    };
    enTete();
    const BAS = H - M - 70; // place gardée pour le pied de page
    for (const l of t.lignes) {
      const desc = couper(l.desc || '', LARGE * 0.5, false, 9.5);
      const h = 12 + desc.length * 12.5;
      if (y + h > BAS) { nouvellePage(); texte(M, y + 10, `${tete} (suite)`, { gras: true, taille: 9, couleur: GRIS }); y += 24; enTete(); }
      desc.forEach((x, k) => texte(M + 10, y + 16 + k * 12.5, x, { taille: 9.5 }));
      texte(col.qte, y + 16, `${nombre(Number(l.qte) || 0)}${l.unite && l.unite !== 'unite' ? ` ${uniteDe(l.unite)}` : ''}`, { taille: 9.5, align: 'd' });
      texte(col.pu, y + 16, euros(Number(l.pu) || 0), { taille: 9.5, align: 'd' });
      texte(col.total - 10, y + 16, euros(l.total), { taille: 9.5, align: 'd' });
      y += h;
      trait(M, y, W - M);
    }

    // Totaux
    const lignesTot = t.taux ? [['Total HT', euros(t.ht)], [`TVA ${nombre(t.taux)} %`, euros(t.tva)]] : [];
    const hTot = 14 + lignesTot.length * 16 + 30 + (t.taux ? 0 : 14);
    if (y + hTot > BAS) { nouvellePage(); }
    y += 14;
    const xt = M + LARGE * 0.55;
    for (const [k, val] of lignesTot) { texte(xt + 10, y + 10, k, { taille: 9.5, couleur: GRIS }); texte(W - M - 10, y + 10, val, { taille: 9.5, align: 'd' }); y += 16; }
    rect(xt, y, W - M - xt, 26, OR);
    texte(xt + 10, y + 17, t.taux ? 'Total TTC' : 'Total', { gras: true, taille: 11, couleur: '#ffffff' });
    texte(W - M - 10, y + 17, euros(t.ttc), { gras: true, taille: 11, couleur: '#ffffff', align: 'd' });
    y += 26;
    if (!t.taux) { texte(W - M, y + 13, FRANCHISE, { taille: 8.5, couleur: GRIS, align: 'd' }); y += 14; }
    y += 22;

    // Paiement, notes
    const blocs = [];
    if (f.paiement && f.paiement.date) blocs.push([`${avoir ? 'Remboursé' : 'Payée'} le ${dateLongue(f.paiement.date)}.`, true]);
    else if (!avoir) {
      if (f.echeance) blocs.push([`À régler au plus tard le ${dateLongue(f.echeance)}.`, true]);
      if (v.iban) blocs.push([`Paiement par virement : IBAN ${v.iban}${v.bic ? ` · BIC ${v.bic}` : ''}`, false]);
    }
    if (f.notes) blocs.push([f.notes, false]);
    for (const [b, g] of blocs) {
      for (const l of couper(b, LARGE, g, 9.5)) {
        if (y + 14 > BAS) nouvellePage();
        texte(M, y, l, { gras: g, taille: 9.5 }); y += 13.5;
      }
      y += 5;
    }

    // Pied de page : mentions sur chaque page, numéro de page
    const pied = couper(v.mentions || MENTIONS, LARGE, false, 7.3);
    pages.forEach((p, k) => {
      ops = p;
      let yp = H - M - pied.length * 9.5 + 4;
      trait(M, yp - 12, W - M);
      for (const l of pied) { texte(M, yp, l, { taille: 7.3, couleur: GRIS }); yp += 9.5; }
      if (pages.length > 1) texte(W - M, H - M + 14, `${tete} · page ${k + 1}/${pages.length}`, { taille: 7.3, couleur: GRIS, align: 'd' });
    });

    // Assemblage du fichier
    const objets = [];
    const ajouter = contenu => { objets.push(contenu); return objets.length; };
    const catalogue = ajouter(null);
    const arbre = ajouter(null);
    const f1 = ajouter('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const f2 = ajouter('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const kids = pages.map(p => {
      const flux = p.join('\n');
      const c = ajouter(`<< /Length ${flux.length} >>\nstream\n${flux}\nendstream`);
      return ajouter(`<< /Type /Page /Parent ${arbre} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${c} 0 R >>`);
    });
    objets[catalogue - 1] = `<< /Type /Catalog /Pages ${arbre} 0 R >>`;
    objets[arbre - 1] = `<< /Type /Pages /Kids [${kids.map(k => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
    const d = new Date();
    const p2 = n => String(n).padStart(2, '0');
    const info = ajouter(`<< /Title ${chainePdf(tete)} /Author ${chainePdf(v.nom || 'Mvrius')} /Producer (mvriuus.fr) /CreationDate (D:${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}Z) >>`);
    let sortie = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
    const positions = [];
    objets.forEach((o, k) => { positions.push(sortie.length); sortie += `${k + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = sortie.length;
    sortie += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n${positions.map(p => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}`;
    sortie += `trailer\n<< /Size ${objets.length + 1} /Root ${catalogue} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Uint8Array.from(sortie, c => c.charCodeAt(0) & 255);
  }

  function telecharger(f) {
    const url = URL.createObjectURL(new Blob([pdf(f)], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = nomFichier(f);
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  window.Facture = { MENTIONS, FRANCHISE, UNITES, MODES, totaux, euros, nombre, dateLongue, numeroSuivant, nomFichier, html, pdf, telecharger };
})();
