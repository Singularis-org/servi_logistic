import { randomUUID } from "node:crypto";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { EstadoUsuario, PrismaClient, RolValue } from "@prisma/client";

import { ZonaRepository } from "@/lib/repositories/ZonaRepository";
import { TarifasPantallaRepository } from "@/lib/repositories/TarifasPantallaRepository";
import type { DesactivarZonaRepoResult } from "@/lib/interfaces/repositories/IZonaRepository";
import { CATEGORIA_POR_ACCION } from "@/lib/types/historial-accion";
import type { OrderStatusValue } from "@/lib/types/order-status";
import type { ImpedimentosDesactivacion } from "@/lib/types/zona";
import { comoApp, crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import {
  HAY_BASE_DE_DATOS,
  clienteConSavepoint,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";
import { crearFksDeOrden, crearUsuarioDePrueba } from "./_fixtures/orden-minima";

/**
 * SLT-225 «Desactivar zona: sacarla del trabajo nuevo sin borrar su historia» — contra Postgres real.
 *
 * SIEMBRA PROPIA: cada caso corre en una transaccion que se revierte siempre, con su empresa. El
 * repositorio recibe \`clienteConSavepoint\`: su \`$transaction\` abre un SAVEPOINT de verdad, asi que el
 * centinela de R1746 revierte de verdad la marca (un paso a traves dejaria la marca puesta y el test
 * de «no escribe nada» mentiria). Las aserciones de «no cambio» comparan contra lo leido ANTES.
 *
 * Los dos casos de carrera (R1754) CONFIRMAN datos con dos conexiones reales y los borran por id al
 * terminar: es la unica forma de medir el bloqueo de fila entre dos transacciones.
 *
 * MUTACIONES DE CONTROL: anotadas, con su rojo, en \`progress/impl_SLT-225.md\`.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const SUFIJO = `225-${Date.now().toString(36)}`;
const GUIA_BASE = 950_000_000 + (Date.now() % 20_000_000);
let contador = 0;
function unico(): string {
  contador += 1;
  return `${SUFIJO}-${contador.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Recorre el error y sus causas buscando el SQLSTATE propio de los triggers de esta ficha. */
function traeSqlstate(e: unknown, codigo: string, vistos = new Set<unknown>(), prof = 0): boolean {
  if (e === null || typeof e !== "object" || vistos.has(e) || prof > 5) return false;
  vistos.add(e);
  for (const clave of Object.getOwnPropertyNames(e)) {
    const v = (e as Record<string, unknown>)[clave];
    if (typeof v === "string" && v.includes(codigo)) return true;
    if (typeof v === "object" && traeSqlstate(v, codigo, vistos, prof + 1)) return true;
  }
  return false;
}

function bloqueada(r: DesactivarZonaRepoResult): ImpedimentosDesactivacion {
  if (r.estado !== "bloqueada") throw new Error(`se esperaba \`bloqueada\` y llego \`${r.estado}\``);
  return r.impedimentos;
}

interface Escenario {
  tx: TxDeTest;
  organizacionId: string;
  maestroId: string;
  repo: ZonaRepository;
  distritos: string[];
  zona: (prefijo: string, o?: { esCentral?: boolean }) => Promise<{ id: string; nombre: string }>;
  orden: (o: {
    zonaId: string;
    estado: OrderStatusValue;
    sinGuia?: boolean;
    eliminada?: boolean;
  }) => Promise<{ id: string; numGuia: number | null; numRemision: string }>;
  usuario: (rol: RolValue, zonaId: string, estado?: EstadoUsuario) => Promise<{ id: string; nombre: string }>;
  activa: (zonaId: string) => Promise<boolean>;
  filasHistorial: (zonaId: string) => Promise<
    { accion: string; entidadTipo: string; entidadEtiqueta: string; actorUsuarioId: string | null; valorAnterior: string | null; valorNuevo: string | null }[]
  >;
}

describeSiHayBase("SLT-225 — desactivar una zona, contra Postgres real", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function conEscenario<T>(fn: (e: Escenario) => Promise<T>): Promise<T> {
    return enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const fks = await crearFksDeOrden(tx);
      const maestro = await crearUsuarioDePrueba(tx, "maestro");
      const [{ org }] = await tx.$queryRawUnsafe<{ org: string }[]>(
        `SELECT current_setting('app.organizacion_id') AS org`,
      );
      // Distritos ya existentes del canton del fixture: la empresa del caso es nueva, asi que el unico
      // (organizacion_id, distrito_id) de zona_distrito no choca con nada.
      const distritos = (
        await tx.distrito.findMany({ where: { cantonId: fks.cantonId }, select: { id: true }, take: 3, orderBy: { id: "asc" } })
      ).map((d) => d.id);
      expect(distritos.length).toBeGreaterThanOrEqual(2);
      const idEstado = async (value: OrderStatusValue) =>
        (await tx.orderStatus.findUniqueOrThrow({ where: { value }, select: { id: true } })).id;

      return fn({
        tx,
        organizacionId: org,
        maestroId: maestro.id,
        repo: new ZonaRepository(clienteConSavepoint(tx)),
        distritos,
        zona: async (prefijo, o = {}) => {
          const nombre = `${prefijo} ${unico()}`;
          if (o.esCentral) await tx.zona.updateMany({ where: { esCentral: true }, data: { esCentral: false } });
          const z = await tx.zona.create({
            data: { nombre, esCentral: o.esCentral ?? false, sinpeNumero: "80000000", sinpeNombre: "Titular de Prueba" },
            select: { id: true },
          });
          return { id: z.id, nombre };
        },
        orden: async ({ zonaId, estado, sinGuia, eliminada }) => {
          contador += 1;
          const numGuia = sinGuia ? null : GUIA_BASE + contador;
          const numRemision = `R-${unico()}`;
          const o = await tx.orden.create({
            data: {
              numGuia,
              numRemision,
              destinatario: "Destinataria 225",
              telefonoDest: "8888-0000",
              producto: "caja",
              estatusId: await idEstado(estado),
              tiendaId: fks.tiendaId,
              zonaId,
              provinciaId: fks.provinciaId,
              cantonId: fks.cantonId,
              distritoId: distritos[0],
              direccion: "100 m norte de la iglesia",
              montoCobrar: 10_000,
              deletedAt: eliminada ? new Date() : null,
            },
            select: { id: true },
          });
          return { id: o.id, numGuia, numRemision };
        },
        usuario: async (rol, zonaId, estado = "activo") => {
          const u = await crearUsuarioDePrueba(tx, rol);
          await tx.usuario.update({ where: { id: u.id }, data: { zonaId, estado } });
          return { id: u.id, nombre: `${u.nombre} ${u.primerApellido ?? ""}`.trim() };
        },
        activa: async (zonaId) =>
          (await tx.zona.findUniqueOrThrow({ where: { id: zonaId }, select: { activa: true } })).activa,
        filasHistorial: (zonaId) =>
          tx.historialAccion.findMany({
            where: { entidadId: zonaId, accion: { in: ["zona_desactivada", "zona_reactivada"] } },
            select: {
              accion: true,
              entidadTipo: true,
              entidadEtiqueta: true,
              actorUsuarioId: true,
              valorAnterior: true,
              valorNuevo: true,
            },
            orderBy: { createdAt: "asc" },
          }),
      });
    });
  }

  it("R1740 — la migración deja activas las zonas existentes y una zona nueva nace activa", async () => {
    await conEscenario(async ({ tx, zona, repo }) => {
      const [col] = await tx.$queryRawUnsafe<{ is_nullable: string; column_default: string | null; data_type: string }[]>(
        `SELECT is_nullable, column_default, data_type FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'zona' AND column_name = 'activa'`,
      );
      expect(col).toEqual({ is_nullable: "NO", column_default: "true", data_type: "boolean" });
      const z = await zona("225 Nueva");
      expect((await tx.zona.findUniqueOrThrow({ where: { id: z.id } })).activa).toBe(true);
      expect((await repo.findById(z.id, false))?.activa).toBe(true);
    });
  });

  it("R1741 + R1749 — desactivar sin impedimentos marca la zona y no toca órdenes, usuarios, tarifas ni historial previos; deja una fila zona_desactivada en la misma transacción", async () => {
    await conEscenario(async ({ tx, zona, orden, repo, maestroId, activa, filasHistorial }) => {
      const z = await zona("225 Kevin");
      const entregada = await orden({ zonaId: z.id, estado: "entregado" });
      await tx.tarifaZonaMensajero.create({ data: { zonaId: z.id, cobroEntregado: 1000, cobroRechazado: 500 } });
      const ordenAntes = await tx.orden.findUniqueOrThrow({ where: { id: entregada.id } });
      const tarifasAntes = await tx.tarifaZonaMensajero.findMany({ where: { zonaId: z.id } });
      const historialAntes = await tx.historialAccion.count();

      expect(await repo.desactivar(z.id, maestroId)).toEqual({ estado: "ok" });

      expect(await activa(z.id)).toBe(false);
      expect(await tx.orden.findUniqueOrThrow({ where: { id: entregada.id } })).toEqual(ordenAntes);
      expect(await tx.tarifaZonaMensajero.findMany({ where: { zonaId: z.id } })).toEqual(tarifasAntes);
      expect(await tx.historialAccion.count()).toBe(historialAntes + 1);
      expect(await filasHistorial(z.id)).toEqual([
        {
          accion: "zona_desactivada",
          entidadTipo: "zona",
          entidadEtiqueta: z.nombre,
          actorUsuarioId: maestroId,
          valorAnterior: null,
          valorNuevo: null,
        },
      ]);
      expect(CATEGORIA_POR_ACCION.zona_desactivada).toBe("hace_desaparecer");
    });
  });

  it("R1742 — una orden en estado no terminal bloquea; entregada, devuelta a tienda, incidente y eliminada no", async () => {
    await conEscenario(async ({ zona, orden, repo, maestroId, activa }) => {
      // Solo terminales y una viva eliminada: no hay impedimento.
      const terminal = await zona("225 Terminal");
      await orden({ zonaId: terminal.id, estado: "entregado" });
      await orden({ zonaId: terminal.id, estado: "devuelta_a_tienda" });
      await orden({ zonaId: terminal.id, estado: "incidente" });
      await orden({ zonaId: terminal.id, estado: "en_reparto", eliminada: true });
      expect(await repo.desactivar(terminal.id, maestroId)).toEqual({ estado: "ok" });
      expect(await activa(terminal.id)).toBe(false);

      // P3: devolviendo y por devolver a tienda SI bloquean; una sin guia se nombra por remision.
      const viva = await zona("225 Viva");
      for (let i = 0; i < 20; i += 1) await orden({ zonaId: viva.id, estado: "en_reparto" });
      await orden({ zonaId: viva.id, estado: "devolviendo_a_tienda" });
      await orden({ zonaId: viva.id, estado: "por_devolver_a_tienda" });
      const sinGuia = await orden({ zonaId: viva.id, estado: "en_bodega_central", sinGuia: true });
      await orden({ zonaId: viva.id, estado: "entregado" });

      const imp = bloqueada(await repo.desactivar(viva.id, maestroId));
      expect(imp.ordenesVivas.total).toBe(23);
      expect(imp.ordenesVivas.porEstado).toEqual([
        { estado: "en_reparto", cantidad: 20 },
        { estado: "devolviendo_a_tienda", cantidad: 1 },
        { estado: "en_bodega_central", cantidad: 1 },
        { estado: "por_devolver_a_tienda", cantidad: 1 },
      ]);
      expect(imp.ordenesVivas.muestra).toHaveLength(20);
      expect(imp.ordenesVivas.muestra.every((m) => /^#\d+$/.test(m))).toBe(true);
      expect(imp).toMatchObject({ esCentral: false, distritos: 0, usuarios: [] });
      expect(await activa(viva.id)).toBe(true);

      // La muestra nombra por remision la que no tiene guia (sola, para que entre en las 20).
      const soloSinGuia = await zona("225 SinGuia");
      await orden({ zonaId: soloSinGuia.id, estado: "por_recolectar_en_tienda", sinGuia: true });
      expect(bloqueada(await repo.desactivar(soloSinGuia.id, maestroId)).ordenesVivas.muestra).toEqual([
        expect.stringMatching(/^remisión R-/),
      ]);
      expect(sinGuia.numGuia).toBeNull();
    });
  });

  it("R1743 — un usuario asignado bloquea, también si está inactivo", async () => {
    await conEscenario(async ({ zona, usuario, repo, maestroId, activa }) => {
      const z = await zona("225 Usuarios");
      const u = await usuario("mensajero", z.id, "inactivo");
      const imp = bloqueada(await repo.desactivar(z.id, maestroId));
      expect(imp.usuarios).toEqual([{ nombre: u.nombre, rol: "mensajero", estado: "inactivo" }]);
      expect(imp.ordenesVivas.total).toBe(0);
      expect(await activa(z.id)).toBe(true);
    });
  });

  it("R1744 — una zona con distritos no se desactiva", async () => {
    await conEscenario(async ({ tx, zona, distritos, repo, maestroId, activa }) => {
      const z = await zona("225 Distritos");
      await tx.zonaDistrito.create({ data: { zonaId: z.id, distritoId: distritos[1] } });
      expect(bloqueada(await repo.desactivar(z.id, maestroId))).toMatchObject({ distritos: 1, esCentral: false });
      expect(await activa(z.id)).toBe(true);
    });
  });

  it("R1745 — la zona de bodega principal no se desactiva", async () => {
    await conEscenario(async ({ zona, repo, maestroId, activa }) => {
      const central = await zona("225 Central", { esCentral: true });
      expect(bloqueada(await repo.desactivar(central.id, maestroId))).toMatchObject({ esCentral: true, distritos: 0 });
      expect(await activa(central.id)).toBe(true);
    });
  });

  it("R1746 — con varios impedimentos los devuelve todos y no escribe marca ni historial", async () => {
    await conEscenario(async ({ tx, zona, orden, usuario, distritos, repo, maestroId, activa, filasHistorial }) => {
      const z = await zona("225 Todo", { esCentral: true });
      await tx.zonaDistrito.create({ data: { zonaId: z.id, distritoId: distritos[0] } });
      const u = await usuario("adminSatelite", z.id);
      const o = await orden({ zonaId: z.id, estado: "novedad" });
      const historialAntes = await tx.historialAccion.count();

      const imp = bloqueada(await repo.desactivar(z.id, maestroId));
      expect(imp).toEqual({
        esCentral: true,
        distritos: 1,
        usuarios: [{ nombre: u.nombre, rol: "adminSatelite", estado: "activo" }],
        ordenesVivas: { total: 1, porEstado: [{ estado: "novedad", cantidad: 1 }], muestra: [`#${o.numGuia}`] },
      });
      expect(await activa(z.id)).toBe(true);
      expect(await filasHistorial(z.id)).toEqual([]);
      expect(await tx.historialAccion.count()).toBe(historialAntes);
    });
  });

  it("R1747 + R1750 — reactivar marca activa, deja una fila zona_reactivada y no devuelve distritos ni usuarios", async () => {
    await conEscenario(async ({ tx, zona, repo, maestroId, activa, filasHistorial }) => {
      const z = await zona("225 Vuelve");
      expect(await repo.desactivar(z.id, maestroId)).toEqual({ estado: "ok" });
      expect(await repo.reactivar(z.id, maestroId)).toEqual({ estado: "ok" });
      expect(await activa(z.id)).toBe(true);
      expect(await tx.zonaDistrito.count({ where: { zonaId: z.id } })).toBe(0);
      expect(await tx.usuario.count({ where: { zonaId: z.id } })).toBe(0);
      expect((await filasHistorial(z.id)).map((f) => [f.accion, f.entidadTipo, f.entidadEtiqueta, f.actorUsuarioId])).toEqual([
        ["zona_desactivada", "zona", z.nombre, maestroId],
        ["zona_reactivada", "zona", z.nombre, maestroId],
      ]);
      expect(CATEGORIA_POR_ACCION.zona_reactivada).toBe("hace_desaparecer");
    });
  });

  it("R1748 — desactivar dos veces / reactivar una activa no escribe nada", async () => {
    await conEscenario(async ({ zona, repo, maestroId, activa, filasHistorial }) => {
      const z = await zona("225 Dos veces");
      expect(await repo.reactivar(z.id, maestroId)).toEqual({ estado: "ya_activa" });
      expect(await filasHistorial(z.id)).toEqual([]);
      expect(await repo.desactivar(z.id, maestroId)).toEqual({ estado: "ok" });
      expect(await repo.desactivar(z.id, maestroId)).toEqual({ estado: "ya_desactivada" });
      expect(await activa(z.id)).toBe(false);
      expect((await filasHistorial(z.id)).map((f) => f.accion)).toEqual(["zona_desactivada"]);
      expect(await repo.desactivar(randomUUID(), maestroId)).toEqual({ estado: "not_found" });
      expect(await repo.reactivar(randomUUID(), maestroId)).toEqual({ estado: "not_found" });
    });
  });

  it("R1752 — dos empresas: la zona de B responde not_found y las órdenes/usuarios de B no cuentan como impedimento de A", async () => {
    await conEscenario(async ({ tx, organizacionId, zona, repo, maestroId, activa }) => {
      const zonaA = await zona("225 A");
      // Empresa B, con su zona cargada de impedimentos, sembrada como dueño.
      const empresaB = await crearOrganizacion(tx);
      await fijarEmpresa(tx, empresaB.id);
      const zonaB = await tx.zona.create({
        data: { nombre: `225 B ${unico()}`, sinpeNumero: "80000000", sinpeNombre: "Titular de Prueba" },
        select: { id: true },
      });
      const mensajeroB = await crearUsuarioDePrueba(tx, "mensajero");
      await tx.usuario.update({ where: { id: mensajeroB.id }, data: { zonaId: zonaB.id } });
      await fijarEmpresa(tx, organizacionId);

      // Desde aqui, como la app: rol servi_app y la RLS de la empresa A.
      await comoApp(tx, organizacionId);
      expect(await repo.desactivar(zonaB.id, maestroId)).toEqual({ estado: "not_found" });
      expect(await repo.reactivar(zonaB.id, maestroId)).toEqual({ estado: "not_found" });
      expect(await repo.desactivar(zonaA.id, maestroId)).toEqual({ estado: "ok" });
      expect(await activa(zonaA.id)).toBe(false);

      // La zona de B sigue activa: se mira como dueño otra vez.
      await tx.$executeRawUnsafe(`RESET ROLE`);
      expect(await activa(zonaB.id)).toBe(true);
    });
  });

  it("R1753 — update de una zona desactivada devuelve zona_desactivada sin escribir", async () => {
    await conEscenario(async ({ tx, zona, distritos, repo, maestroId }) => {
      const z = await zona("225 Editar");
      expect(await repo.desactivar(z.id, maestroId)).toEqual({ estado: "ok" });
      const historialAntes = await tx.historialAccion.count();

      const r = await repo.update(z.id, { nombre: "Otro nombre", distritoIds: [distritos[0]], tarifas: [], esCentral: true }, maestroId);

      expect(r).toEqual({ estado: "zona_desactivada" });
      const despues = await tx.zona.findUniqueOrThrow({ where: { id: z.id } });
      expect(despues).toMatchObject({ nombre: z.nombre, esCentral: false, activa: false });
      expect(await tx.zonaDistrito.count({ where: { zonaId: z.id } })).toBe(0);
      expect(await tx.historialAccion.count()).toBe(historialAntes);
    });
  });

  it("R1754 — la base rechaza insertar en zona_distrito con la zona desactivada (bajo servi_app)", async () => {
    await conEscenario(async ({ tx, organizacionId, zona, distritos, repo, maestroId }) => {
      const apagada = await zona("225 Sin distritos");
      const encendida = await zona("225 Con distritos");
      expect(await repo.desactivar(apagada.id, maestroId)).toEqual({ estado: "ok" });
      await comoApp(tx, organizacionId);
      const conSavepoint = clienteConSavepoint(tx);

      let error: unknown = null;
      await conSavepoint
        .$transaction(async (t) => {
          await t.zonaDistrito.create({ data: { zonaId: apagada.id, distritoId: distritos[0] } });
        })
        .catch((e: unknown) => {
          error = e;
        });
      expect(error).not.toBeNull();
      expect(traeSqlstate(error, "SL225")).toBe(true);

      // Control positivo: la misma escritura sobre una zona activa entra.
      await conSavepoint.$transaction(async (t) => {
        await t.zonaDistrito.create({ data: { zonaId: encendida.id, distritoId: distritos[0] } });
      });
      expect(await tx.zonaDistrito.count({ where: { zonaId: encendida.id } })).toBe(1);
      expect(await tx.zonaDistrito.count({ where: { zonaId: apagada.id } })).toBe(0);
    });
  });

  it("R1755 — la base rechaza usuario.zona_id nuevo a una zona desactivada y no al que ya la tenía", async () => {
    await conEscenario(async ({ tx, organizacionId, zona, usuario }) => {
      const z = await zona("225 Personas");
      const otra = await zona("225 Otra");
      const yaLaTenia = await usuario("mensajero", z.id);
      const nuevo = await usuario("mensajero", otra.id);
      // El usuario bloquea la desactivacion (R1743): se apaga la marca a mano, como si el usuario
      // hubiera quedado de antes, para medir que el trigger no lo rechaza al guardar otra cosa.
      await tx.zona.update({ where: { id: z.id }, data: { activa: false } });
      await comoApp(tx, organizacionId);
      const conSavepoint = clienteConSavepoint(tx);

      // Se reescribe la MISMA zona (como hace el formulario al guardar): el `UPDATE OF zona_id` dispara
      // el trigger, y solo su salida «ya tenia esa zona» lo deja pasar.
      await conSavepoint.$transaction(async (t) => {
        await t.usuario.update({ where: { id: yaLaTenia.id }, data: { telefono: "88881111", zonaId: z.id } });
      });
      expect((await tx.usuario.findUniqueOrThrow({ where: { id: yaLaTenia.id }, select: { telefono: true } })).telefono).toBe(
        "88881111",
      );

      let error: unknown = null;
      await conSavepoint
        .$transaction(async (t) => {
          await t.usuario.update({ where: { id: nuevo.id }, data: { zonaId: z.id } });
        })
        .catch((e: unknown) => {
          error = e;
        });
      expect(traeSqlstate(error, "SL225")).toBe(true);
      expect((await tx.usuario.findUniqueOrThrow({ where: { id: nuevo.id }, select: { zonaId: true } })).zonaId).toBe(otra.id);
    });
  });

  it("R1757 — TarifasPantallaRepository.listarZonas y buscarZona no devuelven la desactivada", async () => {
    await conEscenario(async ({ tx, zona, repo, maestroId }) => {
      const viva = await zona("225 Tarifas viva");
      const apagada = await zona("225 Tarifas apagada");
      expect(await repo.desactivar(apagada.id, maestroId)).toEqual({ estado: "ok" });
      const tarifas = new TarifasPantallaRepository(tx as unknown as ConstructorParameters<typeof TarifasPantallaRepository>[0]);

      const ids = (await tarifas.listarZonas()).map((z) => z.id);
      expect(ids).toContain(viva.id);
      expect(ids).not.toContain(apagada.id);
      expect(await tarifas.buscarZona(apagada.id)).toBeNull();
      expect((await tarifas.buscarZona(viva.id))?.id).toBe(viva.id);
    });
  });

  it("R1758 — listLite sigue devolviendo la zona desactivada; R1759 — list pone las activas primero", async () => {
    await conEscenario(async ({ zona, repo, maestroId }) => {
      const aa = await zona("225 AA");
      const bb = await zona("225 BB");
      const cc = await zona("225 CC");
      expect(await repo.desactivar(aa.id, maestroId)).toEqual({ estado: "ok" });

      expect((await repo.listLite()).map((z) => z.id)).toContain(aa.id);

      const { items } = await repo.list({ skip: 0, take: 100, includeTarifas: false });
      const nuestras = items.filter((z) => [aa.id, bb.id, cc.id].includes(z.id));
      expect(nuestras.map((z) => [z.id, z.activa])).toEqual([
        [bb.id, true],
        [cc.id, true],
        [aa.id, false],
      ]);
      const posicionDesactivada = items.findIndex((z) => z.id === aa.id);
      expect(items.slice(posicionDesactivada).every((z) => !z.activa)).toBe(true);
    });
  });
});

/**
 * R1754 — LA CARRERA con la desactivacion, con dos conexiones reales. Confirma datos (una empresa,
 * una zona y a lo sumo una fila de zona_distrito) y los borra por id al terminar.
 */
describeSiHayBase("SLT-225 — R1754, la carrera entre desactivar y asignar un distrito", () => {
  let a: PrismaClient;
  let b: PrismaClient;
  let sonda: PrismaClient;

  beforeAll(() => {
    a = crearPrismaDeTest();
    b = crearPrismaDeTest();
    sonda = crearPrismaDeTest();
  });

  afterAll(async () => {
    await Promise.all([a?.$disconnect(), b?.$disconnect(), sonda?.$disconnect()]);
  });

  async function hayEsperaDeLock(fragmento: string): Promise<boolean> {
    const filas = await sonda.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query ILIKE $1`,
      `%${fragmento}%`,
    );
    return (filas[0]?.n ?? 0) > 0;
  }

  async function esperarA(fragmento: string): Promise<void> {
    for (let i = 0; i < 200; i += 1) {
      if (await hayEsperaDeLock(fragmento)) return;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error(`nadie llego a esperar el bloqueo de «${fragmento}»`);
  }

  async function conMundo(fn: (m: { org: string; zonaId: string; distritoId: string }) => Promise<void>): Promise<void> {
    const org = (await crearOrganizacion(a)).id;
    const zonaId = randomUUID();
    await a.$transaction(async (tx) => {
      await fijarEmpresa(tx, org);
      await tx.zona.create({
        data: { id: zonaId, nombre: `225 Carrera ${unico()}`, sinpeNumero: "80000000", sinpeNombre: "Titular de Prueba" },
      });
    });
    const distrito = await a.distrito.findFirstOrThrow({ select: { id: true }, orderBy: { id: "asc" } });
    try {
      await fn({ org, zonaId, distritoId: distrito.id });
    } finally {
      await a.zonaDistrito.deleteMany({ where: { zonaId } });
      await a.historialAccion.deleteMany({ where: { entidadId: zonaId } });
      await a.zona.deleteMany({ where: { id: zonaId } });
      await a.organizacion.deleteMany({ where: { id: org } });
    }
  }

  it("la desactivación va primero: el distrito que llega en el mismo instante lo rechaza el trigger", async () => {
    await conMundo(async ({ org, zonaId, distritoId }) => {
      let insercion: Promise<unknown> | null = null;
      await a.$transaction(async (tx) => {
        await fijarEmpresa(tx, org);
        await tx.$executeRawUnsafe(`UPDATE "zona" SET "activa" = false WHERE "id" = $1`, zonaId);
        insercion = b.$transaction(async (t) => {
          await fijarEmpresa(t, org);
          await t.$executeRawUnsafe(
            `INSERT INTO "zona_distrito" ("id", "zona_id", "distrito_id") VALUES ($1, $2, $3)`,
            randomUUID(),
            zonaId,
            distritoId,
          );
        });
        insercion.catch(() => undefined); // se mide abajo; aqui solo se evita el rechazo sin manejar
        await esperarA(`INSERT INTO "zona_distrito"`);
      });
      let error: unknown = null;
      await (insercion as unknown as Promise<unknown>).catch((e: unknown) => {
        error = e;
      });
      expect(traeSqlstate(error, "SL225")).toBe(true);
      expect(await a.zonaDistrito.count({ where: { zonaId } })).toBe(0);
    });
  });

  it("el distrito va primero: la desactivación espera su commit y lo cuenta como impedimento", async () => {
    await conMundo(async ({ org, zonaId, distritoId }) => {
      let desactivacion: Promise<DesactivarZonaRepoResult> | null = null;
      await b.$transaction(async (t) => {
        await fijarEmpresa(t, org);
        await t.$executeRawUnsafe(
          `INSERT INTO "zona_distrito" ("id", "zona_id", "distrito_id") VALUES ($1, $2, $3)`,
          randomUUID(),
          zonaId,
          distritoId,
        );
        desactivacion = new ZonaRepository(a).desactivar(zonaId, null);
        await esperarA(`UPDATE "public"."zona"`);
      });
      const r = await (desactivacion as unknown as Promise<DesactivarZonaRepoResult>);
      expect(bloqueada(r).distritos).toBe(1);
      expect((await a.zona.findUniqueOrThrow({ where: { id: zonaId }, select: { activa: true } })).activa).toBe(true);
    });
  });
});
