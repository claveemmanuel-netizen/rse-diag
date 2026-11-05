import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { db } from '../db/base';
import type { Role, Utilisateur } from '../domain/types';
import { auth, AuthLocale, depotDistant } from '../repository';
import { arreterSync, demarrerSync } from '../repository/sync';

interface ContexteAuth {
  utilisateur: Utilisateur | null;
  /** true tant que la session n'a pas été restaurée au démarrage. */
  chargement: boolean;
  mode: 'supabase' | 'local';
  estBureau: boolean;
  envoyerLienMagique: (email: string) => Promise<void>;
  connexionLocale: (nom: string, role: Role) => Promise<void>;
  deconnecter: () => Promise<void>;
}

const Contexte = createContext<ContexteAuth | null>(null);

export function FournisseurAuth({ children }: { children: ReactNode }) {
  const [utilisateur, setUtilisateur] = useState<Utilisateur | null>(null);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    let actif = true;
    void auth
      .restaurerSession()
      .then((u) => actif && setUtilisateur(u))
      .finally(() => actif && setChargement(false));
    const desabonner = auth.surChangement((u) => actif && setUtilisateur(u));
    return () => {
      actif = false;
      desabonner();
    };
  }, []);

  // La synchronisation tourne tant qu'une session est ouverte et qu'un serveur est configuré.
  useEffect(() => {
    if (!utilisateur) return;
    void db.utilisateurs.put(utilisateur);
    if (!depotDistant) return;
    demarrerSync(depotDistant, utilisateur);
    return () => arreterSync();
  }, [utilisateur]);

  const connexionLocale = useCallback(async (nom: string, role: Role) => {
    if (auth instanceof AuthLocale) await auth.connexionLocale(nom, role);
  }, []);

  const valeur = useMemo<ContexteAuth>(
    () => ({
      utilisateur,
      chargement,
      mode: auth.mode,
      estBureau: utilisateur?.role === 'bureau',
      envoyerLienMagique: (email) => auth.envoyerLienMagique(email),
      connexionLocale,
      deconnecter: () => auth.deconnecter(),
    }),
    [utilisateur, chargement, connexionLocale],
  );

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useAuth(): ContexteAuth {
  const c = useContext(Contexte);
  if (!c) throw new Error('useAuth doit être utilisé dans <FournisseurAuth>.');
  return c;
}
