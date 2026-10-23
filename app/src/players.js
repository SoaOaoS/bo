// Banque de joueurs initiale : les 30 nommés au Ballon d'Or 2026 (liste dévoilée
// par France Football le 8 septembre 2026, cérémonie le 26 octobre 2026 à Londres).
// Les clubs sont ceux au moment des nominations. La liste reste modifiable depuis
// l'interface d'administration (ajout, édition, désactivation).
//
// country : code ISO 3166-1 alpha-2 (ou gb-eng) utilisé pour afficher le drapeau.
// position : GK, DEF, MIL, ATT.

export const NOMINEES_2026 = [
  { name: 'Jude Bellingham', club: 'Real Madrid', country: 'gb-eng', nationality: 'Angleterre', position: 'MIL' },
  { name: 'Pau Cubarsí', club: 'FC Barcelone', country: 'es', nationality: 'Espagne', position: 'DEF' },
  { name: 'Marc Cucurella', club: 'Chelsea', country: 'es', nationality: 'Espagne', position: 'DEF' },
  { name: 'Ousmane Dembélé', club: 'Paris Saint-Germain', country: 'fr', nationality: 'France', position: 'ATT' },
  { name: 'Luis Díaz', club: 'Bayern Munich', country: 'co', nationality: 'Colombie', position: 'ATT' },
  { name: 'Bruno Fernandes', club: 'Manchester United', country: 'pt', nationality: 'Portugal', position: 'MIL' },
  { name: 'Gabriel Magalhães', club: 'Arsenal', country: 'br', nationality: 'Brésil', position: 'DEF' },
  { name: 'Erling Haaland', club: 'Manchester City', country: 'no', nationality: 'Norvège', position: 'ATT' },
  { name: 'Achraf Hakimi', club: 'Paris Saint-Germain', country: 'ma', nationality: 'Maroc', position: 'DEF' },
  { name: 'Harry Kane', club: 'Bayern Munich', country: 'gb-eng', nationality: 'Angleterre', position: 'ATT' },
  { name: 'Khvicha Kvaratskhelia', club: 'Paris Saint-Germain', country: 'ge', nationality: 'Géorgie', position: 'ATT' },
  { name: 'Lamine Yamal', club: 'FC Barcelone', country: 'es', nationality: 'Espagne', position: 'ATT' },
  { name: 'Sadio Mané', club: 'Al-Nassr', country: 'sn', nationality: 'Sénégal', position: 'ATT' },
  { name: 'Marquinhos', club: 'Paris Saint-Germain', country: 'br', nationality: 'Brésil', position: 'DEF' },
  { name: 'Lautaro Martínez', club: 'Inter Milan', country: 'ar', nationality: 'Argentine', position: 'ATT' },
  { name: 'Kylian Mbappé', club: 'Real Madrid', country: 'fr', nationality: 'France', position: 'ATT' },
  { name: 'Nuno Mendes', club: 'Paris Saint-Germain', country: 'pt', nationality: 'Portugal', position: 'DEF' },
  { name: 'Lionel Messi', club: 'Inter Miami', country: 'ar', nationality: 'Argentine', position: 'ATT' },
  { name: 'João Neves', club: 'Paris Saint-Germain', country: 'pt', nationality: 'Portugal', position: 'MIL' },
  { name: 'Michael Olise', club: 'Bayern Munich', country: 'fr', nationality: 'France', position: 'ATT' },
  { name: 'Willian Pacho', club: 'Paris Saint-Germain', country: 'ec', nationality: 'Équateur', position: 'DEF' },
  { name: 'Julián Quiñones', club: 'Al-Qadsiah', country: 'mx', nationality: 'Mexique', position: 'ATT' },
  { name: 'Declan Rice', club: 'Arsenal', country: 'gb-eng', nationality: 'Angleterre', position: 'MIL' },
  { name: 'Rodri', club: 'Manchester City', country: 'es', nationality: 'Espagne', position: 'MIL' },
  { name: 'Fabián Ruiz', club: 'Paris Saint-Germain', country: 'es', nationality: 'Espagne', position: 'MIL' },
  { name: 'William Saliba', club: 'Arsenal', country: 'fr', nationality: 'France', position: 'DEF' },
  { name: 'Ferran Torres', club: 'FC Barcelone', country: 'es', nationality: 'Espagne', position: 'ATT' },
  { name: 'Dayot Upamecano', club: 'Bayern Munich', country: 'fr', nationality: 'France', position: 'DEF' },
  { name: 'Vinícius Júnior', club: 'Real Madrid', country: 'br', nationality: 'Brésil', position: 'ATT' },
  { name: 'Vitinha', club: 'Paris Saint-Germain', country: 'pt', nationality: 'Portugal', position: 'MIL' },
];

// Barème officiel du Ballon d'Or : 1er = 15 pts, 2e = 12, ... 10e = 1.
export const POINTS = [15, 12, 10, 8, 7, 5, 4, 3, 2, 1];
export const TOP_SIZE = POINTS.length;
