const EARTH_RADIUS_KM = 6371;

/** Great-circle distance in km */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lng2 - lng1);
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/** Initial bearing from point A to B, degrees 0–360 clockwise from true north */
export function bearingDeg(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lng2 - lng1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return ((toDeg(θ) % 360) + 360) % 360;
}

/** Smallest absolute difference between two headings in [-180, 180] */
export function angularDiffDeg(a: number, b: number): number {
  let d = ((a - b) % 360) + 360;
  d %= 360;
  if (d > 180) d -= 360;
  return d;
}

/** True if `bearing` lies in sector centered at `centerDeg` with half-width `halfWidthDeg` */
export function bearingInSector(
  bearing: number,
  centerDeg: number,
  halfWidthDeg: number,
): boolean {
  return Math.abs(angularDiffDeg(bearing, centerDeg)) <= halfWidthDeg;
}
