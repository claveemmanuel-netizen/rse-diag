import type { SupabaseClient, Session } from '@supabase/supabase-js';
import type { Role, Utilisateur } from '../../domain/types';
import type { ServiceAuth } from '../distant';

const CLE_CACHE = 'rse-diag:utilisateur';

function lireCache(): Utilisateur | null {
  try {
    const brut = localStorage.getItem(CLE_CACHE);
    return brut ? (JSON.parse(brut) as Utilisateur) : null;
  } catch {
    return null;
  }
}
const ecrireCache = (u: Utilisateur | null) => {
  try {
    if (u) localStorage.setItem(CLE_CACHE, JSON.stringify(u));
    else localStorage.removeItem(CLE_CACHE);
  } catch {
    /* stockage indisponible : sans conséquence */
  }
};

/** Authentification Supabase par lien magique. Le profil (et donc le rôle) est mis en cache pour le mode hors ligne. */
export class AuthSupabase implements ServiceAuth {
  readonly mode = 'supabase' as const;
  constructor(private readonly client: SupabaseClient) {}

  /** Lit le profil (rôle) ; hors ligne, retombe sur le cache, puis sur le rôle « terrain » (le moins privilégié). */
  private async construireUtilisateur(session: Session): Promise<Utilisateur> {
    const cache = lireCache();
    const base: Utilisateur = {
      id: session.user.id,
      email: session.user.email ?? '',
      nom: session.user.email ?? '',
      role: cache?.id === session.user.id ? cache.role : 'terrain',
    };
    try {
      const { data, error } = await this.client.from('profils').select('id, email, nom, role').eq('id', session.user.id).maybeSingle();
      if (!error && data) {
        const profil = data as { nom?: string; email?: string; role?: Role };
        base.nom = profil.nom || base.nom;
        base.email = profil.email || base.email;
        if (profil.role === 'bureau' || profil.role === 'terrain') base.role = profil.role;
      }
    } catch {
      /* hors ligne */
    }
    ecrireCache(base);
    return base;
  }

  async restaurerSession(): Promise<Utilisateur | null> {
    try {
      const { data } = await this.client.auth.getSession();
      if (data.session) return await this.construireUtilisateur(data.session);
    } catch {
      /* hors ligne : on retombe sur le cache */
    }
    // Hors ligne avec un jeton expiré : on garde la session le temps de retrouver le réseau.
    if (!navigator.onLine) return lireCache();
    return null;
  }

  async envoyerLienMagique(email: string): Promise<void> {
    const { error } = await this.client.auth.signInWithOtp({
      email,
      // Les comptes sont créés par l'administrateur (invitation) : pas d'inscription libre.
      options: { shouldCreateUser: false, emailRedirectTo: window.location.origin },
    });
    if (error) throw new Error(error.message);
  }

  async deconnecter(): Promise<void> {
    ecrireCache(null);
    await this.client.auth.signOut();
  }

  surChangement(fn: (u: Utilisateur | null) => void): () => void {
    const { data } = this.client.auth.onAuthStateChange((evenement, session) => {
      if (evenement === 'SIGNED_OUT') {
        ecrireCache(null);
        fn(null);
      } else if (session && (evenement === 'SIGNED_IN' || evenement === 'USER_UPDATED')) {
        // Appel différé : on ne doit pas appeler Supabase dans le callback d'authentification.
        setTimeout(() => void this.construireUtilisateur(session).then(fn), 0);
      }
    });
    return () => data.subscription.unsubscribe();
  }
}
