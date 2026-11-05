import { modeLocal } from '../config/entreprise';
import type { Role, Utilisateur } from '../domain/types';
import { nouvelId } from '../lib/outils';
import type { DepotDistant, ServiceAuth } from './distant';
import { AuthSupabase } from './supabase/auth';
import { supabase } from './supabase/client';
import { DepotSupabase } from './supabase/distant';

// Point unique de branchement du backend. Pour passer à un autre backend, remplacer ces deux lignes
// par une autre implémentation de `DepotDistant` et `ServiceAuth` (voir `distant.ts`).

const CLE_LOCALE = 'rse-diag:utilisateur-local';

/** Mode local (aucun Supabase configuré) : « faux » compte pour tester l'application sur un seul appareil. */
export class AuthLocale implements ServiceAuth {
  readonly mode = 'local' as const;
  private ecouteurs = new Set<(u: Utilisateur | null) => void>();

  async restaurerSession(): Promise<Utilisateur | null> {
    try {
      const brut = localStorage.getItem(CLE_LOCALE);
      return brut ? (JSON.parse(brut) as Utilisateur) : null;
    } catch {
      return null;
    }
  }

  async envoyerLienMagique(): Promise<void> {
    throw new Error("Mode local : aucun serveur configuré, la connexion par e-mail n'est pas disponible.");
  }

  /** Connexion de démonstration (nom + rôle au choix). */
  async connexionLocale(nom: string, role: Role): Promise<Utilisateur> {
    const existant = await this.restaurerSession();
    const utilisateur: Utilisateur = { id: existant?.id ?? nouvelId(), email: '', nom: nom.trim() || 'Utilisateur', role };
    localStorage.setItem(CLE_LOCALE, JSON.stringify(utilisateur));
    this.ecouteurs.forEach((fn) => fn(utilisateur));
    return utilisateur;
  }

  async deconnecter(): Promise<void> {
    localStorage.removeItem(CLE_LOCALE);
    this.ecouteurs.forEach((fn) => fn(null));
  }

  surChangement(fn: (u: Utilisateur | null) => void): () => void {
    this.ecouteurs.add(fn);
    return () => void this.ecouteurs.delete(fn);
  }
}

export const auth: ServiceAuth = supabase ? new AuthSupabase(supabase) : new AuthLocale();
export const depotDistant: DepotDistant | null = supabase ? new DepotSupabase(supabase) : null;
export { modeLocal };
