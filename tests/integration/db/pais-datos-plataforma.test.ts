import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import type { Actor as ActorDeUsuarios } from "@/lib/interfaces/services/IUsuarioService";
import { PaisRepository } from "@/lib/repositories/PaisRepository";
import { UserRepository } from "@/lib/repositories/UserRepository";
import { PaisService } from "@/lib/services/PaisService";
import { ReglasPaisEmpresaService } from "@/lib/services/ReglasPaisEmpresaService";
import { UsuarioService } from "@/lib/services/UsuarioService";
import type { DatosDeAltaDePais } from "@/lib/types/pais";
import { comoApp, crearOrganizacion } from "@/tests/fabricas/organizaciones";
import { crearOrganizacionEnPais, crearPaisDePrueba, crearTipoDocumentoDePrueba } from "@/tests/fabricas/paises";
import { comoDueno, revertida } from "./_fixtures/pais-20";
import { idDeRol, insertarUsuario } from "./_fixtures/superadmin-32";
import {
  HAY_BASE_DE_DATOS,
  RegistroCaido,
  bajoLockDeEscrituraReal,
  clienteConSavepoint,
  crearPrismaDeTest,
  type TxDeTest,
} from "./_postgres-real";

// SLT-81 (T1.3; design §4.3) — la escritura de los datos del país y de su catálogo de documentos,
// contra Postgres real.
//   · R4: Costa Rica llega completo de las migraciones de SLT-42.
//   · R6: el alta del país y de sus tipos es una sola operación.
//   · R8: `zonaConocidaPorLaBase` pregunta a `pg_timezone_names`.
//   · R15: dos desactivaciones a la vez de los dos últimos activos dejan uno activo.
//   · R16: desactivar un tipo no cambia el de los usuarios que ya lo tienen.
//   · R17: una fila de historial por cambio real, con actor y detalle; sin cambio, ninguna; si el
//     historial falla, el cambio no queda.
//   · R12, R14 (T1.6): de punta a punta, con `PaisService`, `ReglasPaisEmpresaService` y
//     `UsuarioService` reales y dos empresas: una en CR y otra en `PA`, que da de alta el test por el
//     servicio (R26 rechaza los `XA`–`XZ`).
//
// Casi todo en una transacción del dueño que se revierte (`revertida`), con el repositorio sobre
// `clienteConSavepoint`. R15 necesita dos transacciones de verdad: commitea un país propio (`XW`) bajo
// el lock de la 227 y lo borra al terminar.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

/** Un usuario real para el actor: `historial_plataforma.actor_usuario_id` tiene FK a `usuario`. */
async function actorDePrueba(tx: TxDeTest): Promise<string> {
  const org = await crearOrganizacion(tx);
  const u = await insertarUsuario(tx, await idDeRol(tx, "maestro"), org.id);
  if (!u.desenlace.ok) throw new Error(`no se sembró el actor: ${JSON.stringify(u.desenlace)}`);
  return u.id;
}

function altaXA(tipos: DatosDeAltaDePais["tiposDocumento"]): DatosDeAltaDePais {
  return {
    id: "XA",
    nombre: "País de alta XA",
    nivel1Singular: "Región",
    nivel1Plural: "Regiones",
    nivel2Singular: "Comuna",
    nivel2Plural: "Comunas",
    nivel3Singular: "Barrio",
    nivel3Plural: "Barrios",
    prefijoTelefonico: "999",
    telefonoDigitosNacionales: 8,
    zonaHoraria: "America/Panama",
    tiposDocumento: tipos,
  };
}

function tipoXA(clave: string, nombre = `Documento ${clave}`) {
  return { nombre, caracteres: "digitos" as const, largoMin: 8, largoMax: 9, clave, value: `XA_${clave}` };
}

const SUPERADMIN_ROL = "superadmin" as const;
const MAESTRO_DE_USUARIOS: ActorDeUsuarios = { usuarioId: randomUUID(), rol: "maestro" };

