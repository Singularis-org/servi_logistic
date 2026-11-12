import { describe, expect, it } from "vitest";

import { claveDeConteoEntregas, conteoEntregasFiltroSchema, prepararConteoEntregas } from "@/lib/analytics/entregas-conteo";
import { ORDEN_FILTER_FIELDS, ordenFilterSchema } from "@/lib/types/orden";
import {
  listarIdsVigentesBodegaSchema,
  listarOrdenesBodegaCompletoSchema,
  listarOrdenesBodegaPaginadoSchema,
} from "@/lib/types/recepcion-satelite";

// SLT-47 (T2.2; R10; design §3.2) — las entradas del servidor aceptan `lugar_id` (lista no vacia de
// ids) y rechazan las tres claves viejas. La clave de cache de analitica no depende del orden de los
// ids, y si de cuales son.

const VIEJAS = ["provincia_id", "canton_id", "distrito_id"] as const;

const ENTRADAS = [
  { nombre: "listado de /ordenes (filter)", schema: ordenFilterSchema, base: {} },
  { nombre: "satelite: pagina", schema: listarOrdenesBodegaPaginadoSchema, base: { page: 1, pageSize: 25 } },
  { nombre: "satelite: conjunto", schema: listarOrdenesBodegaCompletoSchema, base: {} },
  { nombre: "satelite: vigencia", schema: listarIdsVigentesBodegaSchema, base: { ids: ["00000000-0000-4000-8000-000000000001"] } },
  { nombre: "analitica", schema: conteoEntregasFiltroSchema, base: {} },
] as const;

describe("SLT-47 — R10: `lugar_id` en las entradas del servidor", () => {
  it.each(ENTRADAS)("$nombre: acepta `lugar_id` con uno o varios ids", ({ schema, base }) => {
    expect(schema.safeParse({ ...base, lugar_id: ["n1"] }).success).toBe(true);
    expect(schema.safeParse({ ...base, lugar_id: ["n1", "n2"] }).success).toBe(true);
  });

  it.each(ENTRADAS)("$nombre: la base sin lugar sigue siendo valida", ({ schema, base }) => {
    expect(schema.safeParse(base).success).toBe(true);
  });

  it.each(ENTRADAS)("$nombre: `lugar_id` vacio o con un id vacio es rechazo", ({ schema, base }) => {
    expect(schema.safeParse({ ...base, lugar_id: [] }).success).toBe(false);
    expect(schema.safeParse({ ...base, lugar_id: [""] }).success).toBe(false);
    expect(schema.safeParse({ ...base, lugar_id: "n1" }).success).toBe(false);
  });

  for (const vieja of VIEJAS) {
    it.each(ENTRADAS)(`$nombre: \`${vieja}\` es rechazo`, ({ schema, base }) => {
      expect(schema.safeParse({ ...base, [vieja]: ["n1"] }).success).toBe(false);
    });
  }

  it("la lista de claves de `/ordenes` lleva `lugar_id` y ninguna vieja", () => {
    expect(ORDEN_FILTER_FIELDS).toContain("lugar_id");
    for (const vieja of VIEJAS) expect(ORDEN_FILTER_FIELDS as readonly string[]).not.toContain(vieja);
  });

  it("analitica: una clave vieja da `validation_error` al preparar", () => {
    const r = prepararConteoEntregas({ canton_id: ["c1"] }, { usuarioId: "u1", rol: "maestro" } as never);
    expect(r.status).toBe("validation_error");
  });
});

describe("SLT-47 — R10: la clave de cache de analitica", () => {
  const actor = { usuarioId: "u1", rol: "maestro" } as never;
  const clave = (raw: unknown) => {
    const r = prepararConteoEntregas(raw, actor);
    if (r.status !== "ok") throw new Error(`preparar fallo: ${r.status}`);
    return claveDeConteoEntregas(r.consulta);
  };

  it("los mismos ids en otro orden dan la misma clave", () => {
    expect(clave({ lugar_id: ["b", "a"] })).toBe(clave({ lugar_id: ["a", "b"] }));
  });

  it("ids distintos dan claves distintas, y distintas de «sin lugar»", () => {
    const sin = clave({});
    const a = clave({ lugar_id: ["a"] });
    const b = clave({ lugar_id: ["b"] });
    const ab = clave({ lugar_id: ["a", "b"] });
    expect(new Set([sin, a, b, ab]).size).toBe(4);
  });

  it("un lugar no colapsa con la misma lista en otra dimension", () => {
    expect(clave({ lugar_id: ["x1"] })).not.toBe(clave({ zona_id: ["x1"] }));
  });
});
