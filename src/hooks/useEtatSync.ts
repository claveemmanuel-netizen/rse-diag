import { useSyncExternalStore } from 'react';
import { lireEtatSync, surEtatSync, type EtatSync } from '../repository/sync';

export const useEtatSync = (): EtatSync => useSyncExternalStore(surEtatSync, lireEtatSync, lireEtatSync);