interface Panama {
  superadminId: string;
  paisService: PaisService;
  empresaPA: string;
  empresaCR: string;
  cedulaPA: string;
  rolAdmin: string;
}

/**
 * Panamá dado de alta por el servicio, con su prefijo oficial y una «Cédula» de 9 dígitos, y una
 * empresa en PA y otra en CR. Todo como dueño, en la transacción del caso.
 */
async function sembrarPanama(tx: TxDeTest): Promise<Panama> {
  const superadminId = await actorDePrueba(tx);
  const paisService = new PaisService(new PaisRepository(clienteConSavepoint(tx)));
  const alta = await paisService.crear(
    {
      id: "PA",
      nivel1Singular: "Provincia",
      nivel1Plural: "Provincias",
      nivel2Singular: "Distrito",
      nivel2Plural: "Distritos",
      nivel3Singular: "Corregimiento",
      nivel3Plural: "Corregimientos",
      prefijoTelefonico: "507",
      telefonoDigitosNacionales: 8,
      zonaHoraria: "America/Panama",
      tiposDocumento: [{ nombre: "Cédula", caracteres: "digitos", largoMin: 9, largoMax: 9 }],
    },
    { usuarioId: superadminId, rol: SUPERADMIN_ROL },
  );
  if (alta.status !== "ok") throw new Error(`alta de PA: ${JSON.stringify(alta)}`);
  const empresaPA = (await crearOrganizacionEnPais(tx, "PA", { nombre: `Empresa PA ${randomUUID().slice(0, 6)}` })).id;
  const empresaCR = (await crearOrganizacion(tx, { nombre: `Empresa CR ${randomUUID().slice(0, 6)}` })).id;
  const cedulaPA = (await tx.tipoIdentificacion.findFirstOrThrow({ where: { paisId: "PA" }, select: { id: true } })).id;
  return { superadminId, paisService, empresaPA, empresaCR, cedulaPA, rolAdmin: await idDeRol(tx, "admin") };
}

/** Las reglas y el servicio de usuarios reales, con la empresa que daría la sesión. */
function deLaEmpresa(tx: TxDeTest, organizacionId: string) {
  const cliente = tx as unknown as PrismaClient;
  const reglas = new ReglasPaisEmpresaService({ repo: new PaisRepository(cliente), empresaDeLaSesion: async () => organizacionId });
  return { reglas, usuarios: new UsuarioService(new UserRepository(cliente), undefined, undefined, undefined, undefined, reglas) };
}

/** Un alta de usuario `admin` en la empresa del contexto (`comoApp`). */
function altaDeUsuario(p: Panama, cedula: string) {
  const sufijo = randomUUID().replace(/-/g, "").slice(0, 10);
  return {
    nombre: "Persona SLT-81",
    email: `slt81-${sufijo}@example.com`,
    telefono: "61234567",
    tipoIdentificacionId: p.cedulaPA,
    cedula,
    rolId: p.rolAdmin,
    passwordMode: "generate" as const,
  };
}

/** La foto de los datos de negocio de una empresa: cada fila entera, como JSON. */
async function fotoDeNegocio(tx: TxDeTest, organizacionId: string): Promise<Record<string, string[]>> {
  const foto: Record<string, string[]> = {};
  for (const tabla of ["usuario", "orden", "chat_conversacion"]) {
    const filas = await tx.$queryRawUnsafe<{ f: string }[]>(
      `SELECT to_jsonb(t)::text AS f FROM "${tabla}" t WHERE t."organizacion_id" = $1 ORDER BY t."id"`,
      organizacionId,
    );
    foto[tabla] = filas.map((r) => r.f);
  }
  return foto;
}

