import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { comoPlataforma, conEmpresa } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import type { CreateUsuarioInput } from "@/lib/interfaces/repositories/IUserRepository";
import { UserRepository } from "@/lib/repositories/UserRepository";
import { comoApp, datosDeOrganizacionDePrueba } from "../../fabricas/organizaciones";
import { HAY_BASE_DE_DATOS, bajoLockDeEscrituraReal, crearPrismaDeTest } from "./_postgres-real";

// SLT-221 (T2.3; R1611, R1615, R1616, R1622, R1624, R1625, R1630) — los accesos de `UserRepository` a
// `usuario_cambio_correo`, contra Postgres real y con el cliente EXTENDIDO de la app (filtro de
// empresa + RLS), como `aislamiento-usuarios`. No cabe en una transacción revertida: el repositorio
// abre su `$transaction` y la concurrencia (R1625) necesita dos conexiones. Los datos se commitean con
// un sufijo único y se borran en el `afterAll`; lo que quedó se mide con el cliente BASE.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;
const RUN = randomUUID().replace(/-/g, "").slice(0, 10);
const LOGIN = { ficha: "SL-17", motivo: "login" } as const;

let base: PrismaClient;
let repo: UserRepository;
let orgA = "";
let orgB = "";
let rolMaestro = "";
let tipoCedula = "";
let maestroA = "";
let maestroB = "";
let n = 0;

function datos(tag: string): CreateUsuarioInput {
  return {
    nombre: `Persona ${tag} ${RUN}`,
    email: `cc-${tag}-${RUN}@ejemplo.test`,
    telefono: "88887777",
    cedula: `cc${tag}${RUN}`,
    tipoIdentificacionId: tipoCedula,
    rolId: rolMaestro,
    passwordHash: "no-utilizable",
    estado: "activo",
  };
}

/** Un usuario nuevo en `org`, por el repositorio real. */
async function sembrar(org: string): Promise<{ id: string; email: string }> {
  const tag = `u${++n}`;
  const d = datos(tag);
  const id = await conEmpresa(org, async () => (await repo.create(d, null)).id);
  return { id, email: d.email };
}

const enA = <T>(fn: () => Promise<T>) => conEmpresa(orgA, fn);
const enB = <T>(fn: () => Promise<T>) => conEmpresa(orgB, fn);
const enUnaHora = () => new Date(Date.now() + 3_600_000);
const correoNuevo = (tag: string) => `nuevo-${tag}-${RUN}@ejemplo.test`;

function abrirEnA(usuarioId: string, emailNuevo: string, expiraAt = enUnaHora()) {
  return enA(() =>
    repo.abrirCambioCorreo({ usuarioId, emailNuevo, secretoHash: "hash-de-prueba", solicitadoPorId: maestroA, expiraAt }),
  );
}

function filasDeCorreo(usuarioId: string) {
  return base.historialAccion.findMany({
    where: { entidadId: usuarioId, accion: "usuario_email_cambiado" },
    select: { valorAnterior: true, valorNuevo: true, actorUsuarioId: true, organizacionId: true, entidadTipo: true },
  });
}

