import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";

import { TarifaRepository } from "@/lib/repositories/TarifaRepository";
import { ZonaRepository } from "@/lib/repositories/ZonaRepository";
import { esViolacionDeClaveForanea } from "@/lib/repositories/_shared/prisma-fk";
import { TarifaService } from "@/lib/services/TarifaService";
import { ZonaService } from "@/lib/services/ZonaService";
import type { Actor } from "@/lib/interfaces/services/IZonaService";

import {
  HAY_BASE_DE_DATOS,
  clienteConSavepoint,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type FksDeOrden,
  type TxDeTest,
} from "./_postgres-real";
import { crearFksDeOrden, crearUsuarioDePrueba } from "./_fixtures/orden-minima";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// BORRAR UNA TARIFA / UNA ZONA EN USO: LA FK TIENE QUE LLEGAR COMO «esta en uso», NO COMO UN 500.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// POR QUE ESTE ARCHIVO EXISTE, Y POR QUE VIVE EN `integration/db` Y NO EN `unit`.
//
// `TarifaRepository.hardDelete` y `ZonaRepository.hardDelete` traducen «Postgres no me deja por
// una FK» a `"referenced"`, que el service convierte en `conflict` y la pantalla en «esta en
// uso». Hasta el 2026-09-04 esa traduccion la decidia `e.code === "P2003"` — y sus UNICOS tests
// FABRICABAN a mano un `PrismaClientKnownRequestError` con ese codigo. Probaban una forma del
// error QUE NO OCURRE.
//
// MEDIDO el 2026-09-04 contra Postgres (no leido, no razonado): borrando una zona con una orden
// apuntando, y una tarifa con un `cierre_detail` apuntando, el error llega asi en los DOS casos:
//
//   ctor: DriverAdapterError · name: "DriverAdapterError" · code: undefined · meta: null
//   cause.code: "23001"  ·  isKnownRequestError: FALSE
//   message: 'update or delete on table "zona" violates RESTRICT setting of foreign key
//             constraint "orden_zona_id_fkey" on table "orden"'
//   message: 'update or delete on table "tarifas" violates RESTRICT setting of foreign key
//             constraint "cierre_detail_tarifa_id_fkey" on table "cierre_detail"'
//
// Es decir: la comprobacion vieja NO devolvia `"referenced"` nunca, el error crudo escapaba hasta
// `withErrorHandler` y el maestro veia un error interno donde debia leer «no se puede, esta en
// uso». Es la misma cicatriz que ya documentan `_shared/prisma-unique.ts` (P2002) y
// `_shared/prisma-fk.ts` (P2003, ficha 373); el arreglo es USAR ese detector.
//
// Y por eso el test es de integracion: un test con dobles no ve el SQL, asi que puede darle al
// repositorio la forma de error que le apetezca y quedarse verde. Solo Postgres dice cual es la
// forma REAL. Los tests unitarios hermanos siguen existiendo (son rapidos y cubren el `throw` de
// lo desconocido), pero la EVIDENCIA de que el borrado bloqueado se ve como conflicto vive aqui.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const SUFIJO = `fkreal-${Date.now().toString(36)}`;

/** Nueve columnas obligatorias de `tarifas`, todas irrelevantes para lo que se mide. */
function datosDeTarifa(zonaId: string) {
  return {
    valorFlete: new Prisma.Decimal("1.00"),
    valorFleteDevuelto: new Prisma.Decimal("1.00"),
    valorFleteGam: new Prisma.Decimal("1.00"),
    valorFleteDevueltoGam: new Prisma.Decimal("1.00"),
    comisionCod: new Prisma.Decimal("1.00"),
    ivaFlete: new Prisma.Decimal("1.00"),
    ivaComisionCod: new Prisma.Decimal("1.00"),
    zonaId,
  };
}

