// SLT-48 (R46, R15, R17; maqueta aprobada, sección 5) — LA CARGA MASIVA DE UN PAÍS DE 4 NIVELES.
//
// La plantilla de un país de 4 niveles trae una columna por nivel (ya desde SLT-45; la de Costa Rica no
// cambia). Lo que SLT-48 cambia es el resultado: una fila con los 4 niveles crea la orden en el nodo de
// nivel 4, con las 3 FK viejas en NULL. Hasta hoy el guardado la rechazaba con «país aún no habilitado».
// Una fila que se queda en el nivel 3 se rechaza con «ubicación incompleta» y no crea nada.
//
// Contra Postgres real (`HAY_BASE_DE_DATOS`), con el rol de la app (`servi_app`, RLS), dentro de una
// transacción que siempre se revierte. El país de prueba es `XP` (`tests/fixtures/paises-de-prueba-geo`).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { conEmpresa } from "@/lib/db/contexto-empresa";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { RawRow } from "@/lib/parsers/spreadsheet";
import { CatalogoGeograficoRepository } from "@/lib/repositories/CatalogoGeograficoRepository";
import { CupoPlanRepository } from "@/lib/repositories/CupoPlanRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { TarifaVigenteRepository } from "@/lib/repositories/TarifaVigenteRepository";
import { BulkOrdenService } from "@/lib/services/BulkOrdenService";
import { msgUbicacionIncompleta } from "@/lib/services/geo-ubicacion";
import { columnasGeoDePlantilla } from "@/lib/utils/plantilla-geo";
import { comoApp } from "@/tests/fabricas/organizaciones";
import {
  PAIS_CUATRO_NIVELES,
  claveDeRuta,
  residuosDePaisesDePrueba,
  sembrarPaisDePruebaGeo,
  type PaisSembrado,
} from "@/tests/fixtures/paises-de-prueba-geo";