describeSiHayBase("SLT-221 — el cambio de correo pendiente (Postgres real)", () => {
  beforeAll(async () => {
    base = crearPrismaDeTest();
    repo = new UserRepository(conAislamientoPorEmpresa(base, async () => null));
    await bajoLockDeEscrituraReal(async () => {
      [orgA, orgB] = await Promise.all(
        [datosDeOrganizacionDePrueba(`CCA ${RUN}`), datosDeOrganizacionDePrueba(`CCB ${RUN}`)].map(
          async (d) => (await base.organizacion.create({ data: d, select: { id: true } })).id,
        ),
      );
      rolMaestro = (await base.rol.findFirstOrThrow({ where: { value: "maestro" } })).id;
      tipoCedula = (await base.tipoIdentificacion.findFirstOrThrow({ where: { value: "cedula" } })).id;
      maestroA = (await sembrar(orgA)).id;
      maestroB = (await sembrar(orgB)).id;
    });
    // Sin la siembra el archivo no prueba nada: falla aquí y no en verde vacío.
    expect(await base.usuario.count({ where: { id: { in: [maestroA, maestroB] } } })).toBe(2);
  }, 120_000);

  afterAll(async () => {
    if (!base) return;
    const orgs = [orgA, orgB].filter(Boolean);
    await bajoLockDeEscrituraReal(async () => {
      await base.usuarioCambioCorreo.deleteMany({ where: { organizacionId: { in: orgs } } });
      await base.historialAccion.deleteMany({ where: { organizacionId: { in: orgs } } });
      await base.usuario.deleteMany({ where: { organizacionId: { in: orgs } } });
      await base.organizacion.deleteMany({ where: { id: { in: orgs } } });
    });
    await base.$disconnect();
  }, 120_000);

  it("R1611: `existeEmailEnEmpresa` choca con otro usuario de la empresa, no consigo mismo ni con otra empresa", async () => {
    const r = await bajoLockDeEscrituraReal(async () => {
      const a1 = await sembrar(orgA);
      const a2 = await sembrar(orgA);
      const b1 = await sembrar(orgB);
      return {
        otroDeLaEmpresa: await enA(() => repo.existeEmailEnEmpresa(a2.email, a1.id)),
        elMismo: await enA(() => repo.existeEmailEnEmpresa(a1.email, a1.id)),
        deOtraEmpresa: await enA(() => repo.existeEmailEnEmpresa(b1.email, a1.id)),
        libre: await enA(() => repo.existeEmailEnEmpresa(correoNuevo("libre"), a1.id)),
      };
    });
    expect(r).toEqual({ otroDeLaEmpresa: true, elMismo: false, deOtraEmpresa: false, libre: false });
  });

  it("R1616: un solo pendiente abierto por usuario; abrir otro anula el anterior, y el índice lo exige", async () => {
    const r = await bajoLockDeEscrituraReal(async () => {
      const a1 = await sembrar(orgA);
      const primero = await abrirEnA(a1.id, correoNuevo("p1"));
      const segundo = await abrirEnA(a1.id, correoNuevo("p2"));
      const filas = await base.usuarioCambioCorreo.findMany({
        where: { usuarioId: a1.id },
        select: { id: true, anuladoAt: true, confirmadoAt: true, emailNuevo: true },
      });
      // El índice parcial, sin pasar por el repositorio: un segundo abierto a mano aborta.
      const directo = await base.usuarioCambioCorreo
        .create({
          data: {
            organizacionId: orgA,
            usuarioId: a1.id,
            emailNuevo: correoNuevo("p3"),
            secretoHash: "h",
            solicitadoPorId: maestroA,
            expiraAt: enUnaHora(),
          },
        })
        .then(
          () => "creado",
          (e: { code?: string }) => e.code,
        );
      const abierto = await enA(() => repo.cambioCorreoAbierto(a1.id));
      return { primero, segundo, filas, directo, abierto };
    });
    expect(r.filas).toHaveLength(2);
    const primero = r.filas.find((f) => f.id === r.primero.id);
    const segundo = r.filas.find((f) => f.id === r.segundo.id);
    expect(primero?.anuladoAt).toBeInstanceOf(Date);
    expect(segundo?.anuladoAt).toBeNull();
    expect(r.directo).toBe("P2002");
    expect(r.abierto).toEqual({ id: r.segundo.id, emailNuevo: correoNuevo("p2"), expiraAt: r.segundo.expiraAt });
  });

  it("R1619/R1617: anular el abierto del usuario, y anular un pendiente por su id, solo tocan el suyo", async () => {
    const r = await bajoLockDeEscrituraReal(async () => {
      const a1 = await sembrar(orgA);
      const a2 = await sembrar(orgA);
      const p1 = await abrirEnA(a1.id, correoNuevo("an1"));
      const p2 = await abrirEnA(a2.id, correoNuevo("an2"));
      await enA(() => repo.anularCambioCorreoAbierto(a1.id));
      const tras1 = { a1: await enA(() => repo.cambioCorreoAbierto(a1.id)), a2: await enA(() => repo.cambioCorreoAbierto(a2.id)) };
      await enA(() => repo.anularCambioCorreo(p2.id));
      const tras2 = await enA(() => repo.cambioCorreoAbierto(a2.id));
      return { p1, tras1, tras2 };
    });
    expect(r.tras1.a1).toBeNull();
    expect(r.tras1.a2?.emailNuevo).toBe(correoNuevo("an2"));
    expect(r.tras2).toBeNull();
  });

  it("R1630: el pendiente de A no se ve ni se anula desde B (filtro y RLS)", async () => {
    const r = await bajoLockDeEscrituraReal(async () => {
      const a1 = await sembrar(orgA);
      const p = await abrirEnA(a1.id, correoNuevo("rls"));
      const desdeB = {
        abierto: await enB(() => repo.cambioCorreoAbierto(a1.id)),
        empresa: await enB(() => repo.empresaDelCambioCorreo(p.id)),
        canje: await enB(() => repo.cambioCorreoParaCanje(p.id)),
        aplicar: await enB(() => repo.aplicarCambioCorreo(p.id)),
      };
      await enB(() => repo.anularCambioCorreoAbierto(a1.id));
      await enB(() => repo.anularCambioCorreo(p.id));
      const sigueAbierto = await enA(() => repo.cambioCorreoAbierto(a1.id));
      // La política sola, sin el filtro de la extensión: `servi_app` con la empresa B no ve la fila.
      const contar = (org: string) =>
        base.$transaction(async (tx) => {
          await comoApp(tx, org);
          const filas = await tx.$queryRawUnsafe<{ n: bigint }[]>(
            `SELECT count(*) AS n FROM "usuario_cambio_correo" WHERE "id" = $1`,
            p.id,
          );
          return Number(filas[0].n);
        });
      return { p, desdeB, sigueAbierto, rlsB: await contar(orgB), rlsA: await contar(orgA) };
    });
    expect(r.desdeB).toEqual({ abierto: null, empresa: null, canje: null, aplicar: "invalido" });
    expect(r.sigueAbierto?.id).toBe(r.p.id);
    expect([r.rlsA, r.rlsB]).toEqual([1, 0]);
  });

  it("R1615: con el pendiente abierto se entra con el correo anterior y el nuevo no da la cuenta", async () => {
    const r = await bajoLockDeEscrituraReal(async () => {
      const a1 = await sembrar(orgA);
      await abrirEnA(a1.id, correoNuevo("login"));
      const cuentas = (email: string) =>
        comoPlataforma(LOGIN.ficha, LOGIN.motivo, () => repo.findCuentasPorEmailConHash(email));
      return { a1, anterior: await cuentas(a1.email), nuevo: await cuentas(correoNuevo("login")) };
    });
    expect(r.anterior.map((c) => c.id)).toEqual([r.a1.id]);
    expect(r.nuevo).toEqual([]);
  });

  it("R1622/R1623: `cambioCorreoParaCanje` solo da el abierto y vigente; anulado, usado y vencido no", async () => {
    const r = await bajoLockDeEscrituraReal(async () => {
      const [u1, u2, u3, u4] = [await sembrar(orgA), await sembrar(orgA), await sembrar(orgA), await sembrar(orgA)];
      const vigente = await abrirEnA(u1.id, correoNuevo("v"));
      const anulado = await abrirEnA(u2.id, correoNuevo("a"));
      await enA(() => repo.anularCambioCorreo(anulado.id));
      const usado = await abrirEnA(u3.id, correoNuevo("u"));
      await base.usuarioCambioCorreo.update({ where: { id: usado.id }, data: { confirmadoAt: new Date() } });
      const vencido = await abrirEnA(u4.id, correoNuevo("x"), new Date(Date.now() - 1_000));
      const canje = (id: string) => enA(() => repo.cambioCorreoParaCanje(id));
      return {
        vigente: await canje(vigente.id),
        anulado: await canje(anulado.id),
        usado: await canje(usado.id),
        vencido: await canje(vencido.id),
        aplicarVencido: await enA(() => repo.aplicarCambioCorreo(vencido.id)),
        u1,
      };
    });
    expect(r.vigente).toEqual({
      id: expect.any(String),
      usuarioId: r.u1.id,
      emailNuevo: correoNuevo("v"),
      secretoHash: "hash-de-prueba",
      solicitadoPorId: maestroA,
    });
    expect([r.anulado, r.usado, r.vencido]).toEqual([null, null, null]);
    expect(r.aplicarVencido).toBe("invalido");
  });

  it("R1622: el canje cambia el correo, confirma el pendiente y deja la fila con el maestro que lo pidió", async () => {
    const r = await bajoLockDeEscrituraReal(async () => {
      const a1 = await sembrar(orgA);
      const p = await abrirEnA(a1.id, correoNuevo("ok"));
      const salida = await enA(() => repo.aplicarCambioCorreo(p.id));
      const usuario = await base.usuario.findUniqueOrThrow({ where: { id: a1.id }, select: { email: true } });
      const pendiente = await base.usuarioCambioCorreo.findUniqueOrThrow({ where: { id: p.id } });
      const nuevo = await comoPlataforma(LOGIN.ficha, LOGIN.motivo, () =>
        repo.findCuentasPorEmailConHash(correoNuevo("ok")),
      );
      return { a1, salida, usuario, pendiente, filas: await filasDeCorreo(a1.id), nuevo };
    });
    expect(r.salida).toBe("ok");
    expect(r.usuario.email).toBe(correoNuevo("ok"));
    expect(r.pendiente.confirmadoAt).toBeInstanceOf(Date);
    expect(r.pendiente.anuladoAt).toBeNull();
    expect(r.filas).toEqual([
      {
        entidadTipo: "usuario",
        valorAnterior: r.a1.email,
        valorNuevo: correoNuevo("ok"),
        actorUsuarioId: maestroA,
        organizacionId: orgA,
      },
    ]);
    expect(r.nuevo.map((c) => c.id)).toEqual([r.a1.id]);
  });

  it("R1624: si el correo nuevo ya lo usa otro de la empresa al confirmar, nada cambia y el pendiente sigue abierto", async () => {
    const r = await bajoLockDeEscrituraReal(async () => {
      const a1 = await sembrar(orgA);
      const a2 = await sembrar(orgA);
      const p = await abrirEnA(a1.id, correoNuevo("ocupado"));
      await base.usuario.update({ where: { id: a2.id }, data: { email: correoNuevo("ocupado") } });
      const salida = await enA(() => repo.aplicarCambioCorreo(p.id));
      const usuario = await base.usuario.findUniqueOrThrow({ where: { id: a1.id }, select: { email: true } });
      const pendiente = await base.usuarioCambioCorreo.findUniqueOrThrow({ where: { id: p.id } });
      return { a1, salida, usuario, pendiente, filas: await filasDeCorreo(a1.id) };
    });
    expect(r.salida).toBe("correo_en_uso");
    expect(r.usuario.email).toBe(r.a1.email);
    expect(r.pendiente.confirmadoAt).toBeNull();
    expect(r.pendiente.anuladoAt).toBeNull();
    expect(r.filas).toEqual([]);
  });

  it("R1625: dos canjes a la vez del mismo pendiente aplican el cambio UNA vez", async () => {
    const r = await bajoLockDeEscrituraReal(async () => {
      const a1 = await sembrar(orgA);
      const p = await abrirEnA(a1.id, correoNuevo("carrera"));
      const salidas = await Promise.all([
        enA(() => repo.aplicarCambioCorreo(p.id)),
        enA(() => repo.aplicarCambioCorreo(p.id)),
      ]);
      return { salidas, filas: await filasDeCorreo(a1.id) };
    });
    expect([...r.salidas].sort()).toEqual(["invalido", "ok"]);
    expect(r.filas).toHaveLength(1);
  });
});
