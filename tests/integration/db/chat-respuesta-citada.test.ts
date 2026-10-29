import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { ChatConversacionRepository } from "@/lib/repositories/ChatConversacionRepository";
import { ChatMensajeRepository } from "@/lib/repositories/ChatMensajeRepository";
import { WhatsappEjecucionRepository } from "@/lib/repositories/WhatsappEjecucionRepository";
import { ChatWhatsappService, type IngestaResumen } from "@/lib/services/ChatWhatsappService";
import type { WebhookMensajeEntrante } from "@/lib/types/whatsapp-webhook";
import { comoApp, crearOrganizacion, fijarEmpresa } from "../../fabricas/organizaciones";
import { crearFksDeOrden, crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import { crearEnvio, crearPlantilla } from "./_whatsapp-envios-474";
import {
  HAY_BASE_DE_DATOS,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type FksDeOrden,
  type TxDeTest,
} from "./_postgres-real";

// SLT-40 (T5; R5, R7, R9, R12, R13) — el entrante que cita un saliente con «Responder», contra
// Postgres real y con DOS empresas.
//
// POR QUE CONTRA LA BASE. Los tests unitarios del service usan fakes del repositorio: no pueden
// decir si `findHiloDeSalienteCitado` deja fuera un saliente de OTRA empresa (R13), porque ese
// filtro no esta en el `where` del repositorio sino en la extension del cliente y en la RLS
// (design §3). Tampoco si un estado terminal de la orden lo descarta de verdad (R9).
//
// COMO SE MIDE. Cada caso corre en una transaccion que SIEMPRE se revierte (`enTransaccionRevertida`,
// que ademas lo envuelve en `conEmpresa(A)`). Se siembra como dueno de las tablas, empresa por
// empresa con `fijarEmpresa`, y la ingesta corre como `servi_app` con la empresa A (`comoApp`): asi
// actua la RLS que respalda al repositorio, igual que en produccion. El repositorio recibe el `tx`
// pelado, sin la extension: lo unico que separa A de B en la ingesta es la RLS. Lo que quedo se
// mide despues como dueno (`RESET ROLE`), que ve las filas de las dos empresas.
//
// ESCENARIO BASE. En A, un mismo numero de cliente con DOS ordenes vivas asignadas: la ANTIGUA
// (`asignado_at` menor), con un hilo y un saliente, y la NUEVA, que es la que gana la regla actual
// por numero. Sin cita util el entrante va a la nueva; con cita util, al hilo de la antigua. Esa
// diferencia es la que cada caso mira.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

/** Numero local de 8 digitos propio de la corrida: ninguna otra orden de la base lo tiene. */
const LOCAL = `8${String((Date.now() % 9_000_000) + 1_000_000)}`;
/** El mismo numero como lo manda Meta y como se guarda en el hilo (E.164 sin `+`, a mano). */
const E164 = `506${LOCAL}`;
const ASIGNADA_ANTIGUA = new Date("2099-01-01T10:00:00.000Z");
const ASIGNADA_NUEVA = new Date("2099-02-01T10:00:00.000Z");
const UPDATED_AT_ENTREGA = new Date("2020-01-01T00:00:00.000Z");

function wamid(etiqueta: string): string {
  return `wamid.slt40.${etiqueta}.${randomUUID()}`;
}

interface Empresa {
  organizacionId: string;
  fks: FksDeOrden;
  mensajeroId: string;
}

interface Escenario {
  tx: TxDeTest;
  A: Empresa;
  B: Empresa;
  /** Orden antigua de A, con hilo y saliente. */
  antigua: { ordenId: string; conversacionId: string; salienteWamid: string; entranteWamid: string };
  /** Orden nueva de A: la que elige la regla actual por numero. Sin hilo sembrado. */
  nuevaOrdenId: string;
}

describeSiHayBase("SLT-40 — entrante que cita un saliente (Postgres real, dos empresas)", () => {
  let prisma: PrismaClient;
  let estatusEntregadoId: string;

  beforeAll(async () => {
    prisma = crearPrismaDeTest();
    const estatus = await prisma.orderStatus.findUnique({ where: { value: "entregado" }, select: { id: true } });
    if (estatus === null) throw new Error("falta el estado «entregado» en `order_status`: aplica las migraciones");
    estatusEntregadoId = estatus.id;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function sembrarEmpresa(tx: TxDeTest, organizacionId: string): Promise<Empresa> {
    await fijarEmpresa(tx, organizacionId);
    const fks = await crearFksDeOrden(tx);
    const mensajero = await crearUsuarioDePrueba(tx, "mensajero");
    return { organizacionId, fks, mensajeroId: mensajero.id };
  }

  async function crearOrden(
    tx: TxDeTest,
    e: Empresa,
    asignadoAt: Date,
    estatusId: string = e.fks.estatusId,
  ): Promise<string> {
    const o = await tx.orden.create({
      data: {
        numGuia: null,
        numRemision: `SLT40-${randomUUID().slice(0, 12)}`,
        destinatario: "Cliente SLT-40",
        telefonoDest: LOCAL,
        producto: "caja",
        estatusId,
        tiendaId: e.fks.tiendaId,
        zonaId: e.fks.zonaId,
        provinciaId: e.fks.provinciaId,
        cantonId: e.fks.cantonId,
        mensajeroAsignadoId: e.mensajeroId,
        asignadoAt,
      },
      select: { id: true },
    });
    return o.id;
  }

  /** Hilo de la orden con un SALIENTE y un ENTRANTE previos, cada uno con su wamid. */
  async function crearHiloConMensajes(
    tx: TxDeTest,
    ordenId: string,
    mensajeroId: string,
  ): Promise<{ conversacionId: string; salienteWamid: string; entranteWamid: string }> {
    const salienteWamid = wamid("saliente");
    const entranteWamid = wamid("entrante-previo");
    const c = await tx.chatConversacion.create({
      data: {
        ordenId,
        telefonoE164: E164,
        mensajeroId,
        mensajes: {
          create: [
            {
              direccion: "saliente",
              tipo: "texto",
              cuerpo: "Hola, voy en camino",
              waMessageId: salienteWamid,
              estado: "delivered",
              ocurridoAt: new Date("2099-01-01T11:00:00.000Z"),
            },
            {
              direccion: "entrante",
              tipo: "texto",
              cuerpo: "Gracias",
              waMessageId: entranteWamid,
              ocurridoAt: new Date("2099-01-01T11:05:00.000Z"),
            },
          ],
        },
      },
      select: { id: true },
    });
    return { conversacionId: c.id, salienteWamid, entranteWamid };
  }

  /**
   * Siembra las dos empresas y el escenario base de A; deja la transaccion con la empresa A fijada
   * y como dueno. `estatusAntigua` permite poner la orden citada en un estado terminal (R9).
   */
  async function conEscenario<T>(
    fn: (s: Escenario) => Promise<T>,
    opciones: { estatusAntigua?: () => string } = {},
  ): Promise<T> {
    return enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const [{ org }] = await tx.$queryRawUnsafe<{ org: string }[]>(
        `SELECT current_setting('app.organizacion_id', true) AS org`,
      );
      const idB = (await crearOrganizacion(tx)).id;
      const B = await sembrarEmpresa(tx, idB);
      const A = await sembrarEmpresa(tx, org);

      const antiguaId = await crearOrden(tx, A, ASIGNADA_ANTIGUA, opciones.estatusAntigua?.());
      const nuevaOrdenId = await crearOrden(tx, A, ASIGNADA_NUEVA);
      const hilo = await crearHiloConMensajes(tx, antiguaId, A.mensajeroId);

      return fn({ tx, A, B, antigua: { ordenId: antiguaId, ...hilo }, nuevaOrdenId });
    });
  }

  function entrante(citado: string | undefined): WebhookMensajeEntrante {
    return {
      waMessageId: wamid("entrante"),
      telefonoE164: E164,
      tipo: "texto",
      cuerpo: "Si, estoy en casa",
      ...(citado !== undefined ? { citadoWaMessageId: citado } : {}),
      ocurridoAt: new Date("2099-03-01T09:00:00.000Z"),
    };
  }

  /**
   * La ingesta REAL (service + repositorios reales) como la app de la empresa A: `servi_app` con la
   * RLS activa. Al volver, la transaccion queda otra vez como dueno para medir.
   */
  async function ingerirComoA(s: Escenario, mensajes: WebhookMensajeEntrante[]): Promise<IngestaResumen> {
    await comoApp(s.tx, s.A.organizacionId);
    const cliente = s.tx as unknown as PrismaClient;
    const service = new ChatWhatsappService({
      conversacionRepo: new ChatConversacionRepository(cliente),
      mensajeRepo: new ChatMensajeRepository(cliente),
    });
    const resumen = await service.ingerirEventos({ mensajes, statuses: [] });
    await s.tx.$executeRawUnsafe(`RESET ROLE`);
    return resumen;
  }

  /** Orden y empresa del hilo donde quedo el entrante con ese wamid (como dueno: ve todo). */
  async function dondeQuedo(tx: TxDeTest, waMessageId: string) {
    const filas = await tx.chatMensaje.findMany({
      where: { waMessageId },
      select: {
        direccion: true,
        organizacionId: true,
        conversacion: { select: { id: true, ordenId: true } },
      },
    });
    expect(filas).toHaveLength(1);
    return {
      direccion: filas[0].direccion,
      organizacionId: filas[0].organizacionId,
      conversacionId: filas[0].conversacion.id,
      ordenId: filas[0].conversacion.ordenId,
    };
  }

  it("R5: con dos ordenes vivas asignadas, el entrante que cita el saliente de la ANTIGUA queda en su hilo", async () => {
    const r = await conEscenario(async (s) => {
      const conCita = entrante(s.antigua.salienteWamid);
      // Contrapeso en el mismo lote: sin cita, el mismo numero va a la NUEVA. Sin esto, «quedo en
      // la antigua» pasaria tambien si la regla actual eligiera la antigua por si sola.
      const sinCita = entrante(undefined);
      const resumen = await ingerirComoA(s, [conCita, sinCita]);
      return {
        s,
        resumen,
        conCita: await dondeQuedo(s.tx, conCita.waMessageId),
        sinCita: await dondeQuedo(s.tx, sinCita.waMessageId),
        ultimoEntranteAntigua: (
          await s.tx.chatConversacion.findUniqueOrThrow({
            where: { id: s.antigua.conversacionId },
            select: { ultimoEntranteAt: true },
          })
        ).ultimoEntranteAt,
      };
    });

    expect(r.resumen).toMatchObject({ mensajesRegistrados: 2, sinResolver: 0, enrutadosPorCita: 1 });
    expect(r.conCita).toEqual({
      direccion: "entrante",
      organizacionId: r.s.A.organizacionId,
      conversacionId: r.s.antigua.conversacionId,
      ordenId: r.s.antigua.ordenId,
    });
    expect(r.sinCita.ordenId).toBe(r.s.nuevaOrdenId);
    expect(r.sinCita.conversacionId).not.toBe(r.s.antigua.conversacionId);
    // R14 de paso: la ventana de 24 h se abre en el hilo citado.
    expect(r.ultimoEntranteAntigua?.toISOString()).toBe("2099-03-01T09:00:00.000Z");
  });

  it("R9: la orden citada en estado terminal (entregado) y no eliminada se enruta por cita igual", async () => {
    const r = await conEscenario(
      async (s) => {
        // Autocomprobacion: la orden citada de verdad esta en `entregado` y viva.
        const citada = await s.tx.orden.findUniqueOrThrow({
          where: { id: s.antigua.ordenId },
          select: { estatusId: true, deletedAt: true },
        });
        const m = entrante(s.antigua.salienteWamid);
        const resumen = await ingerirComoA(s, [m]);
        return { s, citada, resumen, quedo: await dondeQuedo(s.tx, m.waMessageId) };
      },
      { estatusAntigua: () => estatusEntregadoId },
    );

    expect(r.citada).toEqual({ estatusId: estatusEntregadoId, deletedAt: null });
    expect(r.resumen).toMatchObject({ mensajesRegistrados: 1, enrutadosPorCita: 1 });
    expect(r.quedo.conversacionId).toBe(r.s.antigua.conversacionId);
    expect(r.quedo.ordenId).toBe(r.s.antigua.ordenId);
  });

  it("R7: un id citado que es de un ENTRANTE no cuenta como cita y cae en la regla actual", async () => {
    const r = await conEscenario(async (s) => {
      const m = entrante(s.antigua.entranteWamid);
      const resumen = await ingerirComoA(s, [m]);
      return { s, resumen, quedo: await dondeQuedo(s.tx, m.waMessageId) };
    });

    expect(r.resumen).toMatchObject({ mensajesRegistrados: 1, sinResolver: 0, enrutadosPorCita: 0 });
    expect(r.quedo.ordenId).toBe(r.s.nuevaOrdenId);
    expect(r.quedo.conversacionId).not.toBe(r.s.antigua.conversacionId);
  });

  it("R12: un id citado igual al wa_message_id de una entrega automatica cae en la regla actual y la entrega no cambia", async () => {
    const r = await conEscenario(async (s) => {
      // Una entrega aceptada de un envio automatico de A, con un `updated_at` viejo y fijo: si la
      // ingesta la tocara por Prisma (`@updatedAt`) o por SQL, cambiaria.
      const wamidEntrega = wamid("entrega");
      const plantilla = await crearPlantilla(s.tx);
      const envioId = await crearEnvio(s.tx, { plantillaId: plantilla.id });
      const ejecucion = await new WhatsappEjecucionRepository(s.tx as unknown as PrismaClient).insertarProgramada({
        envioId,
        fechaCr: "2099-05-01",
        instanteProgramado: new Date("2099-05-01T11:00:00Z"),
      });
      const entregaId = randomUUID();
      await s.tx.$executeRawUnsafe(
        `INSERT INTO "whatsapp_envio_entrega"
           ("id","ejecucion_id","usuario_id","destinatario_nombre","telefono","estado","wa_message_id","intentos","updated_at","enviada_at")
         VALUES ($1,$2,$3,'Cliente SLT-40',$4,'aceptada'::"whatsapp_entrega_estado",$5,1,$6,$6)`,
        entregaId,
        ejecucion.id,
        s.A.mensajeroId,
        E164,
        wamidEntrega,
        UPDATED_AT_ENTREGA,
      );
      const leerEntrega = () =>
        s.tx.whatsappEnvioEntrega.findUniqueOrThrow({
          where: { id: entregaId },
          select: { estado: true, updatedAt: true, waMessageId: true, motivo: true, intentos: true, enviadaAt: true },
        });
      const contarEnvios = async () => {
        const [f] = await s.tx.$queryRawUnsafe<{ entregas: number; ejecuciones: number }[]>(
          `SELECT (SELECT count(*)::int FROM "whatsapp_envio_entrega") AS entregas,
                  (SELECT count(*)::int FROM "whatsapp_envio_ejecucion") AS ejecuciones`,
        );
        return f;
      };
      const antes = await leerEntrega();
      const conteosAntes = await contarEnvios();
      // Autocomprobacion: el wamid citado NO esta en `chat_mensaje` (si lo estuviera, el caso
      // mediria otra cosa).
      const enChat = await s.tx.chatMensaje.count({ where: { waMessageId: wamidEntrega } });

      const m = entrante(wamidEntrega);
      const resumen = await ingerirComoA(s, [m]);
      return {
        s,
        resumen,
        enChat,
        antes,
        despues: await leerEntrega(),
        conteosAntes,
        conteosDespues: await contarEnvios(),
        quedo: await dondeQuedo(s.tx, m.waMessageId),
      };
    });

    expect(r.enChat).toBe(0);
    expect(r.antes.estado).toBe("aceptada");
    expect(r.antes.updatedAt.toISOString()).toBe(UPDATED_AT_ENTREGA.toISOString());
    expect(r.resumen).toMatchObject({ mensajesRegistrados: 1, enrutadosPorCita: 0 });
    expect(r.quedo.ordenId).toBe(r.s.nuevaOrdenId);
    expect(r.despues).toEqual(r.antes);
    expect(r.conteosDespues).toEqual(r.conteosAntes);
  });

  it("R13: un saliente de la empresa B con el wamid citado no enruta: nada se escribe en B y A sigue la regla actual", async () => {
    const r = await conEscenario(async (s) => {
      // En B, el MISMO numero con su orden, su hilo y el saliente que el entrante va a citar.
      await fijarEmpresa(s.tx, s.B.organizacionId);
      const ordenB = await crearOrden(s.tx, s.B, ASIGNADA_NUEVA);
      const hiloB = await crearHiloConMensajes(s.tx, ordenB, s.B.mensajeroId);
      await fijarEmpresa(s.tx, s.A.organizacionId);

      const fotoDeB = async () => ({
        mensajes: await s.tx.chatMensaje.count({ where: { organizacionId: s.B.organizacionId } }),
        hilos: await s.tx.chatConversacion.count({ where: { organizacionId: s.B.organizacionId } }),
        hilo: await s.tx.chatConversacion.findUniqueOrThrow({
          where: { id: hiloB.conversacionId },
          select: { ultimoEntranteAt: true, mensajeroId: true, updatedAt: true },
        }),
      });
      // Autocomprobacion como dueno: el saliente citado EXISTE, es saliente y es de B.
      const citado = await s.tx.chatMensaje.findFirstOrThrow({
        where: { waMessageId: hiloB.salienteWamid },
        select: { direccion: true, organizacionId: true },
      });
      const antesB = await fotoDeB();

      const m = entrante(hiloB.salienteWamid);
      const resumen = await ingerirComoA(s, [m]);
      return { s, citado, resumen, antesB, despuesB: await fotoDeB(), quedo: await dondeQuedo(s.tx, m.waMessageId) };
    });

    expect(r.citado).toEqual({ direccion: "saliente", organizacionId: r.s.B.organizacionId });
    expect(r.resumen).toMatchObject({ mensajesRegistrados: 1, sinResolver: 0, enrutadosPorCita: 0 });
    expect(r.despuesB).toEqual(r.antesB);
    expect(r.quedo.organizacionId).toBe(r.s.A.organizacionId);
    expect(r.quedo.ordenId).toBe(r.s.nuevaOrdenId);
  });
});
