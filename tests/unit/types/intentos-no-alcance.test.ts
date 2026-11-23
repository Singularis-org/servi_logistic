import { describe, it, expect } from "vitest";
import { listarOrdenesSchema, ordenFilterSchema } from "@/lib/types/orden";
import { openApiSpec } from "@/lib/api/openapi-spec";
import { COLUMNAS_MANIFIESTO } from "@/lib/utils/manifiesto-xlsx";

// Feature 160 (T23) — el NO ALCANCE, asertado y no solo declarado. Los limites de R29/R30/R31
// son decisiones (QA4/QA5), no descuidos: si alguien los cruza sin querer, esto rompe.
//
// Nota de alcance: este archivo cubre lo verificable desde el BACKEND (bordes, contratos y
// especificacion publica). La comprobacion de que la vista del paquete y la etiqueta imprimible
// no PINTAN el conteo es de la fase de frontend.

describe("R29 — el conteo no es ordenable ni filtrable en el servidor", () => {
  // El `ORDER BY` del listado usa lista blanca de columnas REALES de `orden`; el conteo es
  // derivado en tiempo de lectura. El borde ya lo rechaza sin codigo nuevo.
  it("`sortBy` con el campo de intentos -> rechazo del borde (lista blanca)", () => {
    for (const candidato of ["intentos", "intentosEntrega", "intentos_entrega"]) {
      const r = listarOrdenesSchema.safeParse({ sortBy: candidato });
      expect(r.success).toBe(false);
    }
    // Contraste: los campos admitidos siguen pasando (sin regresion de R31 de la 6).
    expect(listarOrdenesSchema.safeParse({ sortBy: "created_at" }).success).toBe(true);
    expect(listarOrdenesSchema.safeParse({ sortBy: "num_guia" }).success).toBe(true);
  });

  it("`filter` con el campo de intentos -> rechazo por `.strict()` de la whitelist", () => {
    for (const clave of ["intentos", "intentosEntrega", "intentos_entrega"]) {
      const r = ordenFilterSchema.safeParse({ [clave]: 2 });
      expect(r.success).toBe(false);
    }
    // Contraste: la unica clave admitida hoy sigue admitida.
    expect(ordenFilterSchema.safeParse({ status_id: "os-devuelta" }).success).toBe(true);
  });
});

// R31 ENMENDADO — SLT-203 «API: publicar los intentos de entrega en la respuesta de la carga».
// El 2026-11-18 Carlos decidio PUBLICAR `manifiesto.filas[].intentos` de `POST
// /api/ordenes/api-key/carga` (la ruta ya lo devolvia). La enmienda es SOLO para ese campo: el
// schema `ManifiestoFila` es el unico sitio del contrato que puede nombrarlo. El resto de DTO del
// canal (`ApiOrden*`, listado, detalle, webhook...) sigue sin el conteo, como pedia QA5.

/** Rutas JSON (`a.b.c`) del spec donde aparece la subcadena, en claves o en valores de texto. */
function rutasQueMencionan(nodo: unknown, aguja: string, ruta = ""): string[] {
  const out: string[] = [];
  if (typeof nodo === "string") {
    if (nodo.toLowerCase().includes(aguja)) out.push(ruta);
  } else if (Array.isArray(nodo)) {
    nodo.forEach((v, i) => out.push(...rutasQueMencionan(v, aguja, `${ruta}[${i}]`)));
  } else if (nodo && typeof nodo === "object") {
    for (const [k, v] of Object.entries(nodo)) {
      const sub = ruta ? `${ruta}.${k}` : k;
      if (k.toLowerCase().includes(aguja)) out.push(sub);
      out.push(...rutasQueMencionan(v, aguja, sub));
    }
  }
  return out;
}

/** Lo unico permitido: el schema `ManifiestoFila` y el ejemplo de la fila del manifiesto de la carga. */
const PERMITIDO = [
  /^components\.schemas\.ManifiestoFila\./,
  /^paths\.\/api\/ordenes\/api-key\/carga\.post\.responses\.200\.content\.application\/json\.examples\.\w+\.value\.manifiesto\.filas\[\d+\]\.intentos$/,
];
const fueraDeLaEnmienda = (spec: unknown): string[] =>
  rutasQueMencionan(spec, "intentos").filter((r) => !PERMITIDO.some((p) => p.test(r)));

