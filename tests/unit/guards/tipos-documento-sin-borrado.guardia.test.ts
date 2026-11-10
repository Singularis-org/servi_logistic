// GUARDIA — SLT-81 (design §11; R13, R16): UN TIPO DE DOCUMENTO NO SE BORRA, SE DESACTIVA.
//
// Los usuarios conservan el tipo que tenían aunque se desactive (R16), así que borrarlo rompería su
// documento. Nada en `lib/` ni en `app/` llama a `tipoIdentificacion.delete`/`deleteMany` ni escribe
// un `DELETE FROM "tipo_identificacion"`. Los comentarios no cuentan.
//
// La selecciona `pnpm exec vitest run guard` por el nombre del archivo.
import { readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { codigoSinComentarios } from "../../fixtures/sin-comentarios";

const RAIZ = path.resolve(__dirname, "../../..");
const ARBOLES = ["lib", "app"] as const;

const BORRADO_PRISMA = /\btipoIdentificacion\s*\.\s*(delete|deleteMany)\s*\(/;
const BORRADO_SQL = /\bDELETE\s+FROM\s+"?tipo_identificacion"?/i;

function fuentes(dir: string, acc: string[] = []): string[] {
  for (const entrada of readdirSync(path.join(RAIZ, dir), { withFileTypes: true })) {
    const relativo = path.posix.join(dir, entrada.name);
    if (entrada.isDirectory()) fuentes(relativo, acc);
    else if (/\.tsx?$/.test(entrada.name) && !/\.d\.ts$/.test(entrada.name)) acc.push(relativo);
  }
  return acc;
}

export function borraTipos(codigo: string): boolean {
  return BORRADO_PRISMA.test(codigo) || BORRADO_SQL.test(codigo);
}

describe("SLT-81 R13 — ningún tipo de documento se borra", () => {
  it("nada en lib/ ni app/ borra filas de tipo_identificacion", () => {
    const archivos = ARBOLES.flatMap((a) => fuentes(a));
    expect(archivos.length).toBeGreaterThan(0);
    expect(archivos.filter((a) => borraTipos(codigoSinComentarios(a)))).toEqual([]);
  });

  it("CONTRAPRUEBA — un `delete` de Prisma o un DELETE de SQL ponen la guardia roja", () => {
    expect(borraTipos("await tx.tipoIdentificacion.delete({ where: { id } });")).toBe(true);
    expect(borraTipos("prisma.tipoIdentificacion.deleteMany({})")).toBe(true);
    expect(borraTipos('await tx.$executeRaw`DELETE FROM "tipo_identificacion" WHERE id = ${id}`;')).toBe(true);
    expect(borraTipos("prisma.tipoIdentificacion.update({ data: { activo: false } })")).toBe(false);
  });
});
