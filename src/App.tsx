import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Chargement } from './components/ui';
import { useAuth } from './hooks/useAuth';
import Accueil from './pages/Accueil';
import Cloture from './pages/Cloture';
import Connexion from './pages/Connexion';
import Preparation, { NouvelleVisite } from './pages/Preparation';
import Questionnaire from './pages/Questionnaire';
import Rgpd from './pages/Rgpd';
import VisiteHub from './pages/VisiteHub';
import { VisiteLayout } from './pages/VisiteLayout';
import Zones from './pages/Zones';

// Pages lourdes (graphiques, tableau de bord) chargées à la demande ; elles restent disponibles hors ligne via le précache PWA.
const Synthese = lazy(() => import('./pages/Synthese'));
const Bureau = lazy(() => import('./pages/Bureau'));

/** Accès réservé aux utilisateurs connectés (authentification obligatoire). */
function Protege({ children }: { children: ReactNode }) {
  const { utilisateur, chargement } = useAuth();
  if (chargement) return <Chargement message="Ouverture de la session…" />;
  if (!utilisateur) return <Navigate to="/connexion" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Chargement />}>
        <Routes>
          <Route path="/connexion" element={<Connexion />} />
          <Route
            path="/"
            element={
              <Protege>
                <Accueil />
              </Protege>
            }
          />
          <Route
            path="/bureau"
            element={
              <Protege>
                <Bureau />
              </Protege>
            }
          />
          <Route
            path="/visites/nouvelle"
            element={
              <Protege>
                <NouvelleVisite />
              </Protege>
            }
          />
          <Route
            path="/visites/:id"
            element={
              <Protege>
                <VisiteLayout />
              </Protege>
            }
          >
            <Route index element={<VisiteHub />} />
            <Route path="preparation" element={<Preparation />} />
            <Route path="rgpd" element={<Rgpd />} />
            <Route path="section/:sectionId" element={<Questionnaire />} />
            <Route path="zones" element={<Zones />} />
            <Route path="synthese" element={<Synthese />} />
            <Route path="cloture" element={<Cloture />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
