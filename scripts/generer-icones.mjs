// Génère les icônes de l'application (PWA) et un logo provisoire, sans dépendance : node scripts/generer-icones.mjs
// Pour utiliser VOTRE logo, remplacez simplement public/logo.png (PNG ou JPG carré ou large) et les icônes public/icone-*.png.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SORTIE = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const VERT_FOND = [20, 83, 45]; // #14532d
const BLANC = [255, 255, 255];

// Table CRC32 pour l'encodage PNG.
const TABLE_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (octets) => {
  let c = 0xffffffff;
  for (const o of octets) c = TABLE_CRC[(c ^ o) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function bloc(type, donnees) {
  const tete = Buffer.alloc(8);
  tete.writeUInt32BE(donnees.length, 0);
  tete.write(type, 4, 'ascii');
  const fin = Buffer.alloc(4);
  fin.writeUInt32BE(crc32(Buffer.concat([tete.subarray(4), donnees])), 0);
  return Buffer.concat([tete, donnees, fin]);
}

function encoderPng(taille, rgba) {
  const entete = Buffer.alloc(13);
  entete.writeUInt32BE(taille, 0);
  entete.writeUInt32BE(taille, 4);
  entete[8] = 8; // 8 bits par canal
  entete[9] = 6; // RGBA
  const lignes = Buffer.alloc((taille * 4 + 1) * taille);
  for (let y = 0; y < taille; y++) {
    lignes[y * (taille * 4 + 1)] = 0; // filtre « aucun »
    rgba.copy(lignes, y * (taille * 4 + 1) + 1, y * taille * 4, (y + 1) * taille * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloc('IHDR', entete),
    bloc('IDAT', deflateSync(lignes, { level: 9 })),
    bloc('IEND', Buffer.alloc(0)),
  ]);
}

// Dessin : fond vert plein + feuille blanche (intersection de deux disques) avec nervure et tige.
const L = 0.73; // demi-longueur de la feuille
const C = 0.421; // décalage des centres des deux disques
const R = Math.hypot(L, C); // rayon des disques
const COS = Math.SQRT1_2;

/** Couleur du point (x, y) ∈ [-1, 1]², origine au centre, y vers le bas. */
function couleurEn(x, y) {
  const u = COS * x - COS * y; // le long de la feuille (vers le haut à droite)
  const v = COS * x + COS * y; // en travers
  const dansFeuille = u * u + (v - C) ** 2 <= R * R && u * u + (v + C) ** 2 <= R * R;
  if (dansFeuille) return Math.abs(v) < 0.014 && Math.abs(u) < L * 0.86 ? VERT_FOND : BLANC;
  const surTige = u < -L && u > -L - 0.17 && Math.abs(v) < 0.022;
  return surTige ? BLANC : VERT_FOND;
}

function icone(taille, sur = 3) {
  const rgba = Buffer.alloc(taille * taille * 4);
  for (let py = 0; py < taille; py++) {
    for (let px = 0; px < taille; px++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < sur; sy++) {
        for (let sx = 0; sx < sur; sx++) {
          const [cr, cg, cb] = couleurEn(((px + (sx + 0.5) / sur) / taille) * 2 - 1, ((py + (sy + 0.5) / sur) / taille) * 2 - 1);
          r += cr; g += cg; b += cb;
        }
      }
      const n = sur * sur;
      rgba.set([Math.round(r / n), Math.round(g / n), Math.round(b / n), 255], (py * taille + px) * 4);
    }
  }
  return encoderPng(taille, rgba);
}

mkdirSync(SORTIE, { recursive: true });
for (const [nom, taille] of [['icone-512.png', 512], ['icone-192.png', 192], ['icone-180.png', 180], ['logo.png', 512]]) {
  writeFileSync(join(SORTIE, nom), icone(taille));
  console.log(`✔ public/${nom} (${taille}×${taille})`);
}
