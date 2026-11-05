// Fonction Edge Supabase « brouillon-diagnostic » (Deno).
// Reçoit l'export JSON d'une visite, demande un BROUILLON de diagnostic à un LLM compatible OpenAI
// et le renvoie. La clé du LLM reste côté serveur (secrets Supabase) : elle n'est jamais dans le front.
//
// Secrets à définir : supabase secrets set LLM_API_KEY=... LLM_MODEL=... LLM_API_URL=... FEATURE_BROUILLON_IA=true
// Le prompt système est dans le fichier séparé prompt-redaction.md (modifiable sans toucher au code).

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TAILLE_MAX_OCTETS = 400_000;

const reponse = (corps: unknown, statut = 200) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });

/** Vérifie que l'appelant est un utilisateur connecté (la clé « anon » publique ne suffit pas). */
async function utilisateurConnecte(requete: Request): Promise<boolean> {
  const jeton = requete.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  const url = Deno.env.get('SUPABASE_URL');
  const cleAnon = Deno.env.get('SUPABASE_ANON_KEY');
  if (!jeton || !url || !cleAnon) return false;
  const res = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: `Bearer ${jeton}`, apikey: cleAnon } });
  if (!res.ok) return false;
  const utilisateur = await res.json();
  return typeof utilisateur?.id === 'string';
}

async function lirePrompt(): Promise<string> {
  // Le fichier est déclaré dans supabase/config.toml (static_files) pour être embarqué au déploiement.
  return await Deno.readTextFile(new URL('./prompt-redaction.md', import.meta.url));
}

Deno.serve(async (requete) => {
  if (requete.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (requete.method !== 'POST') return reponse({ erreur: 'Méthode non autorisée.' }, 405);

  if (Deno.env.get('FEATURE_BROUILLON_IA') !== 'true') {
    return reponse({ erreur: "La génération de brouillon est désactivée (FEATURE_BROUILLON_IA)." }, 403);
  }
  if (!(await utilisateurConnecte(requete))) return reponse({ erreur: 'Connexion requise.' }, 401);

  const cle = Deno.env.get('LLM_API_KEY');
  const modele = Deno.env.get('LLM_MODEL');
  const urlLlm = Deno.env.get('LLM_API_URL') ?? 'https://api.openai.com/v1/chat/completions';
  if (!cle || !modele) return reponse({ erreur: 'Le service de rédaction n\'est pas configuré (LLM_API_KEY, LLM_MODEL).' }, 500);

  const brut = await requete.text();
  if (brut.length > TAILLE_MAX_OCTETS) return reponse({ erreur: 'Visite trop volumineuse pour la génération.' }, 413);
  let visite: unknown;
  try {
    visite = JSON.parse(brut)?.visite;
  } catch {
    return reponse({ erreur: 'Requête invalide.' }, 400);
  }
  if (!visite || typeof visite !== 'object' || (visite as { schema?: string }).schema !== 'rse-diag/visite@1') {
    return reponse({ erreur: "Export de visite invalide (schéma attendu : rse-diag/visite@1)." }, 400);
  }

  let prompt: string;
  try {
    prompt = await lirePrompt();
  } catch {
    return reponse({ erreur: 'Prompt de rédaction introuvable (fichier prompt-redaction.md non déployé).' }, 500);
  }

  try {
    const res = await fetch(urlLlm, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modele,
        temperature: 0.2,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: `Voici l'export JSON de la visite :\n\n${JSON.stringify(visite)}` },
        ],
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) {
      // Le détail reste dans les journaux de la fonction ; le client n'a pas à le voir.
      console.error('Erreur LLM', res.status, (await res.text()).slice(0, 500));
      return reponse({ erreur: `Le service de rédaction a répondu une erreur (${res.status}).` }, 502);
    }
    const donnees = await res.json();
    const texte = donnees?.choices?.[0]?.message?.content;
    if (typeof texte !== 'string' || !texte.trim()) return reponse({ erreur: 'Réponse vide du service de rédaction.' }, 502);
    return reponse({ brouillon: texte.trim() });
  } catch (e) {
    console.error('Appel LLM impossible', e);
    return reponse({ erreur: 'Le service de rédaction est injoignable ou trop lent. Réessayez.' }, 504);
  }
});
