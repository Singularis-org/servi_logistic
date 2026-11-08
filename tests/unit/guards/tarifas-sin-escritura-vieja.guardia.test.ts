import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { quitarComentarios } from "@/tests/fixtures/sin-comentarios";

// =================================================================================================
// GUARDIA — SLT-54 (R26, R28, R29, T2.5, design §8) — NINGUNA PANTALLA ESCRIBE EL MODELO VIEJO
// =================================================================================================
//
// Mientras el maestro digita, `tarifas`, `tarifa_zona_mensajero` y `distrito_zona_especial` siguen
// decidiendo los importes: editarlas por pantalla moveria dinero antes de activar, y tras activar seria
// editar algo que ya no rige. Por eso ninguna action, ni nada que corra en `app/`, puede alcanzar sus
// escrituras. `TarifaService`, `TarifaRepository` y `DistritoZonaEspecialService` se quedan solo para los
// sembrados (tests y demo), hasta que SLT-57 los retire.
//
// Lo unico que sigue pudiendo tocarlas desde una action es `ZonaService`: lo cierra la guarda de R27 en
// `lib/actions/zonas.ts`, que prueba `tests/integration/actions/zonas-action.test.ts`.

const RAIZ = path.resolve(__dirname, "../../..");

/** Todo lo que un usuario puede disparar. Quedan fuera `tests/`, `e2e/` y `scripts/`: esos siembran. */
const CARPETAS = ["app", "lib/actions"];

const ACCIONES_RETIRADAS = [
  "crearTarifa",
  "actualizarTarifa",
  "borrarTarifa",
  "listarTarifas",
  "actualizarDistritosEspeciales",
];

const VIAS_DE_ESCRITURA = [
  "TarifaService",
  "TarifaRepository",
  "DistritoZonaEspecialService",
  "DistritoZonaEspecialRepository",
];

const DELEGADOS = ["tarifa", "tarifaZonaMensajero", "distritoZonaEspecial"];
const TABLAS = ["tarifas", "tarifa_zona_mensajero", "distrito_zona_especial"];

const ESCRITURA_POR_DELEGADO = new RegExp(
  `\\.\\s*(?:${DELEGADOS.join("|")})\\s*\\.\\s*(?:create|createMany|createManyAndReturn|update|updateMany|updateManyAndReturn|upsert|delete|deleteMany)\\b`,
);
const ESCRITURA_POR_SQL = new RegExp(
  `\\b(?:INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+(?:"?public"?\\s*\\.\\s*)?"?(?:${TABLAS.join("|")})"?(?![\\w])`,
  "i",
);
const IMPORTA_VIA = new RegExp(`from\\s+["'][^"']*/(?:${VIAS_DE_ESCRITURA.join("|")})["']`);
const EXPORTA_RETIRADA = new RegExp(`export\\s+(?:async\\s+)?function\\s+(?:${ACCIONES_RETIRADAS.join("|")})\\b`);

/** Lo que hace que este codigo pueda escribir el modelo viejo. Vacio = limpio. */
function escrituras(codigo: string): string[] {
  const c = quitarComentarios(codigo);
  return [
    ...(ESCRITURA_POR_DELEGADO.test(c) ? ["delegado"] : []),
    ...(ESCRITURA_POR_SQL.test(c) ? ["sql"] : []),
    ...(IMPORTA_VIA.test(c) ? ["importa una via de escritura"] : []),
  ];
}

/** Una Server Action retirada que vuelve. Solo cuenta en un modulo `"use server"`. */
function resucita(codigo: string): boolean {
  const c = quitarComentarios(codigo);
  return /^\s*["']use server["']/.test(c) && EXPORTA_RETIRADA.test(c);
}

function archivosDe(dir: string): string[] {
  const salida: string[] = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = path.join(dir, nombre);
    if (statSync(ruta).isDirectory()) salida.push(...archivosDe(ruta));
    else if (/\.(ts|tsx)$/.test(nombre)) salida.push(ruta);
  }
  return salida;
}