describe("R31 (enmendado por SLT-203) — el contrato solo nombra los intentos en `ManifiestoFila`", () => {
  it("la especificacion OpenAPI no menciona los intentos fuera de `ManifiestoFila`", () => {
    expect(fueraDeLaEnmienda(openApiSpec)).toEqual([]);
    expect(JSON.stringify(openApiSpec).toLowerCase()).not.toContain("intentosentrega");
  });

  it("control: `ManifiestoFila` SI lo publica (si no, el filtro de arriba no prueba nada)", () => {
    const menciones = rutasQueMencionan(openApiSpec, "intentos");
    expect(menciones).toContain("components.schemas.ManifiestoFila.properties.intentos");
    expect(menciones.length).toBeGreaterThan(0);
  });

  // `ApiOrdenListItemDTO`/`ApiOrdenDetalleDTO` se publican como `OrdenListItem`/`OrdenDetalle`;
  // la mutacion recorre TODOS los schemas salvo `ManifiestoFila`, esos dos incluidos.
  it("MUTACION: el campo en cualquier otro schema del canal pone esto rojo", () => {
    const mutado = structuredClone(openApiSpec) as unknown as {
      components: { schemas: Record<string, { properties?: Record<string, unknown> }> };
    };
    const otros = Object.keys(mutado.components.schemas).filter((n) => n !== "ManifiestoFila");
    expect(otros, "SLT-203: control, los schemas de `ApiOrden*` estan").toEqual(
      expect.arrayContaining(["OrdenListItem", "OrdenDetalle", "CargaOrden"]),
    );
    for (const nombre of otros) {
      const copia = structuredClone(mutado);
      copia.components.schemas[nombre].properties = {
        ...copia.components.schemas[nombre].properties,
        intentos: { type: "integer" },
      };
      expect(fueraDeLaEnmienda(copia), `SLT-203: ${nombre}`).toContain(
        `components.schemas.${nombre}.properties.intentos`,
      );
    }
    // Y en un sitio cualquiera fuera de los schemas (prosa de una operacion).
    const prosa = structuredClone(mutado) as unknown as { info: { description: string } };
    prosa.info.description += " intentos";
    expect(fueraDeLaEnmienda(prosa)).toContain("info.description");
  });
});

describe("R16 — el campo es ADITIVO: los DTO excluidos no lo tienen", () => {
  // Guarda de tipos: si alguien agregara `intentosEntrega` a los DTO excluidos, estas
  // aserciones de tipo dejarian de compilar (el `never` deja de serlo).
  // SLT-203: tambien `intentos` (el nombre que SI se publica en `ManifiestoFila`) queda vetado
  // en estos DTO; la enmienda de 160/R31 no los alcanza.
  it("compila: `ApiOrdenListItemDTO`, `ApiOrdenDetalleDTO`, `EtiquetaGuiaDTO` y `OrdenDTO` no lo declaran", async () => {
    type SinCampo<T> = "intentosEntrega" extends keyof T ? never : "intentos" extends keyof T ? never : true;
    const api = await import("@/lib/types/api-orden");
    const etiqueta = await import("@/lib/types/etiqueta-guia");
    const orden = await import("@/lib/types/orden");
    // Los `import` mantienen viva la referencia a los modulos; los chequeos son de tipo.
    expect(api).toBeDefined();
    expect(etiqueta).toBeDefined();
    expect(orden).toBeDefined();

    const okApiList: SinCampo<import("@/lib/types/api-orden").ApiOrdenListItemDTO> = true;
    const okApiDetalle: SinCampo<import("@/lib/types/api-orden").ApiOrdenDetalleDTO> = true;
    const okEtiqueta: SinCampo<import("@/lib/types/etiqueta-guia").EtiquetaGuiaDTO> = true;
    const okOrden: SinCampo<import("@/lib/types/orden").OrdenDTO> = true;
    expect([okApiList, okApiDetalle, okEtiqueta, okOrden]).toEqual([true, true, true, true]);
  });

  // El contrapunto: donde SI va, va. Si el campo desapareciera de los DTO internos, el dato
  // dejaria de llegar a las superficies sin que nada mas rompiera.
  it("compila: los DTO internos SI lo declaran (opcional)", async () => {
    type ConCampo<T> = "intentosEntrega" extends keyof T ? true : never;
    const okListado: ConCampo<import("@/lib/types/orden").OrdenListItemDTO> = true;
    const okAsignacion: ConCampo<
      import("@/lib/interfaces/services/IMisAsignacionesService").MiAsignacionDTO
    > = true;
    const okRecepcion: ConCampo<
      import("@/lib/interfaces/services/IRecepcionSateliteService").RecepcionSateliteDTO
    > = true;
    const okNovedad: ConCampo<import("@/lib/types/novedad").NovedadDTO> = true;
    const okRechazo: ConCampo<import("@/lib/types/rechazo-sla-tienda").RechazoSlaTiendaDTO> = true;
    const okLiberada: ConCampo<
      import("@/lib/interfaces/repositories/ILiberacionReprogramadaRepository").LiberadaHoyRow
    > = true;
    expect([okListado, okAsignacion, okRecepcion, okNovedad, okRechazo, okLiberada]).toEqual(
      [true, true, true, true, true, true],
    );
  });

  // El manifiesto es el UNICO que lo lleva NO opcional (design 160 §3.6): su DTO enumera sus
  // propiedades una a una para que el archivo no omita campos en silencio.
  it("el manifiesto declara `intentos` (no opcional) y lo emite como columna", () => {
    type NoOpcional<T> = undefined extends T ? never : true;
    const ok: NoOpcional<import("@/lib/types/manifiesto").ManifiestoFilaDTO["intentos"]> = true;
    expect(ok).toBe(true);
    expect(COLUMNAS_MANIFIESTO.map((c) => c.key)).toContain("intentos");
  });
});
