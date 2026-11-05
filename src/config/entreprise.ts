// Informations propres à l'entreprise (en-tête du PDF, mention RGPD…).
// Modifiables sans coder via les variables VITE_ENTREPRISE_* (voir .env.example).

const env = import.meta.env;

export const entreprise = {
  nom: (env.VITE_ENTREPRISE_NOM as string | undefined) || '[NOM_ENTREPRISE]',
  adresse: (env.VITE_ENTREPRISE_ADRESSE as string | undefined) || '[Adresse de l’entreprise]',
  telephone: (env.VITE_ENTREPRISE_TELEPHONE as string | undefined) || '[Téléphone]',
  email: (env.VITE_ENTREPRISE_EMAIL as string | undefined) || '[contact@entreprise.fr]',
  siteWeb: (env.VITE_ENTREPRISE_SITE as string | undefined) || '[www.entreprise.fr]',
  emailRgpd: (env.VITE_ENTREPRISE_EMAIL_RGPD as string | undefined) || (env.VITE_ENTREPRISE_EMAIL as string | undefined) || '[contact@entreprise.fr]',
  /** Logo affiché dans le PDF (PNG ou JPG, dans le dossier public/). */
  logo: '/logo.png',
  mentionOffert: 'Diagnostic offert',
};

export const config = {
  supabaseUrl: (env.VITE_SUPABASE_URL as string | undefined) || '',
  supabaseAnonKey: (env.VITE_SUPABASE_ANON_KEY as string | undefined) || '',
  brouillonIa: String(env.VITE_FEATURE_BROUILLON_IA) === 'true',
};

export const modeLocal = !config.supabaseUrl || !config.supabaseAnonKey;

/**
 * Boutons « données de test » (pré-remplissage pour démonstration et recette).
 * Toujours actifs en mode local (démo, sans serveur) ; avec un vrai serveur, uniquement si VITE_FEATURE_DONNEES_TEST=true.
 */
export const donneesTestActives = modeLocal || String(env.VITE_FEATURE_DONNEES_TEST) === 'true';

/** Texte d'information RGPD lu au contact avant la collecte (à faire valider par le DPO / conseil juridique). */
export const informationRgpd = {
  titre: 'Information sur vos données personnelles',
  paragraphes: [
    `${entreprise.nom} réalise pour vous un diagnostic offert des espaces extérieurs de votre site. Pour cela, nous enregistrons des informations sur le site (observations, photos, mesures approximatives) ainsi que vos coordonnées professionnelles : nom, fonction, email et téléphone professionnels.`,
    `Finalités : réaliser le diagnostic, vous transmettre le rapport et, si vous le souhaitez, vous proposer un échange sur l'entretien de vos espaces extérieurs.`,
    `Base légale : votre consentement pour l'envoi du rapport ; notre intérêt légitime pour le suivi de la relation professionnelle.`,
    `Destinataires : les équipes de ${entreprise.nom} et notre hébergeur de données. Aucune revente de vos données.`,
    `Durée de conservation : 3 ans à compter du dernier contact.`,
    `Vos droits : accès, rectification, effacement, limitation, opposition, en écrivant à ${entreprise.emailRgpd}. Vous pouvez aussi saisir la CNIL (cnil.fr).`,
    `Photos : nous évitons de photographier des personnes identifiables ; signalez-nous toute zone à ne pas photographier.`,
  ],
};
