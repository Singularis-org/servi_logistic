// SL-20 (T2.4; decisión 10 del humano, 2026-10-27; R40) — Genera UNA vez el catálogo de países.
//
//   node scripts/generar-paises-iso-3166-1.mjs
//
// Escribe `lib/constants/paises-iso-3166-1.ts` con el código ISO 3166-1 alfa-2 y el nombre en
// español de cada país. El nombre sale de `Intl.DisplayNames(['es'], { type: 'region' })`, es decir,
// del Unicode CLDR que trae el ICU de Node. El archivo generado se commitea y queda FIJO: la app no
// llama a `Intl` en runtime, porque el ICU cambia entre versiones de Node (SL-37) y un nombre que se
// mueve rompería la comparación normalizada del alta de país (R23).
//
// Volver a correr el script solo tiene sentido si cambia el estándar (un código nuevo o retirado):
// el diff del archivo generado se revisa a mano, nombre por nombre.
//
// Sin dependencias: solo `node:` y el `Intl` del propio Node.

import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Los 249 códigos alfa-2 asignados oficialmente por ISO 3166-1 (sin los reservados ni los de
// usuario `AA`, `QM`–`QZ`, `XA`–`XZ`, `ZZ`). Uno por país, por orden alfabético.
const CODIGOS = `
AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ
BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ
CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ
DE DJ DK DM DO DZ
EC EE EG EH ER ES ET
FI FJ FK FM FO FR
GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY
HK HM HN HR HT HU
ID IE IL IM IN IO IQ IR IS IT
JE JM JO JP
KE KG KH KI KM KN KP KR KW KY KZ
LA LB LC LI LK LR LS LT LU LV LY
MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ
NA NC NE NF NG NI NL NO NP NR NU NZ
OM
PA PE PF PG PH PK PL PM PN PR PS PT PW PY
QA
RE RO RS RU RW
SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ
TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ
UA UG UM US UY UZ
VA VC VE VG VI VN VU
WF WS
YE YT
ZA ZM ZW
`
  .trim()
  .split(/\s+/);

const TOTAL_ISO_3166_1 = 249;

if (CODIGOS.length !== TOTAL_ISO_3166_1) {
  throw new Error(`se esperaban ${TOTAL_ISO_3166_1} códigos y hay ${CODIGOS.length}`);
}
if (new Set(CODIGOS).size !== CODIGOS.length) throw new Error("hay códigos repetidos");

const nombres = new Intl.DisplayNames(["es"], { type: "region", fallback: "code" });

const filas = CODIGOS.map((id) => {
  const nombre = nombres.of(id);
  // Con `fallback: "code"`, un código que el ICU no conoce vuelve igual: se para en vez de inventar.
  if (!nombre || nombre === id) throw new Error(`el ICU de Node no da nombre en español para ${id}`);
  return { id, nombre };
});

const cuerpo = filas.map((f) => `  { id: ${JSON.stringify(f.id)}, nombre: ${JSON.stringify(f.nombre)} },`).join("\n");

const salida = `// ARCHIVO GENERADO — no se edita a mano. Lo escribe \`node scripts/generar-paises-iso-3166-1.mjs\`.
//
// SL-20 (design §2.1; R40; decisión 10 del humano, 2026-10-27) — catálogo de países ISO 3166-1.
// Fuente: los ${TOTAL_ISO_3166_1} códigos alfa-2 oficialmente asignados por ISO 3166-1, con el nombre
// en español de \`Intl.DisplayNames(['es'], { type: 'region' })\` (Unicode CLDR ${process.versions.cldr},
// ICU ${process.versions.icu}, Node ${process.version}). Generado una vez y fijo: la app no calcula
// nada con \`Intl\` en runtime (el ICU cambia entre versiones de Node, SL-37).
//
// Módulo PURO, sin dependencias: lo importan el servicio del alta de país (R23, R41) y el
// autocompletado de la pantalla (R42). La tabla \`pais\` guarda solo los países dados de alta (R43).

export interface PaisDelCatalogo {
  /** ISO 3166-1 alfa-2: el \`id\` de la tabla \`pais\`. */
  id: string;
  /** Nombre en español: el \`nombre\` que el alta copia a la tabla \`pais\` (R23). */
  nombre: string;
}

/** Los ${TOTAL_ISO_3166_1} países ISO 3166-1, por código. */
export const PAISES_ISO_3166_1: readonly PaisDelCatalogo[] = [
${cuerpo}
];

const POR_CODIGO: ReadonlyMap<string, PaisDelCatalogo> = new Map(PAISES_ISO_3166_1.map((p) => [p.id, p]));

/** El país del catálogo con ese código alfa-2, o \`null\` si no está (R41). */
export function paisDelCatalogo(id: string): PaisDelCatalogo | null {
  return POR_CODIGO.get(id) ?? null;
}
`;

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destino = path.join(raiz, "lib", "constants", "paises-iso-3166-1.ts");
writeFileSync(destino, salida, "utf8");
console.log(`escrito ${path.relative(raiz, destino)}: ${filas.length} países`);
