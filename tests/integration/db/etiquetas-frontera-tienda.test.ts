import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { EtiquetaGuiaService } from "@/lib/services/EtiquetaGuiaService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";

import {
  HAY_BASE_DE_DATOS,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
} from "./_postgres-real";

/**
 * SLT-49 — LA FRONTERA DE TIENDA DE LAS ETIQUETAS, EJECUTADA CONTRA POSTGRES (R7-R11).
 *
 * QUE SOSTIENE. Hasta la SLT-49 `EtiquetaGuiaService` no acotaba por dueño a los roles de sesion:
 * una tienda (`adminTienda`) leia la etiqueta —destinatario, telefono, direccion, monto— de una
 * orden de OTRA tienda si conocia su id (lote, «Ver etiqueta») o su guia (`/paquete/<numGuia>`).
 * La SLT-49 pone el `tienda_id` EN EL `where` de `findEtiquetasByIds` y `findEtiquetaByNumGuia`.
 *
 * POR QUE CONTRA POSTGRES. Un test de service con un doble afirma que se LLAMO al repositorio con
 * un `tiendaId`, no que la consulta lo use; medido cuatro veces en este repo, una mutacion del
 * `where` sobrevive en verde por arriba. Por eso (a) y (b) llaman al repositorio SALTANDOSE el
 * service: si alguien quita `tiendaId` del `where` confiando en la segunda capa del service, (c)
 * sigue verde (la segunda capa lo tapa) y (a)/(b) se ponen ROJOS.
 *
 * CONTRAPRUEBAS (design §5.3; resultado en `progress/impl_SLT-49.md`):
 *   1. quitar `tiendaId` del `where` de `findEtiquetasByIds` -> ROJO en (a);
 *   2. quitar `tiendaId` del `where` de `findEtiquetaByNumGuia` -> ROJO en (b);
 *   3. devolver `todas` para `adminTienda` en `resolverAlcanceEtiquetasOrden` -> ROJO en (c),
 *      (d) y (e).
 *
 * SIN BASE ALCANZABLE se SALTA (`describe.skip`), NO pasa en verde. CON base pero SIN catalogo,
 * falla RUIDOSAMENTE en el `beforeAll`. Ningun caso tiene un `return` silencioso.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

/** Sufijo unico por corrida: `num_remision` es UNICO por tienda entre las ordenes vivas. */
const SUFIJO = `slt49-${Date.now().toString(36)}`;

/**
 * Base de guias del escenario: `num_guia` es UNIQUE. Se elige un rango alto y aleatorio, lejos de
 * lo que asigna la secuencia `orden_num_guia_seq`; todo se revierte con la transaccion.
 */
const GUIA_BASE = 1_900_000_000 + Math.floor(Math.random() * 100_000_000);

