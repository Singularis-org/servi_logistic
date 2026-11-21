import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest } from "./_postgres-real";

// SLT-121 · T1.2 (design §2.5, §8.3; R16) — GUARDIA DE LA BASE: toda tabla con la política `<tabla>_por_empresa`
// tiene su trigger `<tabla>_bloqueo_por_mora`, y `organizacion` también.
//
// Por qué: el bloqueo de una empresa congelada vive en ese trigger (falla cerrado). Una tabla de negocio nueva que
// nace sin él deja escribir a una empresa congelada y ningún test de servicio lo nota. La migración de SLT-121 lo
// instaló en las tablas que había; las que lleguen después lo suman en su propia migración:
//
//   CREATE TRIGGER "<tabla>_bloqueo_por_mora" BEFORE INSERT OR UPDATE OR DELETE ON "<tabla>"
//     FOR EACH STATEMENT EXECUTE FUNCTION bloqueo_por_mora();
//
// Mira la base migrada, no el SQL de las migraciones: lo que cuenta es lo que hay. Igual que
// `aislamiento-fk-misma-empresa`. Solo el esquema `public`: otros tests crean esquemas con copias de tablas.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

/** BEFORE (2) + INSERT (4) + DELETE (8) + UPDATE (16), sin ROW (1): por sentencia. */
const TGTYPE_BEFORE_IUD_POR_SENTENCIA = 30;

let base: PrismaClient;

describeSiHayBase("SLT-121 — cobertura del trigger bloqueo_por_mora (R16)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("cada tabla con la política <tabla>_por_empresa, y organizacion, tiene su trigger bloqueo_por_mora", async () => {
    const tablas = await base.$queryRawUnsafe<{ tabla: string }[]>(
      `SELECT DISTINCT c.relname::text AS tabla
         FROM pg_policy p
         JOIN pg_class c ON c.oid = p.polrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND p.polname = c.relname || '_por_empresa'
       UNION SELECT 'organizacion'
       ORDER BY 1`,
    );
    const triggers = await base.$queryRawUnsafe<{ tabla: string; nombre: string; tipo: number; activo: string }[]>(
      `SELECT c.relname::text AS tabla, t.tgname::text AS nombre, t.tgtype::int AS tipo, t.tgenabled::text AS activo
         FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_proc p ON p.oid = t.tgfoid
         JOIN pg_namespace pn ON pn.oid = p.pronamespace
        WHERE n.nspname = 'public' AND pn.nspname = 'public' AND p.proname = 'bloqueo_por_mora' AND NOT t.tgisinternal
        ORDER BY 1`,
    );

    // Control de no vacuidad: las tablas de negocio son decenas, y entre ellas las que más se escriben.
    expect(tablas.length).toBeGreaterThan(50);
    expect(tablas.map((t) => t.tabla)).toEqual(expect.arrayContaining(["orden", "zona", "tarifa_valor", "jobs", "organizacion"]));

    const porTabla = new Map(triggers.map((t) => [t.tabla, t]));
    const sinTrigger = tablas.map((t) => t.tabla).filter((t) => !porTabla.has(t));
    expect(sinTrigger, "tablas de negocio sin `<tabla>_bloqueo_por_mora` (ver la cabecera de este test)").toEqual([]);

    const malInstalados = triggers.filter(
      (t) => t.nombre !== `${t.tabla}_bloqueo_por_mora` || t.tipo !== TGTYPE_BEFORE_IUD_POR_SENTENCIA || t.activo !== "O",
    );
    expect(malInstalados, "el trigger va BEFORE INSERT OR UPDATE OR DELETE, FOR EACH STATEMENT y activo").toEqual([]);

    // Y no sobra en tablas que no son de negocio (catálogos, tablas de plataforma).
    const sobran = triggers.map((t) => t.tabla).filter((t) => !tablas.some((x) => x.tabla === t));
    expect(sobran).toEqual([]);
  });
});
