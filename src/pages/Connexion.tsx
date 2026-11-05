import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { Alerte, Bouton, Champ, Chargement } from '../components/ui';
import { entreprise } from '../config/entreprise';
import type { Role } from '../domain/types';
import { useAuth } from '../hooks/useAuth';
import { useEnLigne } from '../hooks/useEnLigne';

/** Connexion : lien magique par e-mail (Supabase) ou, sans serveur configuré, connexion de démonstration locale. */
export default function Connexion() {
  const { utilisateur, chargement, mode, envoyerLienMagique, connexionLocale } = useAuth();
  const enLigne = useEnLigne();
  const [email, setEmail] = useState('');
  const [nom, setNom] = useState('');
  const [role, setRole] = useState<Role>('terrain');
  const [envoye, setEnvoye] = useState(false);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  if (chargement) return <Chargement />;
  if (utilisateur) return <Navigate to="/" replace />;

  const soumettre = async (e: FormEvent) => {
    e.preventDefault();
    setErreur(null);
    setEnvoiEnCours(true);
    try {
      if (mode === 'local') await connexionLocale(nom.trim(), role);
      else {
        await envoyerLienMagique(email.trim());
        setEnvoye(true);
      }
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Connexion impossible. Réessayez.");
    } finally {
      setEnvoiEnCours(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-4">
      <header className="text-center">
        <p className="text-5xl" aria-hidden>
          🌿
        </p>
        <h1 className="mt-2 text-3xl font-extrabold text-vert-900">Diagnostic RSE</h1>
        <p className="text-lg text-slate-700">Espaces extérieurs · {entreprise.nom}</p>
      </header>

      {mode === 'local' && (
        <Alerte type="attention">
          <strong>Mode local (démonstration).</strong> Aucun serveur n'est configuré : les données restent sur cet appareil et ne sont pas synchronisées.
        </Alerte>
      )}

      {envoye ? (
        <Alerte type="succes">
          Un lien de connexion vient d'être envoyé à <strong>{email}</strong>. Ouvrez votre messagerie sur cet appareil et touchez le lien.
        </Alerte>
      ) : (
        <form onSubmit={soumettre} className="carte space-y-4">
          {mode === 'local' ? (
            <>
              <Champ etiquette="Votre prénom et nom">
                <input className="champ" required autoComplete="name" value={nom} onChange={(e) => setNom(e.target.value)} />
              </Champ>
              <fieldset>
                <legend className="etiquette">Votre profil</legend>
                <div className="grid grid-cols-2 gap-2">
                  {(['terrain', 'bureau'] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      aria-pressed={role === r}
                      onClick={() => setRole(r)}
                      className={role === r ? 'bouton-primaire' : 'bouton-neutre'}
                    >
                      {r === 'terrain' ? 'Terrain' : 'Bureau'}
                    </button>
                  ))}
                </div>
              </fieldset>
            </>
          ) : (
            <>
              <Champ etiquette="Adresse e-mail professionnelle" aide="Vous recevrez un lien de connexion, sans mot de passe.">
                <input className="champ" type="email" required inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Champ>
              {!enLigne && <Alerte type="attention">Pas de réseau : la première connexion nécessite internet. Ensuite, l'application fonctionne hors ligne.</Alerte>}
            </>
          )}
          {erreur && <Alerte type="erreur">{erreur}</Alerte>}
          <Bouton type="submit" className="w-full" disabled={envoiEnCours || (mode === 'local' ? !nom.trim() : !email.trim() || !enLigne)}>
            {mode === 'local' ? 'Entrer' : envoiEnCours ? 'Envoi…' : 'Recevoir le lien de connexion'}
          </Bouton>
        </form>
      )}
    </div>
  );
}
