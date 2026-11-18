import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { ORDEN_MODULOS } from "@/lib/modulos/catalogo";
import { GeoRepository } from "@/lib/repositories/GeoRepository";
import { datosDeOrganizacionDePrueba, fijarEmpresa } from "@/tests/fabricas/organizaciones";
import { crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import { sqlstateDe } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, bajoLockDeEscrituraReal, crearPrismaDeTest } from "./_postgres-real";

// SLT-48 (P1; review vuelta 1, hallazgo 5) — LA CARRERA ENTRE `mover` Y UNA ORDEN NUEVA EN EL SUBARBOL,
// con dos conexiones contra Postgres.
//
// `mover` cuenta las ordenes abiertas que cambiarian de grupo o de marca (P1) y, si no hay, mueve. Sin
// bloqueo, una orden escrita a la vez en el subarbol se colaba entre el conteo y el movimiento: quedaba
// abierta, con la marca cambiada, sin haber entrado en P1. El arreglo (`bloquearNodos`) bloquea el
// subarbol `FOR UPDATE` antes de contar; la FK de la orden toma `FOR KEY SHARE` del nodo y choca.
// Desde la review vuelta 2, `mover` calcula P1 sin bloqueos y, ya con ellos, vuelve a mirar solo las
// ordenes nuevas (`confirmarP1`); la espera la corta su propio `lock_timeout` (`TOPE_MOVER_MS`), y
// `geografia-mover-nodo-cede.test.ts` prueba ese tope.
//
// La carrera es con un DESCENDIENTE del nodo que se mueve. En el propio nodo ya no habia hueco: el
// `UPDATE` de `padre_id` cambia una columna del unico `(padre_id, nombre_normalizado)`, asi que toma
// `FOR UPDATE` de esa fila y la FK de la orden ya chocaba con el (medido: con la orden en el nodo
// movido, el caso salia verde sin el arreglo).
//
// El caso: la transaccion A escribe una orden abierta en Centro (hereda la marca de Norte) y NO confirma.
// `mover` (conexion B) intenta llevar Alto, el padre de Centro, de Norte a Sur, donde no hay marca:
//   - con el arreglo, `mover` espera a A. Para no tener que esperar a ciegas, la conexion de `mover` lleva
//     un `lock_timeout` corto: la espera acaba en 55P03 y nada se mueve. Al confirmar A, un segundo
//     `mover` cuenta la orden y se bloquea (P1);
//   - sin el arreglo (comprobado al escribir este test), el primer `mover` devuelve `movido` sin esperar,
//     y la orden de A queda abierta con la marca cambiada.
//
// Lo de la carrera tiene que estar CONFIRMADO para que la otra conexion lo vea: el pais `XM` y su empresa
// se commitean bajo el lock de escrituras reales y se borran en un `finally` (el `afterAll` exige que no
// quede nada). `XM` no lo usa ninguna otra suite.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const PAIS = "XM";

let base: PrismaClient;

const INSERTAR_ORDEN = `INSERT INTO orden (id, num_remision, estatus_id, destinatario, telefono_dest, direccion, tienda_id,
    zona_id, nodo_geografico_id, monto_cobrar, producto, created_at, updated_at)
  VALUES ($1, $2, $3, 'Destinatario SLT-48', '70704848', 'Direccion SLT-48', $4, $5, $6, 12000, 'caja', now(), now())`;

interface Sembrado {
  organizacionId: string;
  organizacionNombre: string;
  tiendaId: string;
  zonaId: string;
  estatusId: string;
  norteAlto: string;
  centro: string;
  norte: string;
  sur: string;
}

/** Todo lo del pais `XM`, en el orden de las FK. Los nodos, de la hoja a la raiz. */
async function limpiar(): Promise<void> {
  const orgs = (await base.organizacion.findMany({ where: { paisId: PAIS }, select: { id: true } })).map((o) => o.id);
  for (const tabla of ["orden", "distrito_zona_especial", "zona", "usuario", "organizacion_modulo"]) {
    await base.$executeRawUnsafe(`DELETE FROM "${tabla}" WHERE "organizacion_id" = ANY($1::text[])`, orgs);
  }
  await base.$executeRawUnsafe(`DELETE FROM "organizacion" WHERE "id" = ANY($1::text[])`, orgs);
  await base.$executeRawUnsafe(`DELETE FROM "historial_plataforma" WHERE "pais_id" = $1`, PAIS);
  for (let profundidad = 3; profundidad >= 1; profundidad--) {
    await base.$executeRawUnsafe(`DELETE FROM "nodo_geografico" WHERE "pais_id" = $1 AND "profundidad" = $2`, PAIS, profundidad);
  }
  await base.$executeRawUnsafe(`DELETE FROM "pais" WHERE "id" = $1`, PAIS); // los tipos se van en cascada
}

