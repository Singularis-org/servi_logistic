import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { corregirDatosCliente } from "@/lib/actions/corregir-datos-cliente";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import { ChatConversacionRepository } from "@/lib/repositories/ChatConversacionRepository";
import { MENSAJE_PAIS_SIN_TELEFONO } from "@/lib/services/CorregirDatosClienteService";
import { construirReglasPaisEmpresa } from "@/lib/services/ReglasPaisEmpresaService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { fijarEmpresa } from "@/tests/fabricas/organizaciones";
import {
  crearGeografiaDePrueba,
  crearOrganizacionEnPais,
  crearPaisDePrueba,
  crearTipoDocumentoDePrueba,
  type CodigoPaisDePrueba,
} from "@/tests/fabricas/paises";

import {
  HAY_BASE_DE_DATOS,
  clienteConTransaccionAnidada,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";

// SLT-42 (decision 6 tras la tanda 2b) — LA RUTA REAL de corregir datos contra Postgres: la Server
// Action `corregirDatosCliente` SIN `deps.service`, o sea su `buildService()` con los repositorios
// reales y `construirReglasPaisEmpresa(prisma)`. Hasta aqui solo el typecheck cubria ese cableado.
//
// `getPrismaClient` se redirige a la transaccion del test (patron de
// `picking-ordenes-en-preparacion.test.ts`): el SQL es el real y el rollback se lleva todo.
//
// Los datos son PROPIOS: un pais de prueba con su prefijo, una empresa en ese pais y su geografia,
// zona, tienda y orden. Ninguna fila se toma de otra empresa.
//
// Lo que se mide:
//  · con el pais completo (prefijo `599`, 7 digitos), el telefono corregido queda en la orden y,
//    con las reglas que la ruta lee de la base, se resuelve con el prefijo de ESE pais;
//  · con el pais incompleto, la ruta real devuelve `fieldErrors.telefonoDest` con el texto propio
//    y no escribe. Si `buildService()` no cableara las reglas del pais de la empresa, este caso
//    no saldria.
//
// ⚠️ Sin base, `describe.skip` visible.

const cliente = vi.hoisted(() => ({ actual: null as unknown }));

vi.mock("@/lib/db/prisma-client", async (original) => {
  const real = await original<typeof import("@/lib/db/prisma-client")>();
  return {
    ...real,
    getPrismaClient: () => {
      if (cliente.actual === null) throw new Error("SLT-42: cliente de test no fijado");
      return cliente.actual;
    },
  };
});

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const MAESTRO: Actor = { usuarioId: "u-maestro", rol: "maestro" };

/** Siete digitos propios de esta corrida, sin ceros a la izquierda. */
const SIETE = (Date.now() % 8_000_000) + 1_000_000;
const TELEFONO_VIEJO = `5${SIETE}`.slice(0, 7);
const TELEFONO_NUEVO = `6${SIETE}`.slice(0, 7);

interface Siembra {
  organizacionId: string;
  ordenId: string;
}

/**
 * Pais de prueba, empresa en ese pais (fijada para el resto de la tx), su geografia, una zona, una
 * tienda y una orden en reparto con mensajero, con `TELEFONO_VIEJO`.
 */
async function sembrar(
  tx: TxDeTest,
  codigo: CodigoPaisDePrueba,
  telefono: { prefijoTelefonico: string | null; telefonoDigitosNacionales: number | null },
): Promise<Siembra> {
  const pais = await crearPaisDePrueba(tx, codigo, { ...telefono, zonaHoraria: "America/Curacao" });
  const org = await crearOrganizacionEnPais(tx, pais.id);
  await fijarEmpresa(tx, org.id);

  const geo = await crearGeografiaDePrueba(tx, pais.id);
  const tipo = await crearTipoDocumentoDePrueba(tx, pais.id, { clave: "doc" });
  const rol = await tx.rol.findFirst({ where: { value: "adminTienda" }, select: { id: true } });
  if (rol === null) throw new Error("SLT-42: el catalogo `rol` no tiene `adminTienda`. Corre el seed.");
  const estatus = await tx.orderStatus.findFirst({ where: { value: "en_reparto" }, select: { id: true } });
  if (estatus === null) throw new Error("SLT-42: el catalogo `order_status` no tiene `en_reparto`. Corre el seed.");

  const sufijo = `slt42-${org.id.slice(0, 8)}`;
  const zona = await tx.zona.create({
    data: { nombre: `Zona ${sufijo}`, sinpeNumero: "88880000", sinpeNombre: "Prueba SLT-42" },
    select: { id: true },
  });
  const tienda = await tx.usuario.create({
    data: {
      nombre: `Tienda ${sufijo}`,
      email: `${sufijo}@tienda.invalid`,
      telefono: "1234567",
      passwordHash: "x",
      cedula: "12345678",
      tipoIdentificacionId: tipo.id,
      rolId: rol.id,
      estado: "activo",
    },
    select: { id: true },
  });
  const orden = await tx.orden.create({
    data: {
      numRemision: `R-${sufijo}`,
      destinatario: "Ana Peres",
      telefonoDest: TELEFONO_VIEJO,
      producto: "caja de zapatos",
      direccion: "Calle 1",
      estatusId: estatus.id,
      tiendaId: tienda.id,
      zonaId: zona.id,
      provinciaId: geo.provinciaId,
      cantonId: geo.cantonId,
      distritoId: geo.distritoId,
      mensajeroAsignadoId: tienda.id,
      asignadoAt: new Date("2026-11-04T15:00:00.000Z"),
    },
    select: { id: true },
  });
  return { organizacionId: org.id, ordenId: orden.id };
}

/** La tx del test como el cliente de `getPrismaClient`, y `fn` en el contexto de la empresa sembrada. */
async function enLaRutaReal<T>(
  prisma: PrismaClient,
  codigo: CodigoPaisDePrueba,
  telefono: { prefijoTelefonico: string | null; telefonoDigitosNacionales: number | null },
  fn: (ctx: { tx: PrismaClient; s: Siembra }) => Promise<T>,
): Promise<T> {
  return enTransaccionRevertida(prisma, async (tx) => {
    await serializarEscriturasReales(tx);
    const s = await sembrar(tx, codigo, telefono);
    const anidado = clienteConTransaccionAnidada(tx);
    cliente.actual = anidado;
    try {
      return await conEmpresa(s.organizacionId, () => fn({ tx: anidado, s }));
    } finally {
      cliente.actual = null;
    }
  });
}

describeSiHayBase("SLT-42 — corregir datos por la ruta real (buildService + construirReglasPaisEmpresa)", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("R18: corrige el telefono y queda resoluble con el prefijo del pais de la empresa", async () => {
    const r = await enLaRutaReal(
      prisma,
      "XS",
      { prefijoTelefonico: "599", telefonoDigitosNacionales: 7 },
      async ({ tx, s }) => {
        const chat = new ChatConversacionRepository(tx);
        // Las reglas salen de la base por la misma fabrica que usa `buildService()`.
        const reglas = await construirReglasPaisEmpresa().deLaEmpresa();
        if (reglas.telefono === null) throw new Error("SLT-42: el pais sembrado deberia estar completo");
        // ANTI-VACUIDAD: antes de corregir, el numero nuevo con el prefijo del pais no es de esta orden.
        const antes = await chat.resolverOrdenActivaPorNumero(`599${TELEFONO_NUEVO}`, reglas.telefono);

        const resultado = await corregirDatosCliente(
          { ordenId: s.ordenId, telefonoDest: TELEFONO_NUEVO },
          { getActor: async () => MAESTRO },
        );

        const guardada = await tx.orden.findUnique({ where: { id: s.ordenId }, select: { telefonoDest: true } });
        const despues = await chat.resolverOrdenActivaPorNumero(`599${TELEFONO_NUEVO}`, reglas.telefono);
        return { reglas, antes, resultado, guardada, despues, ordenId: s.ordenId };
      },
    );

    expect(r.reglas).toMatchObject({ paisId: "XS", telefono: { prefijo: "599", digitosNacionales: 7 } });
    expect(r.antes?.ordenId).not.toBe(r.ordenId);
    expect(r.resultado).toMatchObject({ status: "ok", cambios: ["telefonoDest"] });
    // Se guarda tal cual (312/R17); el prefijo lo pone la normalizacion del pais al resolver.
    expect(r.guardada?.telefonoDest).toBe(TELEFONO_NUEVO);
    expect(r.despues?.ordenId).toBe(r.ordenId);
  });

  it("R6: con el pais sin prefijo ni digitos devuelve fieldErrors.telefonoDest y no escribe", async () => {
    const r = await enLaRutaReal(
      prisma,
      "XT",
      { prefijoTelefonico: null, telefonoDigitosNacionales: null },
      async ({ tx, s }) => {
        const resultado = await corregirDatosCliente(
          { ordenId: s.ordenId, telefonoDest: TELEFONO_NUEVO },
          { getActor: async () => MAESTRO },
        );
        const guardada = await tx.orden.findUnique({ where: { id: s.ordenId }, select: { telefonoDest: true } });
        return { resultado, guardada };
      },
    );

    expect(r.resultado).toEqual({
      status: "validation_error",
      fieldErrors: { telefonoDest: [MENSAJE_PAIS_SIN_TELEFONO] },
    });
    expect(r.guardada?.telefonoDest).toBe(TELEFONO_VIEJO);
  });
});