const ARCHIVOS = CARPETAS.flatMap((c) => archivosDe(path.join(RAIZ, c)));
const relativa = (ruta: string) => path.relative(RAIZ, ruta).replace(/\\/g, "/");

describe("SLT-54 R26, R28, R29 — ninguna pantalla escribe el modelo viejo", () => {
  it("el barrido ve el arbol real: sin esto, cero hallazgos no querria decir nada", () => {
    expect(ARCHIVOS.length).toBeGreaterThan(300);
    expect(ARCHIVOS.map(relativa)).toContain("lib/actions/tarifas.ts");
    expect(ARCHIVOS.map(relativa)).toContain("lib/actions/zonas.ts");
  });

  it("ninguna action ni nada de `app/` importa una via de escritura ni escribe esas tablas", () => {
    const hallazgos = ARCHIVOS.map((r) => [relativa(r), escrituras(readFileSync(r, "utf8"))] as const).filter(
      ([, motivos]) => motivos.length > 0,
    );
    expect(hallazgos).toEqual([]);
  });

  it("ninguna Server Action retirada ha vuelto", () => {
    expect(ARCHIVOS.filter((r) => resucita(readFileSync(r, "utf8"))).map(relativa)).toEqual([]);
  });

  describe("contraprueba del detector", () => {
    it.each([
      ["delegado de tarifas", "await db.tarifa.create({ data });", "delegado"],
      ["delegado con salto de linea", "await tx\n  .tarifaZonaMensajero\n  .deleteMany({});", "delegado"],
      ["marca de zona especial", "await tx.distritoZonaEspecial.createMany({ data });", "delegado"],
      ["upsert", "await prisma.tarifa.upsert({});", "delegado"],
      ["SQL de insercion", `INSERT INTO "tarifas" ("id") VALUES ($1)`, "sql"],
      ["SQL de borrado", "delete from public.distrito_zona_especial", "sql"],
      ["SQL de actualizacion", `UPDATE tarifa_zona_mensajero SET x = 1`, "sql"],
      ["servicio importado", `import { TarifaService } from "@/lib/services/TarifaService";`, "importa una via de escritura"],
      ["repositorio importado", `import { TarifaRepository } from "@/lib/repositories/TarifaRepository";`, "importa una via de escritura"],
      ["marca importada", `import { DistritoZonaEspecialService } from "@/lib/services/DistritoZonaEspecialService";`, "importa una via de escritura"],
    ])("detecta: %s", (_nombre, codigo, motivo) => {
      expect(escrituras(codigo)).toEqual([motivo]);
    });

    it.each([
      ["lectura del delegado", "await db.tarifa.findMany({});"],
      ["el modelo nuevo", "await db.tarifaValor.create({ data });"],
      ["otra tabla", `INSERT INTO "tarifa_valor" ("id") VALUES ($1)`],
      ["SELECT", `SELECT 1 FROM "tarifas"`],
      ["el servicio nuevo", `import { TarifaValorService } from "@/lib/services/TarifaValorService";`],
      ["un tipo", `import type { TarifaDTO } from "@/lib/types/tarifa";`],
      ["solo en un comentario", "// await db.tarifa.create({ data });"],
    ])("no confunde: %s", (_nombre, codigo) => {
      expect(escrituras(codigo)).toEqual([]);
    });

    it("una action retirada en un modulo de servidor salta, una funcion suelta no", () => {
      expect(resucita(`"use server";\nexport async function crearTarifa() {}`)).toBe(true);
      expect(resucita(`// nota\n"use server";\nexport function listarTarifas() {}`)).toBe(true);
      expect(resucita(`export async function crearTarifa() {}`)).toBe(false);
      expect(resucita(`"use server";\nexport async function crearZona() {}`)).toBe(false);
    });
  });
});
