/* Math&Co : ouverture automatique d'une correction protégée quand l'élève a déjà saisi le mot de passe dans
   l'espace élèves (ou dans une autre correction). Ajouté à la fin de chaque correction par outils/construire.py. */
(function () {
  'use strict';
  var CLE = 'mathandco.mdp';
  var carte = document.getElementById('carte'), champ = document.getElementById('mdp');
  if (!carte || !champ) return;

  // lien de retour sur l'écran de mot de passe
  var retour = document.createElement('a');
  retour.href = '../eleves.html';
  retour.textContent = 'Retour à l\'espace élèves';
  retour.style.cssText = 'display:block;margin-top:12px;font-size:14px;color:#0a5fd1;text-decoration:none;text-align:center';
  carte.appendChild(retour);

  var memo = null, longtemps = false;
  try { memo = localStorage.getItem(CLE); longtemps = !!memo; if (!memo) memo = sessionStorage.getItem(CLE); } catch (e) {}

  // mot de passe saisi ici avec succès : on le garde pour la suite de la séance
  var obs = new MutationObserver(function () {
    if (document.getElementById('verrou')) return;
    obs.disconnect();
    try { if (!longtemps && champ.value) sessionStorage.setItem(CLE, champ.value); } catch (e) {}
  });
  obs.observe(document.body, { childList: true });

  if (memo) {
    champ.value = memo;
    if (carte.requestSubmit) carte.requestSubmit();
    else carte.dispatchEvent(new Event('submit', { cancelable: true }));
  }
})();