import {
  HAY_BASE_DE_DATOS,
  clienteConSavepoint,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const QUILPUE = ["Valparaíso", "Marga Marga", "Quilpué"];
const EL_BELLOTO = [...QUILPUE, "El Belloto"];

const TARIFA_FIJA = {
  valorFlete: "2500.00",
  valorFleteDevuelto: "1250.00",
  valorFleteGam: "2000.00",
  valorFleteDevueltoGam: "1000.00",
  comisionCod: "2.00",
  ivaFlete: "13.00",
  ivaComisionCod: "13.00",
  tarifaEspecial: "4000.00",
  tarifaEspecialDevuelta: "1500.00",
} as const;

/** Una tienda de rol `adminTienda` (la carga masiva es suya: R11). */
async function crearTiendaDeSesion(tx: TxDeTest): Promise<string> {
  const rol = await tx.rol.findUniqueOrThrow({ where: { value: "adminTienda" }, select: { id: true } });
  const tipo = await tx.tipoIdentificacion.findUniqueOrThrow({ where: { value: "cedula" }, select: { id: true } });
  const sufijo = randomUUID().replace(/-/g, "").slice(0, 12);
  const tienda = await tx.usuario.create({
    data: {
      nombre: "Tienda",
      primerApellido: "Cuatro Niveles",
      email: `slt48-carga-${sufijo}@example.com`,
      telefono: "80000000",
      passwordHash: "x",
      cedula: `slt48-${sufijo}`,
      tipoIdentificacionId: tipo.id,
      rolId: rol.id,
      estado: "activo",
    },
    select: { id: true },
  });
  return tienda.id;
}

interface Contexto {
  tx: TxDeTest;
  cli: PrismaClient;
  pais: PaisSembrado;
  actor: Actor;
  zonaId: string;
}

/**
 * Siembra el país de 4 niveles, su empresa, una tienda y una zona que cubre Quilpué (nivel 3: sus
 * sectores la heredan), como dueño; baja al rol de la app y corre `fn`.
 */
async function conPaisDeCuatroNiveles<T>(base: PrismaClient, fn: (c: Contexto) => Promise<T>): Promise<T> {
  return enTransaccionRevertida(base, async (tx) => {
    await serializarEscriturasReales(tx);
    const pais = await sembrarPaisDePruebaGeo(tx, PAIS_CUATRO_NIVELES);
    const tiendaId = await crearTiendaDeSesion(tx);
    const zona = await tx.zona.create({
      data: { nombre: "Costa Norte", esCentral: false, sinpeNumero: "80000000", sinpeNombre: "Titular de Prueba" },
      select: { id: true },
    });
    const quilpue = pais.nodoPorRuta.get(claveDeRuta(QUILPUE));
    if (quilpue === undefined) throw new Error("la siembra no trae Quilpué");
    // Un nodo de profundidad 3 se asigna en `zona_distrito` (la base lo exige; `zona_nodo` es para los demás).
    await tx.zonaDistrito.create({ data: { zonaId: zona.id, distritoId: quilpue, nodoGeograficoId: quilpue } });
    await tx.tarifa.create({ data: { ...TARIFA_FIJA, zonaId: zona.id, tiendaId: null } });

    await comoApp(tx, pais.organizacionId);
    try {
      return await conEmpresa(pais.organizacionId, () =>
        fn({
          tx,
          cli: clienteConSavepoint(tx),
          pais,
          actor: { usuarioId: tiendaId, rol: "adminTienda", organizacionId: pais.organizacionId },
          zonaId: zona.id,
        }),
      );
    } finally {
      await tx.$executeRawUnsafe("RESET ROLE");
    }
  });
}

function bulkService(cli: PrismaClient): BulkOrdenService {
  return new BulkOrdenService(
    new OrdenRepository(cli),
    new TarifaVigenteRepository(cli),
    undefined,
    new CupoPlanRepository(cli),
    new CatalogoGeograficoRepository(cli),
  );
}

/** Una fila de la plantilla del país: una columna por nivel, con las cabeceras de la plantilla. */
function fila(cabeceras: readonly string[], numRemision: string, ruta: readonly string[]): RawRow {
  const geo = Object.fromEntries(cabeceras.map((c, i) => [c, ruta[i] ?? ""]));
  return {
    num_remision: numRemision,
    destinatario: "Rosa Pérez",
    telefono: "987654321",
    ...geo,
    direccion: "Av. Libertad 1120",
    producto: "Camiseta talla M",
    notas: "",
    monto_cobrar: "25.90",
    peso: "1.5",
  };
}

describeSiHayBase("SLT-48 / R46 — carga masiva en un país de 4 niveles (Postgres)", () => {
  let base: PrismaClient;

  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    // La transacción de cada caso se revierte: no queda ni el país ni sus nodos ni la empresa.
    expect(await residuosDePaisesDePrueba(base)).toEqual({ paises: 0, tipos: 0, nodos: 0, organizaciones: 0 });
    await base.$disconnect();
  });

  it("la plantilla trae una columna por nivel, con el tipo del país (sin cambio desde SLT-45)", async () => {
    await conPaisDeCuatroNiveles(base, async ({ cli }) => {
      const { catalogo } = await new CatalogoGeograficoRepository(cli).deLaEmpresa();
      expect(columnasGeoDePlantilla(catalogo)?.map((c) => c.key)).toEqual(["region", "provincia", "comuna", "sector"]);
    });
  }, 120_000);

  it("una fila con los 4 niveles crea la orden en el nodo de nivel 4, con las 3 FK viejas en NULL (R15)", async () => {
    await conPaisDeCuatroNiveles(base, async ({ cli, pais, actor, zonaId }) => {
      const { catalogo } = await new CatalogoGeograficoRepository(cli).deLaEmpresa();
      const cabeceras = (columnasGeoDePlantilla(catalogo) ?? []).map((c) => c.key);
      const numRemision = `SLT48-4N-${randomUUID().slice(0, 8)}`;

      const r = await bulkService(cli).cargarMasiva([fila(cabeceras, numRemision, EL_BELLOTO)], actor);

      expect(r.status).toBe("ok");
      if (r.status !== "ok") return;
      expect(r.summary, JSON.stringify(r.summary.filas)).toMatchObject({ creadas: 1, conError: 0 });
      const orden = await cli.orden.findFirstOrThrow({
        where: { numRemision },
        select: { nodoGeograficoId: true, provinciaId: true, cantonId: true, distritoId: true, zonaId: true, organizacionId: true },
      });
      expect(orden).toEqual({
        nodoGeograficoId: pais.nodoPorRuta.get(claveDeRuta(EL_BELLOTO)),
        provinciaId: null,
        cantonId: null,
        distritoId: null,
        zonaId,
        organizacionId: pais.organizacionId,
      });
    });
  }, 120_000);

  it("una fila que se queda en la comuna se rechaza con «ubicación incompleta» y no crea nada (R17)", async () => {
    await conPaisDeCuatroNiveles(base, async ({ cli, actor }) => {
      const { catalogo } = await new CatalogoGeograficoRepository(cli).deLaEmpresa();
      const cabeceras = (columnasGeoDePlantilla(catalogo) ?? []).map((c) => c.key);
      const numRemision = `SLT48-4N-${randomUUID().slice(0, 8)}`;

      const r = await bulkService(cli).cargarMasiva([fila(cabeceras, numRemision, QUILPUE)], actor);

      expect(r.status).toBe("ok");
      if (r.status !== "ok") return;
      expect(r.summary).toMatchObject({ creadas: 0, conError: 1, cargaId: null });
      const errores = Object.values(r.summary.filas[0]?.errores ?? {}).flat();
      expect(errores).toContain(msgUbicacionIncompleta("Quilpué", "Sectores"));
      expect(await cli.orden.count({ where: { numRemision } })).toBe(0);
    });
  }, 120_000);
});
