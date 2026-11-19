import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { quitarComentarios } from "@/tests/fixtures/sin-comentarios";

// =================================================================================================
// GUARDIA — SLT-54 (R1, T1.5, design §3) — QUIEN LEE `tarifa_valor`
// =================================================================================================
//
// Desde SLT-54 una empresa puede tener valores guardados y seguir calculando con el modelo viejo: el
// maestro digita y nada cambia hasta activar (R1). Por eso `tarifa_valor` NO es «lo que rige»: un
// lector nuevo que cobre o pague con esa tabla directamente, sin pasar por `usaModeloNuevo`, cobraria
// valores de borrador, y ningun test lo veria si su empresa de prueba esta activada.
//
// Esta guardia deja escrita la lista de lectores. Para entrar, hay que decir aqui para que lee.
// Mira los delegados de Prisma, las relaciones y el SQL a mano, en codigo sin comentarios.

const RAIZ = path.resolve(__dirname, "../../..");
const CARPETAS = ["app", "lib", "scripts"];

const LECTORES: Readonly<Record<string, string>> = {
  // El unico que decide con que se cobra y se paga: lee tras mirar el interruptor.
  "lib/repositories/_shared/resolver-tarifas.ts": "resuelve el importe, despues de `usaModeloNuevo`",
  // Lista y reemplaza lo digitado; no decide ningun importe.
  "lib/repositories/TarifaValorRepository.ts": "escritura y listado de lo digitado",
  // SLT-54 T2.3: lo digitado, para pintarlo y para los faltantes; no decide ningun importe.
  "lib/repositories/TarifasPantallaRepository.ts": "lecturas de la pantalla de Tarifas",
  // SLT-54 T2.6 (R30): la columna «tarifa general» del Excel, despues de `usaModeloNuevo`; no decide un importe.
  "lib/repositories/CoberturaRepository.ts": "marca de tarifa general del Excel de cobertura",
  // Mira si una cuenta tiene precios propios antes de eliminarla; no decide ningun importe.
  "lib/repositories/ApiKeyRepository.ts": "decide si una cuenta es eliminable",
  // SLT-101 (R64, R95, R97): solo los NOMBRES de zona, grupo y vehiculo del valor del que salio un
  // importe YA congelado (`cierre_detail_concepto`, `gestion_pago_congelado`), para «Tarifa: …» y
  // «Por tarifa · …» de la fila. Ni `valor` ni `modo`: el importe sale de lo congelado.
  "lib/repositories/CierresAdminRepository.ts": "nombres del origen de lo congelado en el detalle del cierre",
};

const PATRONES: readonly RegExp[] = [
  /\.\s*tarifaValor\s*\.\s*(?:findFirst|findFirstOrThrow|findUnique|findUniqueOrThrow|findMany|count|aggregate|groupBy)\b/,
  /\btarifaValor(?:es)?\s*:\s*(?:true\b|\{)/,
  /\b(?:FROM|JOIN)\s+(?:"?public"?\s*\.\s*)?"?tarifa_valor"?(?![\w])/i,
];

function leeTarifaValor(codigo: string): boolean {
  const sinComentarios = quitarComentarios(codigo);
  return PATRONES.some((p) => p.test(sinComentarios));
}

function archivosDe(dir: string): string[] {
  const salida: string[] = [];
  for (const nombre of readdirSync(dir)) {
    if (nombre === "node_modules" || nombre.startsWith(".")) continue;
    const ruta = path.join(dir, nombre);
    if (statSync(ruta).isDirectory()) salida.push(...archivosDe(ruta));
    else if (/\.(ts|tsx|mjs)$/.test(nombre) && !/\.(test|spec)\.tsx?$/.test(nombre)) salida.push(ruta);
  }
  return salida;
}

function lectoresReales(): string[] {
  return CARPETAS.flatMap((c) => archivosDe(path.join(RAIZ, c)))
    .filter((ruta) => leeTarifaValor(readFileSync(ruta, "utf8")))
    .map((ruta) => path.relative(RAIZ, ruta).replace(/\\/g, "/"))
    .sort();
}

describe("SLT-54 R1 — guardia de lectores de `tarifa_valor`", () => {
  it("solo leen la tabla los archivos de la lista, y todos los de la lista siguen leyendola", () => {
    // Igualdad en los dos sentidos: un lector nuevo la pone roja, y una entrada que ya no lee tambien,
    // para que la lista no quede abierta a que alguien vuelva por ese hueco.
    expect(lectoresReales()).toEqual(Object.keys(LECTORES).sort());
  });

  describe("contraprueba del detector", () => {
    it.each([
      ["delegado", "const f = await db.tarifaValor.findMany({ where: {} });"],
      ["delegado con salto de linea", "await tx\n  .tarifaValor\n  .findFirst({});"],
      ["conteo", "await prisma.tarifaValor.count();"],
      ["relacion en un select", "select: { tarifaValores: { select: { valor: true } } }"],
      ["relacion en un include", "include: { tarifaValor: true }"],
      ["SQL", `SELECT 1 FROM "tarifa_valor" tv`],
      ["SQL con esquema", `select 1 from public.tarifa_valor`],
      ["SQL en un JOIN", `... JOIN "tarifa_valor" tv ON tv.id = x`],
    ])("detecta: %s", (_nombre, codigo) => {
      expect(leeTarifaValor(codigo)).toBe(true);
    });

    it.each([
      ["columna congelada", "select: { tarifaValorFlete: true, tarifaValorId: true }"],
      ["otra tabla", `SELECT 1 FROM "tarifa_valor_otra"`],
      ["clave de la fabrica de servicios", "tarifaValor: new TarifaValorService(repo),"],
      ["llamada a un servicio", "await servicios.tarifaValor.listarValores(filtro, actor);"],
      ["solo en un comentario", "// db.tarifaValor.findMany() no se usa aqui"],
    ])("no confunde: %s", (_nombre, codigo) => {
      expect(leeTarifaValor(codigo)).toBe(false);
    });
  });
});