describeSiHayBase("SLT-49 — una tienda NO lee las etiquetas de ordenes de otra tienda", () => {
  let prisma: PrismaClient;
  /** Catalogo que el escenario necesita (NO datos de negocio: la app nace vacia). */
  let catalogo: {
    rolAdminTiendaId: string;
    tipoIdentificacionId: string;
    estatusId: string;
    provinciaId: string;
    cantonId: string;
  };

  beforeAll(async () => {
    prisma = crearPrismaDeTest();
    // La base de desarrollo no trae ordenes ni usuarios (producto: plataforma vacia, sin seeds de
    // negocio), asi que el escenario NO se apoya en filas existentes: siembra sus dos tiendas, su
    // zona y sus ordenes dentro de la transaccion revertida. Solo necesita el CATALOGO; si falta,
    // se cae aqui con nombre, no en un caso con un `return`.
    const rol = await prisma.rol.findFirst({ where: { value: "adminTienda" }, select: { id: true } });
    const tipo = await prisma.tipoIdentificacion.findFirst({ select: { id: true } });
    // Un estado de recogida (los de la tienda, SLT-49). El servidor no filtra por estado: solo
    // tiene que ser el MISMO para las dos ordenes, asi la tienda es la unica variable.
    const estatus = await prisma.orderStatus.findFirst({
      where: { value: "por_recolectar_en_tienda" },
      select: { id: true },
    });
    const canton = await prisma.canton.findFirst({ select: { id: true, provinciaId: true } });
    const faltan = [
      rol ? null : "rol adminTienda",
      tipo ? null : "tipo_identificacion",
      estatus ? null : "order_status por_recolectar_en_tienda",
      canton ? null : "canton",
    ].filter((x): x is string => x !== null);
    if (faltan.length > 0 || !rol || !tipo || !estatus || !canton) {
      throw new Error(
        `hay DATABASE_URL pero falta catalogo (${faltan.join(", ")}): corre las migraciones y ` +
          "`pnpm run db:seed` antes de esta suite.",
      );
    }
    catalogo = {
      rolAdminTiendaId: rol.id,
      tipoIdentificacionId: tipo.id,
      estatusId: estatus.id,
      provinciaId: canton.provinciaId,
      cantonId: canton.id,
    };
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /**
   * Mismo escenario en cada caso: dos tiendas (`adminTienda`) de LA MISMA empresa (la que
   * `enTransaccionRevertida` fija) y una orden CON GUIA de cada una, en el mismo estado y la
   * misma zona. Lo unico que las distingue es la tienda: si la de B no sale, es por la tienda.
   * Todo se revierte con la transaccion.
   */
  async function sembrarEscenario(
    tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
    clave: string,
    desplazamiento: number,
  ) {
    await serializarEscriturasReales(tx);
    const tienda = async (letra: string) =>
      (
        await tx.usuario.create({
          data: {
            nombre: `Tienda ${letra} ${SUFIJO}-${clave}`,
            email: `tienda-${letra}-${SUFIJO}-${clave}@example.test`,
            telefono: "88880000",
            passwordHash: "x",
            cedula: `SLT49-${letra}-${SUFIJO}-${clave}`,
            tipoIdentificacionId: catalogo.tipoIdentificacionId,
            rolId: catalogo.rolAdminTiendaId,
            estado: "activo",
          },
          select: { id: true },
        })
      ).id;
    const tiendaA = await tienda("a");
    const tiendaB = await tienda("b");
    const zonaId = (
      await tx.zona.create({
        data: {
          nombre: `Zona ${SUFIJO}-${clave}`,
          sinpeNumero: "88880000",
          sinpeNombre: "Zona de prueba",
        },
        select: { id: true },
      })
    ).id;

    const sembrar = async (quien: string, tiendaId: string, numGuia: number) =>
      (
        await tx.orden.create({
          data: {
            numRemision: `R-${SUFIJO}-${clave}-${quien}`,
            destinatario: `Dest ${quien}`,
            telefonoDest: "88880000",
            producto: "Prod",
            estatusId: catalogo.estatusId,
            tiendaId,
            zonaId,
            provinciaId: catalogo.provinciaId,
            cantonId: catalogo.cantonId,
            numGuia,
          },
          select: { id: true },
        })
      ).id;

    const guiaA = GUIA_BASE + desplazamiento * 2;
    const guiaB = guiaA + 1;
    const repo = new OrdenRepository(tx as unknown as PrismaClient);
    return {
      tiendaA,
      tiendaB,
      guiaA,
      guiaB,
      ordenA: await sembrar("a", tiendaA, guiaA),
      ordenB: await sembrar("b", tiendaB, guiaB),
      repo,
      service: new EtiquetaGuiaService(repo),
    };
  }

  it("R10 (a): el REPO, saltandose el service, con tiendaId = A devuelve solo la orden de A", async () => {
    const medido = await enTransaccionRevertida(prisma, async (tx) => {
      const esc = await sembrarEscenario(tx, "a", 0);
      const filas = await esc.repo.findEtiquetasByIds([esc.ordenA, esc.ordenB], esc.tiendaA);
      // Control: sin frontera (null) las dos existen y se leen. Sin esto, un `[]` por otra causa
      // (fila no sembrada, empresa equivocada) pasaria por «filtro correcto».
      const sinFrontera = await esc.repo.findEtiquetasByIds([esc.ordenA, esc.ordenB], null);
      return {
        ordenA: esc.ordenA,
        ordenB: esc.ordenB,
        ids: filas.map((f) => f.id),
        idsSinFrontera: sinFrontera.map((f) => f.id).sort(),
      };
    });

    expect(medido.ids).toEqual([medido.ordenA]);
    expect(medido.ids).not.toContain(medido.ordenB);
    expect(medido.idsSinFrontera).toEqual([medido.ordenA, medido.ordenB].sort());
  });

  it("R10 (b): el REPO, saltandose el service, por la guia de B con tiendaId = A devuelve null", async () => {
    const medido = await enTransaccionRevertida(prisma, async (tx) => {
      const esc = await sembrarEscenario(tx, "b", 1);
      const ajena = await esc.repo.findEtiquetaByNumGuia(esc.guiaB, esc.tiendaA);
      // Controles: la guia de B existe (sin frontera) y la de A se lee con su propia frontera.
      const sinFrontera = await esc.repo.findEtiquetaByNumGuia(esc.guiaB, null);
      const propia = await esc.repo.findEtiquetaByNumGuia(esc.guiaA, esc.tiendaA);
      return {
        ordenA: esc.ordenA,
        ordenB: esc.ordenB,
        ajena,
        sinFronteraId: sinFrontera?.id ?? null,
        propiaId: propia?.id ?? null,
      };
    });

    expect(medido.ajena).toBeNull();
    expect(medido.sinFronteraId).toBe(medido.ordenB);
    expect(medido.propiaId).toBe(medido.ordenA);
  });

  it("R7 (c): service + repo reales, adminTienda A pide [A, B] -> etiqueta de A y B como no_encontrada", async () => {
    const medido = await enTransaccionRevertida(prisma, async (tx) => {
      const esc = await sembrarEscenario(tx, "c", 2);
      const actorA: Actor = { usuarioId: esc.tiendaA, rol: "adminTienda" };
      const r = await esc.service.generarEtiquetas({ ordenIds: [esc.ordenA, esc.ordenB] }, actorA);
      return { ordenA: esc.ordenA, ordenB: esc.ordenB, guiaB: esc.guiaB, r };
    });

    expect(medido.r.status).toBe("ok");
    if (medido.r.status !== "ok") throw new Error("unreachable");
    expect(medido.r.etiquetas.map((e) => e.ordenId)).toEqual([medido.ordenA]);
    expect(medido.r.etiquetas.map((e) => e.numGuia)).not.toContain(medido.guiaB);
    expect(medido.r.omitidas).toEqual([{ ordenId: medido.ordenB, motivo: "no_encontrada" }]);
  });

  it("R8 (d): lote de UNO con la orden de B (Ver etiqueta por fila) -> vacio y no_encontrada", async () => {
    const medido = await enTransaccionRevertida(prisma, async (tx) => {
      const esc = await sembrarEscenario(tx, "d", 3);
      const actorA: Actor = { usuarioId: esc.tiendaA, rol: "adminTienda" };
      const r = await esc.service.generarEtiquetas({ ordenIds: [esc.ordenB] }, actorA);
      return { ordenB: esc.ordenB, r };
    });

    expect(medido.r).toEqual({
      status: "ok",
      etiquetas: [],
      omitidas: [{ ordenId: medido.ordenB, motivo: "no_encontrada" }],
    });
  });

  it("R9 (e): obtenerEtiquetaPorGuia(guia de B) para adminTienda A -> no_encontrada (la pagina da 404)", async () => {
    const medido = await enTransaccionRevertida(prisma, async (tx) => {
      const esc = await sembrarEscenario(tx, "e", 4);
      const actorA: Actor = { usuarioId: esc.tiendaA, rol: "adminTienda" };
      const ajena = await esc.service.obtenerEtiquetaPorGuia(esc.guiaB, actorA);
      // Control: su propia guia SI la resuelve, asi que el `no_encontrada` es por la tienda.
      const propia = await esc.service.obtenerEtiquetaPorGuia(esc.guiaA, actorA);
      return { ajena, propia, ordenA: esc.ordenA };
    });

    expect(medido.ajena).toEqual({ status: "no_encontrada" });
    expect(medido.propia.status).toBe("ok");
    if (medido.propia.status !== "ok") throw new Error("unreachable");
    expect(medido.propia.etiqueta.ordenId).toBe(medido.ordenA);
  });

  it("R11 (f): el maestro recibe las etiquetas de A y de B, en lote y por guia", async () => {
    const medido = await enTransaccionRevertida(prisma, async (tx) => {
      const esc = await sembrarEscenario(tx, "f", 5);
      const maestro: Actor = { usuarioId: "no-importa-quien", rol: "maestro" };
      const lote = await esc.service.generarEtiquetas(
        { ordenIds: [esc.ordenA, esc.ordenB] },
        maestro,
      );
      const porGuiaB = await esc.service.obtenerEtiquetaPorGuia(esc.guiaB, maestro);
      return { ordenA: esc.ordenA, ordenB: esc.ordenB, lote, porGuiaB };
    });

    expect(medido.lote.status).toBe("ok");
    if (medido.lote.status !== "ok") throw new Error("unreachable");
    expect(medido.lote.etiquetas.map((e) => e.ordenId).sort()).toEqual(
      [medido.ordenA, medido.ordenB].sort(),
    );
    expect(medido.lote.omitidas).toEqual([]);
    expect(medido.porGuiaB.status).toBe("ok");
  });
});
