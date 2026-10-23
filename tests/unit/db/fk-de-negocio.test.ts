import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  fkDeNegocio,
  nombreTrigger,
  nombreTriggerSinCambio,
  triggersVivos,
} from "@/lib/db/fk-de-negocio";

// SL-17 T2.7 (R39): el parser de `db/schema.prisma` que comparten el generador de M3 y la guardia.
// Esquema inventado: si el parser se equivoca aqui, la guardia buscaria triggers que no son.

const ESQUEMA = `
model Padre {
  id        String  @id @map("padre_pk") // comentario con @relation(fields: [x], references: [y])
  hijos     Hijo[]  @relation("HijoPadre")
  otros     Hijo[]  @relation("HijoOtroPadre")
  @@map("padres")
}

model Hijo {
  id          String  @id
  padreId     String  @map("padre_id")
  padre       Padre   @relation("HijoPadre", fields: [padreId], references: [id], onDelete: Cascade)
  otroPadreId String? @map("otro_padre_id")
  otroPadre   Padre?  @relation("HijoOtroPadre", fields: [otroPadreId], references: [id])
  catalogoId  String  @map("catalogo_id")
  catalogo    Catalogo @relation(fields: [catalogoId], references: [id])
  url         String  @default("http://no-es-comentario")
  @@map("hijos")
}

model Catalogo {
  id    String @id
  hijos Hijo[]
}
`;

const NEGOCIO = ["Padre", "Hijo"];

describe("fkDeNegocio (parser del esquema)", () => {
  it("resuelve @map de columnas y @@map de tablas, en origen y en destino", () => {
    const fks = fkDeNegocio(ESQUEMA, NEGOCIO);
    expect(fks).toContainEqual({
      tabla: "hijos",
      columna: "padre_id",
      tablaRef: "padres",
      columnaRef: "padre_pk",
      modelo: "Hijo",
      campo: "padre",
    });
  });

  it("incluye la relacion opcional y las dos relaciones al mismo modelo", () => {
    const fks = fkDeNegocio(ESQUEMA, NEGOCIO);
    expect(fks.map((f) => `${f.modelo}.${f.campo}`)).toEqual(["Hijo.otroPadre", "Hijo.padre"]);
    expect(fks.find((f) => f.campo === "otroPadre")?.columna).toBe("otro_padre_id");
  });

  it("ignora el lado inverso sin fields, la FK a un modelo que no es de negocio y los comentarios", () => {
    const fks = fkDeNegocio(ESQUEMA, NEGOCIO);
    expect(fks.some((f) => f.modelo === "Padre")).toBe(false);
    expect(fks.some((f) => f.tablaRef === "Catalogo")).toBe(false);
  });

  it("lanza con una FK compuesta entre modelos de negocio, nombrando modelo y campo", () => {
    const compuesta = ESQUEMA.replace(
      'padre       Padre   @relation("HijoPadre", fields: [padreId], references: [id], onDelete: Cascade)',
      'padre       Padre   @relation("HijoPadre", fields: [padreId, url], references: [id, id])',
    );
    expect(compuesta).not.toBe(ESQUEMA);
    expect(() => fkDeNegocio(compuesta, NEGOCIO)).toThrow(/compuesta.*Hijo\.padre/);
  });

  it("no lanza si la compuesta va a un modelo de plataforma (no la cubre M3)", () => {
    const compuesta = ESQUEMA.replace(
      "catalogo    Catalogo @relation(fields: [catalogoId], references: [id])",
      "catalogo    Catalogo @relation(fields: [catalogoId, url], references: [id, id])",
    );
    expect(compuesta).not.toBe(ESQUEMA);
    expect(fkDeNegocio(compuesta, NEGOCIO)).toHaveLength(2);
  });
});

describe("nombres deterministas de trigger", () => {
  it("sme_ + 40 primeros de <tabla>_<col> + _ + 8 del md5 de <tabla>.<col>", () => {
    const md5 = createHash("md5").update("gestion_fecha_reprogramacion_cambio.actor_usuario_id").digest("hex");
    expect(nombreTrigger("gestion_fecha_reprogramacion_cambio", "actor_usuario_id")).toBe(
      `sme_gestion_fecha_reprogramacion_cambio_acto_${md5.slice(0, 8)}`,
    );
    expect(nombreTrigger("orden", "tienda_id")).toBe(
      `sme_orden_tienda_id_${createHash("md5").update("orden.tienda_id").digest("hex").slice(0, 8)}`,
    );
  });

  it("<tabla>_sin_cambio_de_empresa, recortado a 63 de forma determinista si no cabe", () => {
    expect(nombreTriggerSinCambio("orden")).toBe("orden_sin_cambio_de_empresa");
    const larga = "t".repeat(50);
    const nombre = nombreTriggerSinCambio(larga);
    expect(nombre).toHaveLength(63);
    expect(nombre).toBe(nombreTriggerSinCambio(larga));
    expect(nombre).not.toBe(nombreTriggerSinCambio(`${"t".repeat(49)}u`));
  });
});

describe("triggersVivos (lectura de las migraciones)", () => {
  const crear = `CREATE TRIGGER "sme_x" BEFORE INSERT OR UPDATE OF "a_id", "organizacion_id"
  ON "x" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('a', 'a_id', 'id');`;

  it("lee nombre, tabla, funcion, argumentos y columnas del UPDATE OF", () => {
    expect(triggersVivos([crear]).get("x.sme_x")).toEqual({
      nombre: "sme_x",
      tabla: "x",
      funcion: "verificar_misma_empresa",
      argumentos: ["a", "a_id", "id"],
      columnasUpdate: ["a_id", "organizacion_id"],
    });
  });

  it("un DROP TRIGGER o un DROP FUNCTION posterior lo quita; uno comentado no cuenta", () => {
    expect(triggersVivos([crear, 'DROP TRIGGER IF EXISTS "sme_x" ON "x";']).size).toBe(0);
    expect(triggersVivos([crear, "DROP FUNCTION verificar_misma_empresa() CASCADE;"]).size).toBe(0);
    expect(triggersVivos([crear.replace(/^/gm, "-- ")]).size).toBe(0);
    // Un DROP de otra tabla con el mismo nombre no lo toca.
    expect(triggersVivos([crear, 'DROP TRIGGER "sme_x" ON "y";']).size).toBe(1);
  });
});