describeSiHayBase("borrar tarifa/zona EN USO: la FK real, no la fabricada", () => {
  let prisma: PrismaClient;
  // SLT-180 (R1042): tienda, zona y maestro se SIEMBRAN en la tx de cada caso (`sembrar`); ya no
  // se leen «la primera orden» ni «el primer maestro» de la base.
  let FKS: FksDeOrden | null = null;
  let MAESTRO: Actor;

  beforeAll(async () => {
    prisma = crearPrismaDeTest();
  });

  /**
   * SLT-180 (R1044): siembra propia del caso + control positivo que nombra la fila. Sin
   * `if (!FKS) return;`: si la siembra no llega, el caso REVIENTA aqui y se ve.
   */
  async function sembrar(tx: TxDeTest): Promise<void> {
    FKS = await crearFksDeOrden(tx);
    const maestro = await crearUsuarioDePrueba(tx, "maestro");
    MAESTRO = { usuarioId: maestro.id, rol: "maestro" };
    expect(
      await tx.usuario.count({ where: { id: { in: [FKS.tiendaId, maestro.id] } } }),
      "SLT-180: la tienda y el maestro sembrados no estan en la base",
    ).toBe(2);
    expect(
      await tx.zona.count({ where: { id: FKS.zonaId } }),
      "SLT-180: la zona sembrada no esta en la base",
    ).toBe(1);
  }

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  /** Zona nueva, con nombre irrepetible. */
  async function sembrarZona(tx: TxDeTest, marca: string): Promise<string> {
    const z = await tx.zona.create({
      data: { sinpeNumero: "80000000", sinpeNombre: "Titular de Prueba", nombre: `${SUFIJO}-${marca}-${randomUUID().slice(0, 8)}` },
      select: { id: true },
    });
    return z.id;
  }

  /** Orden real apuntando a `zonaId`: es la FK `orden_zona_id_fkey` (RESTRICT). */
  async function sembrarOrdenEnZona(tx: TxDeTest, zonaId: string): Promise<string> {
    const o = await tx.orden.create({
      data: {
        numRemision: `R-${SUFIJO}-${randomUUID().slice(0, 8)}`,
        destinatario: "Dest",
        telefonoDest: "88880000",
        producto: "Prod",
        estatusId: FKS!.estatusId,
        tiendaId: FKS!.tiendaId,
        zonaId,
        provinciaId: FKS!.provinciaId,
        cantonId: FKS!.cantonId,
      },
      select: { id: true },
    });
    return o.id;
  }

  /**
   * `cierre_detail` apuntando a `tarifaId`: es la FK `cierre_detail_tarifa_id_fkey` (RESTRICT),
   * la tarifa CONGELADA en un cierre. Todo lo demas (cierre, orden, mensajero) cuelga de filas
   * sembradas en la tx del caso (SLT-180), y todo revierte con la transaccion del test.
   */
  async function congelarTarifaEnCierre(tx: TxDeTest, tarifaId: string): Promise<void> {
    const ordenId = await sembrarOrdenEnZona(tx, FKS!.zonaId);
    const mensajero = await crearUsuarioDePrueba(tx, "mensajero");
    const cierre = await tx.cierreDia.create({
      data: {
        mensajeroId: mensajero.id,
        destinoTipo: "bodega_central",
        destinoZonaId: FKS!.zonaId,
      },
      select: { id: true },
    });
    await tx.cierreDetail.create({
      data: {
        cierreId: cierre.id,
        ordenId,
        zonaId: FKS!.zonaId,
        tiendaId: FKS!.tiendaId,
        tarifaId,
        cobraComision: true,
        esCentral: false,
        numRemision: `R-${SUFIJO}`,
        destinatario: "Dest",
        producto: "Prod",
        tiendaNombre: "T",
        zonaNombre: "Z",
        provinciaNombre: "P",
        cantonNombre: "C",
      },
      select: { id: true },
    });
  }

  // ───────────────────────────────────────────────────────────────────────────────────────────
  // ZONA
  // ───────────────────────────────────────────────────────────────────────────────────────────

  it("⭑ ZONA con una orden: `referenced`, la zona SIGUE y no hay registro de un borrado que no ocurrio", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      await sembrar(tx);
      const zonaId = await sembrarZona(tx, "usada");
      await sembrarOrdenEnZona(tx, zonaId);

      const repo = new ZonaRepository(clienteConSavepoint(tx));
      // Sin `rejects`: lo que se mide es que NO lanza. Si el detector vuelve a ser el ingenuo,
      // aqui sale un `DriverAdapterError` crudo y el test cae con el error de verdad a la vista.
      const salida = await repo.hardDelete(zonaId, MAESTRO.usuarioId);

      return {
        salida,
        zonaSigue: await tx.zona.count({ where: { id: zonaId } }),
        registro: await tx.historialAccion.count({
          where: { entidadId: zonaId, accion: "zona_borrada" },
        }),
      };
    });

    expect(r.salida).toBe("referenced");
    expect(r.zonaSigue, "la zona se borro pese a tener una orden").toBe(1);
    expect(r.registro, "quedo un `zona_borrada` de un borrado que Postgres impidio").toBe(0);
  }, 60_000);

  it("⭑ ZONA: el service lo traduce a `conflict` (lo que la pantalla lee como «esta en uso»)", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      await sembrar(tx);
      const zonaId = await sembrarZona(tx, "svc");
      await sembrarOrdenEnZona(tx, zonaId);

      const servicio = new ZonaService(new ZonaRepository(clienteConSavepoint(tx)));
      return {
        salida: await servicio.borrar(zonaId, MAESTRO),
        zonaSigue: await tx.zona.count({ where: { id: zonaId } }),
      };
    });

    // ⭑ FICHA 376 (R11): el `conflict` ahora lleva MOTIVO, y por esta via es `en_uso`. Es la
    // contraparte del caso de la zona central (`zona-central-guarda-y-rastro.test.ts`): los dos
    // rechazos existen, y NO son la misma palabra.
    expect(r.salida).toEqual({ status: "conflict", motivo: "en_uso" });
    expect(r.zonaSigue).toBe(1);
  }, 60_000);

  it("ZONA LIBRE: sigue borrandose (`ok`) — el arreglo no convirtio todo en `referenced`", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      await sembrar(tx);
      const zonaId = await sembrarZona(tx, "libre");

      const repo = new ZonaRepository(clienteConSavepoint(tx));
      return {
        salida: await repo.hardDelete(zonaId, MAESTRO.usuarioId),
        zonaSigue: await tx.zona.count({ where: { id: zonaId } }),
        registro: await tx.historialAccion.count({
          where: { entidadId: zonaId, accion: "zona_borrada" },
        }),
      };
    });

    expect(r.salida).toBe("ok");
    expect(r.zonaSigue).toBe(0);
    expect(r.registro).toBe(1);
  }, 60_000);

  it("ZONA inexistente -> `not_found` (y NO `referenced`)", async () => {
    const salida = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      await sembrar(tx);
      const repo = new ZonaRepository(clienteConSavepoint(tx));
      return repo.hardDelete(randomUUID(), MAESTRO.usuarioId);
    });
    expect(salida).toBe("not_found");
  }, 60_000);

  // ───────────────────────────────────────────────────────────────────────────────────────────
  // TARIFA
  // ───────────────────────────────────────────────────────────────────────────────────────────

  it("⭑ TARIFA congelada en un cierre: `referenced`, la tarifa SIGUE y no hay registro", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      await sembrar(tx);
      const zonaId = await sembrarZona(tx, "tar");
      const tarifa = await tx.tarifa.create({
        data: datosDeTarifa(zonaId),
        select: { id: true },
      });
      await congelarTarifaEnCierre(tx, tarifa.id);

      const repo = new TarifaRepository(clienteConSavepoint(tx));
      const salida = await repo.hardDelete(tarifa.id, MAESTRO.usuarioId);

      return {
        salida,
        tarifaSigue: await tx.tarifa.count({ where: { id: tarifa.id } }),
        registro: await tx.historialAccion.count({
          where: { entidadId: tarifa.id, accion: "tarifa_borrada" },
        }),
      };
    });

    expect(r.salida).toBe("referenced");
    expect(r.tarifaSigue, "la tarifa se borro pese a estar congelada en un cierre").toBe(1);
    expect(r.registro, "quedo un `tarifa_borrada` de un borrado que Postgres impidio").toBe(0);
  }, 60_000);

  it("⭑ TARIFA: el service lo traduce a `conflict`", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      await sembrar(tx);
      const zonaId = await sembrarZona(tx, "tarsvc");
      const tarifa = await tx.tarifa.create({
        data: datosDeTarifa(zonaId),
        select: { id: true },
      });
      await congelarTarifaEnCierre(tx, tarifa.id);

      const servicio = new TarifaService(new TarifaRepository(clienteConSavepoint(tx)));
      return {
        salida: await servicio.borrar(tarifa.id, MAESTRO),
        tarifaSigue: await tx.tarifa.count({ where: { id: tarifa.id } }),
      };
    });

    expect(r.salida).toEqual({ status: "conflict" });
    expect(r.tarifaSigue).toBe(1);
  }, 60_000);

  it("TARIFA LIBRE: sigue borrandose (`ok`) — el arreglo no convirtio todo en `referenced`", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      await sembrar(tx);
      const zonaId = await sembrarZona(tx, "tarlibre");
      const tarifa = await tx.tarifa.create({
        data: datosDeTarifa(zonaId),
        select: { id: true },
      });

      const repo = new TarifaRepository(clienteConSavepoint(tx));
      return {
        salida: await repo.hardDelete(tarifa.id, MAESTRO.usuarioId),
        tarifaSigue: await tx.tarifa.count({ where: { id: tarifa.id } }),
        registro: await tx.historialAccion.count({
          where: { entidadId: tarifa.id, accion: "tarifa_borrada" },
        }),
      };
    });

    expect(r.salida).toBe("ok");
    expect(r.tarifaSigue).toBe(0);
    expect(r.registro).toBe(1);
  }, 60_000);

  // El `P2025` es el OTRO brazo del mismo `catch`, y NO se toco porque la medicion dice que ese
  // SI conserva su codigo bajo el adapter (`ctor: PrismaClientKnownRequestError · code: P2025`):
  // lo produce Prisma al no encontrar la fila, no Postgres. Este caso ancla esa distincion: si
  // alguien "unificara" los dos brazos, aqui saldria `referenced` y el borrado de una tarifa ya
  // desaparecida diria «esta en uso».
  it("TARIFA inexistente -> `not_found` (el P2025 SI sobrevive al adapter)", async () => {
    const salida = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      await sembrar(tx);
      const repo = new TarifaRepository(clienteConSavepoint(tx));
      return repo.hardDelete(randomUUID(), MAESTRO.usuarioId);
    });
    expect(salida).toBe("not_found");
  }, 60_000);

  // ───────────────────────────────────────────────────────────────────────────────────────────
  // LA CICATRIZ, MEDIDA: por que la comprobacion ingenua no vale
  // ───────────────────────────────────────────────────────────────────────────────────────────

  // ⏳ 2026-11-18 (SLT-186): LA FORMA DEL ERROR DEPENDE DE LA VERSION DE POSTGRES. En CI (Postgres 17,
  // run 44235155028) este caso salia rojo con «la comprobacion ingenua ahora SI caza el error»; en
  // local (18.2) pasaba. Causa, medida en la desechable de SLT-186 y leida en el adapter:
  //   - Postgres 18 reporta la violacion de una FK `ON DELETE RESTRICT` (`orden_zona_id_fkey`,
  //     `confdeltype = 'r'`) con SQLSTATE `23001` y el texto «violates RESTRICT setting of foreign
  //     key constraint»; la misma FK con NO ACTION da `23503` (medido en 18.2 con dos tablas temp).
  //   - Hasta Postgres 17 (hipotesis coherente con el rojo de CI, no medida aqui: no hay un 17 local)
  //     la RESTRICT se reportaba como cualquier FK, `23503`.
  //   - `@prisma/adapter-pg` 7.8.0 solo traduce `23503` a `ForeignKeyConstraintViolation` (=> `P2003`,
  //     `PrismaClientKnownRequestError`); `23001` sale como `DriverAdapterError` sin `code`.
  // Asi que la cicatriz (el `P2003` a secas no basta) es real en 18 y no se ve en 17. Lo que NO
  // depende de la version, y es lo que de verdad protege al maestro, es que el detector del codigo
  // (`esViolacionDeClaveForanea`) caza las DOS formas: eso se afirma siempre.
  it("⭑ el error REAL de la FK depende de Postgres: en 18 no es un `P2003` y la ingenua NO lo caza; el detector SI, siempre", async () => {
    const crudo = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const [{ version }] = await tx.$queryRawUnsafe<{ version: number }[]>(
        `SELECT current_setting('server_version_num')::int AS version`,
      );
      await sembrar(tx);
      const zonaId = await sembrarZona(tx, "crudo");
      await sembrarOrdenEnZona(tx, zonaId);

      // El `delete` PELADO, sin pasar por el repositorio: esto es lo que Postgres devuelve.
      const cliente = clienteConSavepoint(tx);
      try {
        await cliente.$transaction(async (t) => {
          await t.zona.delete({ where: { id: zonaId } });
        });
        return null;
      } catch (e) {
        const err = e as { name?: string; code?: unknown; cause?: { code?: unknown } };
        return {
          version,
          detectado: esViolacionDeClaveForanea(e),
          ctor: (e as object).constructor.name,
          name: err.name,
          code: err.code,
          sqlstate: err.cause?.code,
          esConocido: e instanceof Prisma.PrismaClientKnownRequestError,
          // ⭑ LA COMPROBACION QUE HABIA EN EL CODIGO HASTA EL 2026-09-04.
          cazadoPorLaIngenua:
            e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003",
        };
      }
    });

    expect(crudo, "el DELETE no fallo: la FK RESTRICT no esta puesta").not.toBeNull();
    // LO QUE VALE EN CUALQUIER VERSION: el detector del codigo reconoce el error como FK.
    expect(crudo!.detectado, "esViolacionDeClaveForanea no reconoce el error REAL").toBe(true);
    if (crudo!.version >= 180000) {
      // Postgres 18+: la cicatriz. Si algun dia Prisma vuelve a traducirlo, ESTE brazo se pone rojo.
      // Es deliberado: seria la señal de que la cicatriz cerro y de que este comentario hay que
      // reescribirlo, no un fallo.
      expect(crudo!.cazadoPorLaIngenua, "la comprobacion ingenua ahora SI caza el error").toBe(false);
      expect(crudo!.esConocido).toBe(false);
      expect(crudo!.ctor).toBe("DriverAdapterError");
      expect(crudo!.code).toBeUndefined();
      // `23001` = restrict_violation. Es el SQLSTATE que `esViolacionDeClaveForanea` reconoce.
      expect(crudo!.sqlstate).toBe("23001");
    } else {
      // Postgres <= 17 (el de CI): la RESTRICT llega como `23503` y el adapter la traduce a `P2003`.
      // Si este brazo se pone rojo, el supuesto de arriba sobre el 17 era falso: medir y reescribir.
      expect(crudo!.esConocido, "en Postgres <= 17 se esperaba un P2003 traducido").toBe(true);
      expect(crudo!.code).toBe("P2003");
      expect(crudo!.cazadoPorLaIngenua).toBe(true);
    }
  }, 60_000);
});
