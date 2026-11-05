export interface PositionGps {
  lat: number;
  lng: number;
  precisionM: number;
}

/** Position GPS courante (null si refusée, indisponible ou trop lente : la photo est alors simplement non géolocalisée). */
export function positionActuelle(delaiMs = 5000): Promise<PositionGps | null> {
  return new Promise((resoudre) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resoudre(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resoudre({ lat: p.coords.latitude, lng: p.coords.longitude, precisionM: Math.round(p.coords.accuracy) }),
      () => resoudre(null),
      { enableHighAccuracy: true, timeout: delaiMs, maximumAge: 30_000 },
    );
  });
}