/** Norte › Alto › Centro y Sur; una empresa del pais con la marca de zona especial en Norte. */
async function sembrar(): Promise<Sembrado> {
  return base.$transaction(async (tx) => {
    await tx.pais.create({
      data: {
        id: PAIS,
        nombre: "Pais de la carrera de mover",
        nivel1Singular: "Región",
        nivel1Plural: "Regiones",
        nivel2Singular: "Comuna",
        nivel2Plural: "Comunas",
        nivel3Singular: "Barrio",
        nivel3Plural: "Barrios",
      },
    });
    const tipos = await tx.tipoNivelGeografico.findMany({ where: { paisId: PAIS }, select: { id: true, clave: true } });
    const tipoDe = (p: number) => {
      const t = tipos.find((x) => x.clave === `nivel_${p}`);
      if (t === undefined) throw new Error(`${PAIS} sin nivel_${p}`);
      return t.id;
    };
    const nodo = async (nombre: string, profundidad: number, padreId: string | null) =>
      (
        await tx.nodoGeografico.create({
          data: { paisId: PAIS, tipoId: tipoDe(profundidad), padreId, profundidad, nombre, nombreNormalizado: "lo pisa el trigger" },
          select: { id: true },
        })
      ).id;
    const norte = await nodo("Norte", 1, null);
    const norteAlto = await nodo("Alto", 2, norte);
    const centro = await nodo("Centro", 3, norteAlto);
    const sur = await nodo("Sur", 1, null);


    const org = await tx.organizacion.create({
      data: { ...datosDeOrganizacionDePrueba(), paisId: PAIS },
      select: { id: true, nombre: true },
    });
    await tx.organizacionModulo.createMany({ data: ORDEN_MODULOS.map((modulo) => ({ organizacionId: org.id, modulo })) });
    await fijarEmpresa(tx, org.id);
    const tienda = await crearUsuarioDePrueba(tx, "adminTienda");
    const zona = await tx.zona.create({
      data: { nombre: `Zona carrera ${randomUUID().slice(0, 8)}`, esCentral: false, sinpeNumero: "80000000", sinpeNombre: "Titular" },
      select: { id: true },
    });
    // La marca, heredada por Centro desde Norte: llevar Centro bajo Sur se la quita (P1).
    await tx.distritoZonaEspecial.create({ data: { distritoId: norte } });
    const estatus = await tx.orderStatus.findUniqueOrThrow({ where: { value: "en_preparacion" }, select: { id: true } });
    return {
      organizacionId: org.id,
      organizacionNombre: org.nombre,
      tiendaId: tienda.id,
      zonaId: zona.id,
      estatusId: estatus.id,
      norteAlto,
      centro,
      norte,
      sur,
    };
  });
}

/**
 * El cliente de `mover` con `lock_timeout` en cada transaccion: si `mover` espera un bloqueo, la espera
 * acaba en 55P03 en vez de colgar el test. Solo cambia `$transaction`; lo demas va al cliente tal cual.
 */
function conEsperaCorta(cliente: PrismaClient): PrismaClient {
  return new Proxy(cliente, {
    get(objetivo, prop) {
      if (prop === "$transaction") {
        return (fn: (tx: unknown) => Promise<unknown>, opciones?: object) =>
          objetivo.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '1500ms'`);
            return fn(tx);
          }, opciones);
      }
      const valor = Reflect.get(objetivo, prop) as unknown;
      return typeof valor === "function" ? (valor as (...a: unknown[]) => unknown).bind(objetivo) : valor;
    },
  });
}

describeSiHayBase("SLT-48 P1 — la carrera entre mover y una orden nueva en el subarbol (dos conexiones)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    const residuos = await base?.pais.count({ where: { id: PAIS } });
    await base?.$disconnect();
    expect(residuos).toBe(0);
  });

  it("una orden abierta que se escribe a la vez hace esperar a mover; al confirmarse, entra en el conteo y el movimiento se bloquea", async () => {
    const [clienteOrden, clienteMover] = [crearPrismaDeTest(), crearPrismaDeTest()];
    const r = await bajoLockDeEscrituraReal(async () => {
      try {
        await limpiar(); // por si una corrida anterior murio a mitad
        const s = await sembrar();
        const datos = { id: s.norteAlto, padreIdNuevo: s.sur, padreIdAnterior: s.norte };
        const geo = new GeoRepository(conEsperaCorta(clienteMover));
        const ordenId = randomUUID();

        // A: escribe la orden y se queda abierta hasta que `mover` haya terminado su primer intento.
        let escrita!: () => void;
        const ordenEscrita = new Promise<void>((ok) => (escrita = ok));
        let confirmar!: () => void;
        const puedeConfirmar = new Promise<void>((ok) => (confirmar = ok));
        const transaccionOrden = clienteOrden.$transaction(
          async (tx) => {
            await fijarEmpresa(tx, s.organizacionId);
            await tx.$executeRawUnsafe(INSERTAR_ORDEN, ordenId, `SLT48-${ordenId.slice(0, 8)}`, s.estatusId, s.tiendaId, s.zonaId, s.centro);
            escrita();
            await puedeConfirmar;
          },
          { timeout: 30_000 },
        );
        // Si A falla antes de escribir, que el test no espere para siempre.
        await Promise.race([ordenEscrita, transaccionOrden]);

        let primero: unknown;
        try {
          primero = await geo.mover(datos, null);
        } catch (e) {
          primero = { error: sqlstateDe(e) };
        } finally {
          confirmar();
        }
        await transaccionOrden;

        const padreTrasPrimero = (await base.nodoGeografico.findUniqueOrThrow({ where: { id: s.norteAlto }, select: { padreId: true } })).padreId;
        const segundo = await geo.mover(datos, null);
        return { primero, segundo, padreTrasPrimero, s };
      } finally {
        await limpiar();
        await Promise.all([clienteOrden.$disconnect(), clienteMover.$disconnect()]);
      }
    });

    // `mover` espero a la orden en vuelo (55P03 por el `lock_timeout` del test) y no movio nada.
    expect(r.primero).toEqual({ error: "55P03" });
    expect(r.padreTrasPrimero).toBe(r.s.norte);
    // Confirmada la orden, `mover` la cuenta: P1 bloquea con esa orden y su empresa.
    expect(r.segundo).toEqual({
      estado: "bloqueado",
      bloqueo: { ordenes: 1, empresas: [{ id: r.s.organizacionId, nombre: r.s.organizacionNombre, ordenes: 1 }] },
    });
  }, 60_000);
});