const historialDe = (tx: TxDeTest, paisId: string) =>
  tx.historialPlataforma.findMany({
    where: { paisId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { accion: true, entidadTipo: true, entidadId: true, entidadEtiqueta: true, actorUsuarioId: true, detalle: true },
  });

describeSiHayBase("SLT-81 — datos del país contra Postgres", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R4: CR llega completo de las migraciones de SLT-42: 506, 8, America/Costa_Rica y cinco tipos activos", async () => {
    const r = await revertida(base, async (tx) => {
      const repo = new PaisRepository(clienteConSavepoint(tx));
      return { cr: await repo.porId("CR"), tipos: await repo.listarTiposDocumento("CR") };
    });
    expect(r.cr).toMatchObject({ prefijoTelefonico: "506", telefonoDigitosNacionales: 8, zonaHoraria: "America/Costa_Rica" });
    expect(r.tipos.filter((t) => t.activo)).toHaveLength(5);
    expect(r.tipos.every((t) => t.paisId === "CR")).toBe(true);
  });

  it("R6/R17: el alta crea el país, sus tipos en orden y una fila por cada uno, en la misma operación", async () => {
    const r = await revertida(base, async (tx) => {
      const actorId = await actorDePrueba(tx);
      const repo = new PaisRepository(clienteConSavepoint(tx));
      const alta = await repo.crear(altaXA([tipoXA("dni", "DNI"), tipoXA("pasaporte_xa", "Pasaporte")]), { usuarioId: actorId });
      return { actorId, alta, tipos: await repo.listarTiposDocumento("XA"), historial: await historialDe(tx, "XA") };
    });
    expect(r.alta).toMatchObject({ estado: "creado", pais: { id: "XA", prefijoTelefonico: "999", telefonoDigitosNacionales: 8, zonaHoraria: "America/Panama" } });
    expect(r.tipos.map((t) => [t.nombre, t.clave, t.value, t.activo])).toEqual([
      ["DNI", "dni", "XA_dni", true],
      ["Pasaporte", "pasaporte_xa", "XA_pasaporte_xa", true],
    ]);
    expect(r.historial.map((h) => [h.accion, h.entidadTipo, h.actorUsuarioId])).toEqual([
      ["pais_creado", "pais", r.actorId],
      ["tipo_documento_creado", "tipo_documento", r.actorId],
      ["tipo_documento_creado", "tipo_documento", r.actorId],
    ]);
    expect(r.historial[1].detalle).toEqual({ clave: "dni", caracteres: "digitos", largoMin: 8, largoMax: 9 });
  });

  it("R6: un tipo con clave repetida tumba el alta: ni país ni tipos ni historial", async () => {
    const r = await revertida(base, async (tx) => {
      const actorId = await actorDePrueba(tx);
      const repo = new PaisRepository(clienteConSavepoint(tx));
      const alta = await repo.crear(altaXA([tipoXA("dni"), { ...tipoXA("dni"), value: "XA_otro" }]), { usuarioId: actorId });
      return {
        alta,
        pais: await tx.pais.count({ where: { id: "XA" } }),
        tipos: await tx.tipoIdentificacion.count({ where: { paisId: "XA" } }),
        historial: await tx.historialPlataforma.count({ where: { paisId: "XA" } }),
      };
    });
    expect(r.alta).toEqual({ estado: "duplicado", campo: "tiposDocumento" });
    expect([r.pais, r.tipos, r.historial]).toEqual([0, 0, 0]);
  });

  it("R8: zonaConocidaPorLaBase pregunta a pg_timezone_names", async () => {
    const r = await revertida(base, async (tx) => {
      const repo = new PaisRepository(clienteConSavepoint(tx));
      return [await repo.zonaConocidaPorLaBase("America/Costa_Rica"), await repo.zonaConocidaPorLaBase("Mars/Olympus")];
    });
    expect(r).toEqual([true, false]);
  });

  it("R17: actualizarDatos deja una fila con antes, después y empresas; repetirlo no deja otra", async () => {
    const r = await revertida(base, async (tx) => {
      const actorId = await actorDePrueba(tx);
      await crearPaisDePrueba(tx, "XA", { prefijoTelefonico: "999", telefonoDigitosNacionales: 8, zonaHoraria: null });
      const repo = new PaisRepository(clienteConSavepoint(tx));
      const datos = { prefijoTelefonico: "998", telefonoDigitosNacionales: 7, zonaHoraria: "America/Panama" };
      const pasos = [
        await repo.actualizarDatos("XA", datos, 2, { usuarioId: actorId }),
        await repo.actualizarDatos("XA", datos, 2, { usuarioId: actorId }),
        await repo.actualizarDatos("XZ", datos, 0, { usuarioId: actorId }),
      ];
      return { actorId, pasos: pasos.map((p) => p.estado), historial: await historialDe(tx, "XA") };
    });
    expect(r.pasos).toEqual(["cambiado", "sin_cambio", "no_existe"]);
    expect(r.historial).toEqual([
      {
        accion: "pais_datos_cambiados",
        entidadTipo: "pais",
        entidadId: "XA",
        entidadEtiqueta: "País de prueba XA",
        actorUsuarioId: r.actorId,
        detalle: {
          antes: { prefijo: "999", digitos: 8, zona: null },
          despues: { prefijo: "998", digitos: 7, zona: "America/Panama" },
          empresas: 2,
        },
      },
    ]);
  });

  it("R13/R17: alta, edición, desactivación y activación de un tipo dejan una fila cada una; guardar igual no deja ninguna", async () => {
    const r = await revertida(base, async (tx) => {
      const actorId = await actorDePrueba(tx);
      await crearPaisDePrueba(tx, "XA");
      await crearTipoDocumentoDePrueba(tx, "XA", { clave: "dni", orden: 3 });
      const repo = new PaisRepository(clienteConSavepoint(tx));
      const actor = { usuarioId: actorId };
      const creado = await repo.crearTipoDocumento("XA", { ...tipoXA("ruc_xa", "RUC"), largoMin: 11, largoMax: 11 }, actor);
      if (creado.estado !== "creado") throw new Error(`alta: ${creado.estado}`);
      const id = creado.tipo.id;
      const regla = { nombre: "RUC nuevo", caracteres: "alfanumerico" as const, largoMin: 10, largoMax: 12 };
      const pasos = [
        (await repo.editarTipoDocumento(id, regla, actor)).estado,
        (await repo.editarTipoDocumento(id, regla, actor)).estado,
        (await repo.cambiarActivoTipoDocumento(id, false, actor)).estado,
        (await repo.cambiarActivoTipoDocumento(id, false, actor)).estado,
        (await repo.cambiarActivoTipoDocumento(id, true, actor)).estado,
        (await repo.crearTipoDocumento("XZ", tipoXA("x"), actor)).estado,
        (await repo.crearTipoDocumento("XA", { ...tipoXA("ruc_xa"), nombre: "Otro" }, actor)).estado,
        (await repo.editarTipoDocumento(randomUUID(), regla, actor)).estado,
        (await repo.cambiarActivoTipoDocumento(randomUUID(), false, actor)).estado,
      ];
      const fila = await tx.tipoIdentificacion.findUniqueOrThrow({ where: { id } });
      return { actorId, creado, pasos, fila, historial: await historialDe(tx, "XA") };
    });
    // `orden` = el mayor del país + 1; la clave y el `value` no cambian al renombrar.
    expect(r.fila).toMatchObject({ orden: 4, clave: "ruc_xa", value: "XA_ruc_xa", nombre: "RUC nuevo", caracteres: "alfanumerico", largoMin: 10, largoMax: 12, activo: true });
    expect(r.pasos).toEqual(["cambiado", "sin_cambio", "cambiado", "sin_cambio", "cambiado", "no_existe", "duplicado", "no_existe", "no_existe"]);
    expect(r.historial.map((h) => [h.accion, h.entidadTipo, h.entidadId, h.actorUsuarioId])).toEqual(
      ["tipo_documento_creado", "tipo_documento_editado", "tipo_documento_desactivado", "tipo_documento_activado"].map((a) => [
        a,
        "tipo_documento",
        r.creado.estado === "creado" ? r.creado.tipo.id : "",
        r.actorId,
      ]),
    );
    expect(r.historial[1].detalle).toEqual({
      antes: { nombre: "RUC", caracteres: "digitos", largoMin: 11, largoMax: 11 },
      despues: { nombre: "RUC nuevo", caracteres: "alfanumerico", largoMin: 10, largoMax: 12 },
    });
    expect(r.historial[2].detalle).toBeNull();
  });

  it("R17: si el historial falla, el cambio no queda (datos del país y tipo)", async () => {
    const r = await revertida(base, async (tx) => {
      const actorId = await actorDePrueba(tx);
      await crearPaisDePrueba(tx, "XA", { prefijoTelefonico: "999", telefonoDigitosNacionales: 8, zonaHoraria: "America/Panama" });
      const tipo = await crearTipoDocumentoDePrueba(tx, "XA", { clave: "dni" });
      const roto = new PaisRepository(clienteConSavepoint(tx, "plataforma"));
      const actor = { usuarioId: actorId };
      const comoError = (e: unknown) => e;
      const datos = { prefijoTelefonico: "998", telefonoDigitosNacionales: 8, zonaHoraria: "America/Panama" };
      const regla = { nombre: "Otro", caracteres: "digitos" as const, largoMin: 8, largoMax: 8 };
      const fallos = [
        await roto.actualizarDatos("XA", datos, 0, actor).catch(comoError),
        await roto.editarTipoDocumento(tipo.id, regla, actor).catch(comoError),
        await roto.crearTipoDocumento("XA", tipoXA("ruc_xa"), actor).catch(comoError),
      ];
      return {
        fallos,
        pais: await tx.pais.findUniqueOrThrow({ where: { id: "XA" }, select: { prefijoTelefonico: true } }),
        tipos: await tx.tipoIdentificacion.findMany({ where: { paisId: "XA" }, select: { nombre: true } }),
        historial: await tx.historialPlataforma.count({ where: { paisId: "XA" } }),
      };
    });
    for (const f of r.fallos) expect(f).toBeInstanceOf(RegistroCaido);
    expect(r.pais.prefijoTelefonico).toBe("999");
    expect(r.tipos).toEqual([{ nombre: "Documento dni" }]);
    expect(r.historial).toBe(0);
  });

  it("R16: desactivar un tipo no cambia el de los usuarios que ya lo tienen", async () => {
    const r = await revertida(base, async (tx) => {
      const actorId = await actorDePrueba(tx);
      const usuario = await tx.usuario.findUniqueOrThrow({ where: { id: actorId }, select: { tipoIdentificacionId: true } });
      const repo = new PaisRepository(clienteConSavepoint(tx));
      const paso = await repo.cambiarActivoTipoDocumento(usuario.tipoIdentificacionId, false, { usuarioId: actorId });
      const despues = await tx.usuario.findUniqueOrThrow({ where: { id: actorId }, select: { tipoIdentificacionId: true } });
      return { antes: usuario.tipoIdentificacionId, paso: paso.estado, despues: despues.tipoIdentificacionId };
    });
    expect(r.paso).toBe("cambiado");
    expect(r.despues).toBe(r.antes);
  });

  it("R15: desactivar el único tipo activo es `ultimo_activo` y lo deja activo", async () => {
    const r = await revertida(base, async (tx) => {
      await crearPaisDePrueba(tx, "XA");
      const unico = await crearTipoDocumentoDePrueba(tx, "XA", { clave: "dni" });
      await crearTipoDocumentoDePrueba(tx, "XA", { clave: "viejo", activo: false, orden: 2 });
      const repo = new PaisRepository(clienteConSavepoint(tx));
      const paso = await repo.cambiarActivoTipoDocumento(unico.id, false, { usuarioId: randomUUID() });
      const fila = await tx.tipoIdentificacion.findUniqueOrThrow({ where: { id: unico.id }, select: { activo: true } });
      return { paso, activo: fila.activo };
    });
    expect(r).toEqual({ paso: { estado: "ultimo_activo" }, activo: true });
  });

  it("R15: dos desactivaciones a la vez de los dos últimos activos dejan uno activo", async () => {
    const PAIS = "XW";
    const otro = crearPrismaDeTest();
    try {
      await bajoLockDeEscrituraReal(async () => {
        const [a, b] = await base.$transaction(async (tx) => {
          await crearPaisDePrueba(tx, PAIS);
          return [
            await crearTipoDocumentoDePrueba(tx, PAIS, { clave: "a", orden: 1 }),
            await crearTipoDocumentoDePrueba(tx, PAIS, { clave: "b", orden: 2 }),
          ];
        });
        try {
          // Un actor que no existe se registra como sistema: no hace falta sembrar un usuario commiteado.
          const actor = { usuarioId: randomUUID() };
          const pasos = await Promise.all([
            new PaisRepository(base).cambiarActivoTipoDocumento(a.id, false, actor),
            new PaisRepository(otro).cambiarActivoTipoDocumento(b.id, false, actor),
          ]);
          const activos = await base.tipoIdentificacion.count({ where: { paisId: PAIS, activo: true } });
          expect(pasos.map((p) => p.estado).sort()).toEqual(["cambiado", "ultimo_activo"]);
          expect(activos).toBe(1);
        } finally {
          await base.historialPlataforma.deleteMany({ where: { paisId: PAIS } });
          await base.tipoIdentificacion.deleteMany({ where: { paisId: PAIS } });
          await base.pais.delete({ where: { id: PAIS } });
        }
      });
    } finally {
      await otro.$disconnect();
    }
  }, 60_000);

  it("R20: listarDisponiblesParaAlta trae el prefijo y solo los tipos activos, por orden", async () => {
    const r = await revertida(base, async (tx) => {
      await crearPaisDePrueba(tx, "XA", { prefijoTelefonico: "999" });
      await crearTipoDocumentoDePrueba(tx, "XA", { clave: "segundo", nombre: "Segundo", orden: 2 });
      await crearTipoDocumentoDePrueba(tx, "XA", { clave: "primero", nombre: "Primero", orden: 1 });
      await crearTipoDocumentoDePrueba(tx, "XA", { clave: "inactivo", orden: 3, activo: false });
      const repo = new PaisRepository(clienteConSavepoint(tx));
      return (await repo.listarDisponiblesParaAlta()).find((p) => p.id === "XA");
    });
    expect(r).toEqual({
      id: "XA",
      nombre: "País de prueba XA",
      prefijoTelefonico: "999",
      tiposDocumento: [
        { id: expect.any(String), value: "XA_primero", nombre: "Primero" },
        { id: expect.any(String), value: "XA_segundo", nombre: "Segundo" },
      ],
    });
  });

  it("R12: tras cambiar la zona y los dígitos de PA, las reglas de una empresa de PA dan los nuevos y nada guardado cambia (ni en PA ni en CR)", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await sembrarPanama(tx);
      const superadmin = { usuarioId: p.superadminId, rol: SUPERADMIN_ROL };

      await comoApp(tx, p.empresaPA);
      const persona = await deLaEmpresa(tx, p.empresaPA).usuarios.crear(altaDeUsuario(p, "123456789"), MAESTRO_DE_USUARIOS);
      const antesReglas = await deLaEmpresa(tx, p.empresaPA).reglas.deLaEmpresa();
      await comoDueno(tx);

      const fotos = { pa: await fotoDeNegocio(tx, p.empresaPA), cr: await fotoDeNegocio(tx, p.empresaCR) };
      const cambio = { id: "PA", prefijoTelefonico: "507", telefonoDigitosNacionales: 7, zonaHoraria: "America/Bogota" };
      const sinConfirmar = await p.paisService.actualizarDatos(cambio, superadmin);
      const confirmado = await p.paisService.actualizarDatos({ ...cambio, empresasConfirmadas: 1 }, superadmin);
      const despues = { pa: await fotoDeNegocio(tx, p.empresaPA), cr: await fotoDeNegocio(tx, p.empresaCR) };

      await comoApp(tx, p.empresaPA);
      const despuesReglas = await deLaEmpresa(tx, p.empresaPA).reglas.deLaEmpresa();
      await comoDueno(tx);
      await comoApp(tx, p.empresaCR);
      const deCR = await deLaEmpresa(tx, p.empresaCR).reglas.zonaHoraria();
      await comoDueno(tx);
      return { persona: persona.status, antesReglas, sinConfirmar, confirmado: confirmado.status, fotos, despues, despuesReglas, deCR };
    });

    expect(r.persona).toBe("ok");
    expect(r.antesReglas).toEqual({ paisId: "PA", zonaHoraria: "America/Panama", telefono: { prefijo: "507", digitosNacionales: 8 } });
    // R10 sobre la base real: la empresa de PA cuenta.
    expect(r.sinConfirmar).toEqual({ status: "requiere_confirmacion", empresas: 1 });
    expect(r.confirmado).toBe("ok");
    expect(r.despuesReglas).toEqual({ paisId: "PA", zonaHoraria: "America/Bogota", telefono: { prefijo: "507", digitosNacionales: 7 } });
    expect(r.deCR).toBe("America/Costa_Rica");
    // CONTROL: la foto de PA no está vacía (la persona dada de alta está en ella).
    expect(r.fotos.pa.usuario.length).toBeGreaterThan(0);
    expect(r.despues).toEqual(r.fotos);
  });

  it("R14: tras cambiar el largo del tipo, el usuario guardado con el formato viejo sigue igual y se edita sin revalidar; un alta nueva exige el nuevo", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await sembrarPanama(tx);

      await comoApp(tx, p.empresaPA);
      const viejo = await deLaEmpresa(tx, p.empresaPA).usuarios.crear(altaDeUsuario(p, "123456789"), MAESTRO_DE_USUARIOS);
      if (viejo.status !== "ok") throw new Error(`alta con el formato viejo: ${JSON.stringify(viejo)}`);
      await comoDueno(tx);

      const edicion = await p.paisService.editarTipoDocumento(
        { id: p.cedulaPA, nombre: "Cédula", caracteres: "digitos", largoMin: 10, largoMax: 10 },
        { usuarioId: p.superadminId, rol: SUPERADMIN_ROL },
      );

      await comoApp(tx, p.empresaPA);
      const { usuarios } = deLaEmpresa(tx, p.empresaPA);
      const renombre = await usuarios.actualizar(viejo.usuario.id, { nombre: "Persona renombrada" }, MAESTRO_DE_USUARIOS);
      const mismoTipo = await usuarios.actualizar(viejo.usuario.id, { tipoIdentificacionId: p.cedulaPA }, MAESTRO_DE_USUARIOS);
      const nuevoConElViejo = await usuarios.crear(altaDeUsuario(p, "987654321"), MAESTRO_DE_USUARIOS);
      const nuevoConElNuevo = await usuarios.crear(altaDeUsuario(p, "9876543210"), MAESTRO_DE_USUARIOS);
      await comoDueno(tx);

      const guardado = await tx.usuario.findUniqueOrThrow({
        where: { id: viejo.usuario.id },
        select: { cedula: true, tipoIdentificacionId: true, nombre: true },
      });
      return { edicion: edicion.status, renombre: renombre.status, mismoTipo: mismoTipo.status, nuevoConElViejo, nuevoConElNuevo: nuevoConElNuevo.status, guardado, cedulaPA: p.cedulaPA };
    });

    expect(r.edicion).toBe("ok");
    expect(r.renombre).toBe("ok");
    expect(r.mismoTipo).toBe("ok");
    expect(r.guardado).toEqual({ cedula: "123456789", tipoIdentificacionId: r.cedulaPA, nombre: "Persona renombrada" });
    expect(r.nuevoConElViejo.status).toBe("validation_error");
    expect(r.nuevoConElViejo.status === "validation_error" && Object.keys(r.nuevoConElViejo.fieldErrors)).toEqual(["cedula"]);
    expect(r.nuevoConElNuevo).toBe("ok");
  });
});
