import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import {
  EmpresaNoResuelta,
  UsuarioSinEmpresa,
  comoPlataforma,
  conEmpresa,
} from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import { MODELOS_DE_NEGOCIO } from "@/lib/db/modelos-de-negocio";
import {
  UsuarioDuplicadoError,
  type CreateUsuarioInput,
} from "@/lib/interfaces/repositories/IUserRepository";
import type { Actor } from "@/lib/interfaces/services/IUsuarioService";
import { UserRepository } from "@/lib/repositories/UserRepository";
import { UsuarioService } from "@/lib/services/UsuarioService";
import {
  actualizarUsuarioSchema,
  cambiarEstadoUsuarioSchema,
  listarUsuariosSchema,
} from "@/lib/types/usuario";
import { datosDeOrganizacionDePrueba } from "../../fabricas/organizaciones";
import { HAY_BASE_DE_DATOS, bajoLockDeEscrituraReal, crearPrismaDeTest } from "./_postgres-real";
import { exigirSinSuperadmin, tomarLockDeSuperadmin } from "./_fixtures/superadmin-32";

// SL-17 / T3.4 (design §9.2, §6.2) — R31, R3, R35, R36 y R14 sobre `usuario`, contra Postgres real.
//
// El servicio y el repositorio son los de la pantalla `configuracion/usuarios`, con el cliente
// EXTENDIDO (el de la app) y la empresa puesta con `conEmpresa`. Lo que quedó en la base se mide
// con el cliente BASE, que no filtra.
//
// No cabe en una transacción revertida: `UserRepository.update`/`setEstado`/`create` abren su
// propia `$transaction`, y por el cliente extendido eso es otra conexión. Los datos se commitean
// con un sufijo único por ejecución y se borran al final; todo filtro de conteo va acotado a ese
// sufijo porque otros archivos de la suite commitean usuarios en paralelo.
//
// SL-32: el superadmin lleva su rol real. El `CHECK` `usuario_empresa_o_superadmin` (R28) ya no deja
// un `maestro` sin empresa, y el indice `usuario_un_solo_superadmin` (R27) admite uno solo en toda
// la base: el archivo toma el lock de `tomarLockDeSuperadmin` mientras vive el suyo.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const RUN = randomUUID().replace(/-/g, "").slice(0, 10);

let base: PrismaClient;
let app: PrismaClient;
let servicio: UsuarioService;
let repo: UserRepository;

let orgA: string;
let orgB: string;
let rolMaestro: string;
let rolSuperadmin: string;
let tipoCedula: string;
let soltarSuperadmin: () => Promise<void> = async () => {};

const ids: Record<"a1" | "a2" | "b1" | "b2" | "maestroB" | "maestroA" | "superadmin", string> = {
  a1: "",
  a2: "",
  b1: "",
  b2: "",
  maestroA: "",
  maestroB: "",
  superadmin: "",
};

function datosDeUsuario(tag: string, rolId: string = rolMaestro): CreateUsuarioInput {
  return {
    nombre: `Persona ${tag} ${RUN}`,
    email: `usr-${tag}-${RUN}@ejemplo.test`,
    telefono: "88887777",
    cedula: `ced-${tag}-${RUN}`,
    tipoIdentificacionId: tipoCedula,
    rolId,
    // El login no se prueba aquí: basta con que no sea un hash utilizable.
    passwordHash: "no-utilizable",
    estado: "activo",
  };
}

/** Siembra por el repositorio real, en la empresa dada: el mismo camino que el alta de la pantalla. */
function sembrar(org: string, tag: string): Promise<string> {
  return conEmpresa(org, async () => (await repo.create(datosDeUsuario(tag), null)).id);
}

const actorDe = (usuarioId: string): Actor => ({ usuarioId, rol: "maestro" });

const comoB = <T>(fn: () => Promise<T>) => conEmpresa(orgB, fn);

const SUPERADMIN = { ficha: "SL-17", motivo: "test de aislamiento de usuarios: superadmin sin empresa" } as const;

/** La fila tal y como está en la base, sin pasar por la extensión. */
function filaEnBase(id: string) {
  return base.usuario.findUniqueOrThrow({ where: { id } });
}

describeSiHayBase("SL-17 — aislamiento de usuarios entre empresas (Postgres)", () => {
  beforeAll(async () => {
    base = crearPrismaDeTest();
    // Resolutor nulo: fuera de `conEmpresa`/`comoPlataforma` toda operación de negocio falla (R11/R14).
    app = conAislamientoPorEmpresa(base, async () => null);
    repo = new UserRepository(app);
    servicio = new UsuarioService(repo);

    // Antes de sembrar: el hueco del unico superadmin es de este archivo hasta su `afterAll`.
    soltarSuperadmin = await tomarLockDeSuperadmin();
    await exigirSinSuperadmin(base);

    // Commitea `organizacion` y `usuario` fuera de toda transaccion revertida: bajo el lock de la 227
    // para no cruzarse con un `down.sql` serializado (ver `bajoLockDeEscrituraReal`).
    await bajoLockDeEscrituraReal(async () => {
      [orgA, orgB] = await Promise.all(
        [datosDeOrganizacionDePrueba(`A ${RUN}`), datosDeOrganizacionDePrueba(`B ${RUN}`)].map(async (d) =>
          (await base.organizacion.create({ data: d, select: { id: true } })).id,
        ),
      );
      rolMaestro = (await base.rol.findFirstOrThrow({ where: { value: "maestro" } })).id;
      rolSuperadmin = (await base.rol.findFirstOrThrow({ where: { value: "superadmin" } })).id;
      tipoCedula = (await base.tipoIdentificacion.findFirstOrThrow({ where: { value: "cedula" } })).id;

      ids.a1 = await sembrar(orgA, "a1");
      ids.a2 = await sembrar(orgA, "a2");
      ids.maestroA = await sembrar(orgA, "maestroa");
      ids.b1 = await sembrar(orgB, "b1");
      ids.b2 = await sembrar(orgB, "b2");
      ids.maestroB = await sembrar(orgB, "maestrob");
      // El superadmin nace como lo hará el arranque de SL-32: en plataforma y con el `null` escrito.
      ids.superadmin = await comoPlataforma(SUPERADMIN.ficha, SUPERADMIN.motivo, async () =>
        (await app.usuario.create({ data: { ...datosDeUsuario("superadmin", rolSuperadmin), organizacionId: null } })).id,
      );
    });

    // Sin estas filas el test no prueba nada: si la siembra no dejó lo esperado, falla aquí.
    const sembrados = await base.usuario.findMany({
      where: { email: { contains: RUN } },
      select: { id: true, organizacionId: true },
    });
    const porEmpresa = (org: string | null) => sembrados.filter((u) => u.organizacionId === org).length;
    expect([porEmpresa(orgA), porEmpresa(orgB), porEmpresa(null)]).toEqual([3, 3, 1]);
  }, 120_000);

  afterAll(async () => {
    if (!base) return await soltarSuperadmin();
    const usuarios = await base.usuario.findMany({ where: { email: { contains: RUN } }, select: { id: true } });
    const uids = usuarios.map((u) => u.id);
    await bajoLockDeEscrituraReal(async () => {
      await base.historialAccion.deleteMany({
        where: { OR: [{ entidadId: { in: uids } }, { actorUsuarioId: { in: uids } }] },
      });
      await base.usuario.deleteMany({ where: { id: { in: uids } } });
      await base.organizacion.deleteMany({ where: { id: { in: [orgA, orgB].filter(Boolean) } } });
    });
    // Despues de borrar el superadmin del archivo: el siguiente que lo tome encuentra el hueco libre.
    await soltarSuperadmin();
    await base.$disconnect();
  }, 120_000);

  /* ------------------------------------------------------------------------ */
  /* R31 — listar y buscar                                                     */
  /* ------------------------------------------------------------------------ */

  it("R31: B lista (y busca por el sufijo común) solo los usuarios de B; el superadmin no sale en ninguna", async () => {
    const entrada = listarUsuariosSchema.parse({ q: RUN, pageSize: 100 });

    const deB = await comoB(() => servicio.listar(entrada, actorDe(ids.maestroB)));
    const deA = await conEmpresa(orgA, () => servicio.listar(entrada, actorDe(ids.maestroA)));

    expect(deB.status).toBe("ok");
    expect(deA.status).toBe("ok");
    if (deB.status !== "ok" || deA.status !== "ok") return;
    // B SÍ ve los suyos: sin esto el test pasaría también con un listado vacío.
    expect(new Set(deB.items.map((u) => u.id))).toEqual(new Set([ids.b1, ids.b2, ids.maestroB]));
    expect(deB.total).toBe(3);
    expect(new Set(deA.items.map((u) => u.id))).toEqual(new Set([ids.a1, ids.a2, ids.maestroA]));
    expect(deA.total).toBe(3);
    for (const listado of [deA, deB]) {
      expect(listado.items.map((u) => u.id)).not.toContain(ids.superadmin);
    }
  });

  it("R31: B busca por el nombre exacto de un usuario de A y no lo encuentra; A sí", async () => {
    const entrada = listarUsuariosSchema.parse({ q: `Persona a1 ${RUN}` });

    const deB = await comoB(() => servicio.listar(entrada, actorDe(ids.maestroB)));
    const deA = await conEmpresa(orgA, () => servicio.listar(entrada, actorDe(ids.maestroA)));

    expect(deB).toMatchObject({ status: "ok", items: [], total: 0 });
    expect(deA.status === "ok" && deA.items.map((u) => u.id)).toEqual([ids.a1]);
  });

  it("R31: la descarga completa de B tampoco trae usuarios de A ni al superadmin", async () => {
    const r = await comoB(() =>
      servicio.listarCompleto({ q: RUN, sortBy: "createdAt", sortDir: "desc" }, actorDe(ids.maestroB)),
    );

    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(new Set(r.items.map((u) => u.id))).toEqual(new Set([ids.b1, ids.b2, ids.maestroB]));
  });

  /* ------------------------------------------------------------------------ */
  /* R31 — editar y cambiar estado por id                                      */
  /* ------------------------------------------------------------------------ */

  it("R31: B obtiene, edita y cambia de estado por id a un usuario de A → «no encontrado», y la fila de A no cambia", async () => {
    const antes = await filaEnBase(ids.a1);
    const historialAntes = await base.historialAccion.count({ where: { entidadId: ids.a1 } });
    const actor = actorDe(ids.maestroB);

    const obtenido = await comoB(() => servicio.obtener(ids.a1, actor));
    const editado = await comoB(() =>
      servicio.actualizar(ids.a1, actualizarUsuarioSchema.parse({ nombre: "Editado por B", telefono: "11112222" }), actor),
    );
    const estado = await comoB(() =>
      servicio.cambiarEstado(ids.a1, cambiarEstadoUsuarioSchema.parse({ estado: "inactivo" }), actor),
    );

    expect([obtenido, editado, estado]).toEqual([
      { status: "not_found" },
      { status: "not_found" },
      { status: "not_found" },
    ]);
    expect(await filaEnBase(ids.a1)).toEqual(antes);
    expect(await base.historialAccion.count({ where: { entidadId: ids.a1 } })).toBe(historialAntes);
  });

  it("R31 (control): B sí edita y cambia de estado a un usuario suyo", async () => {
    const actor = actorDe(ids.maestroB);

    const editado = await comoB(() =>
      servicio.actualizar(ids.b2, actualizarUsuarioSchema.parse({ telefono: "33334444" }), actor),
    );
    const estado = await comoB(() =>
      servicio.cambiarEstado(ids.b2, cambiarEstadoUsuarioSchema.parse({ estado: "inactivo" }), actor),
    );

    expect(editado.status).toBe("ok");
    expect(estado.status).toBe("ok");
    expect(await filaEnBase(ids.b2)).toMatchObject({ telefono: "33334444", estado: "inactivo", organizacionId: orgB });
  });

  /* ------------------------------------------------------------------------ */
  /* R3 — `usuario` es la única tabla de negocio con empresa NULL              */
  /* ------------------------------------------------------------------------ */

  it("R3: en la base, solo `usuario.organizacion_id` admite NULL; en las demás tablas de negocio es NOT NULL", async () => {
    const tablas = MODELOS_DE_NEGOCIO.map((m) => m.tabla);
    const columnas = await base.$queryRawUnsafe<{ tabla: string; nula: string }[]>(
      `SELECT table_name AS tabla, is_nullable AS nula
         FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name = 'organizacion_id' AND table_name = ANY($1::text[])`,
      tablas,
    );
    const nulabilidad = new Map(columnas.map((c) => [c.tabla, c.nula]));

    // Cada tabla de la clasificación tiene que estar: una que falte no es «NOT NULL».
    expect(tablas.filter((t) => !nulabilidad.has(t))).toEqual([]);
    expect([...nulabilidad].filter(([, nula]) => nula === "YES").map(([t]) => t)).toEqual(["usuario"]);
  });

  it("R3: un INSERT con `organizacion_id` NULL explícito en otra tabla de negocio falla por NOT NULL", async () => {
    // Se captura una vez: una `PrismaPromise` esperada dos veces podría ejecutar el INSERT dos veces.
    const error = await base
      .$executeRawUnsafe(
        `INSERT INTO "zona" ("id", "nombre", "sinpe_numero", "sinpe_nombre", "organizacion_id")
         VALUES ($1, $2, '88887777', 'Prueba', NULL)`,
        randomUUID(),
        `zona-nula-${RUN}`,
      )
      .then(
        () => null,
        (e: unknown) => e,
      );

    // 23502 = not_null_violation, y sobre esta columna: otra NOT NULL de `zona` no cuenta.
    expect(error).toMatchObject({ meta: { driverAdapterError: { cause: { originalCode: "23502" } } } });
    expect(String((error as Error).message)).toMatch(/organizacion_id/);
    expect(await base.zona.count({ where: { nombre: `zona-nula-${RUN}` } })).toBe(0);
  });

  /* ------------------------------------------------------------------------ */
  /* R35 — ningún usuario sin empresa por olvido                               */
  /* ------------------------------------------------------------------------ */

  it("R35: crear un usuario por el repositorio en `conEmpresa(B)` le pone la empresa B", async () => {
    const datos = datosDeUsuario("r35-empresa");
    expect(datos).not.toHaveProperty("organizacionId");

    const creado = await comoB(() => repo.create(datos, ids.maestroB));

    expect((await filaEnBase(creado.id)).organizacionId).toBe(orgB);
  });

  it("R35: en `comoPlataforma`, crear un usuario sin la clave `organizacionId` lanza UsuarioSinEmpresa y no escribe", async () => {
    const datos = datosDeUsuario("r35-olvido");

    const intento = comoPlataforma(SUPERADMIN.ficha, SUPERADMIN.motivo, () => app.usuario.create({ data: datos }));

    await expect(intento).rejects.toBeInstanceOf(UsuarioSinEmpresa);
    expect(await base.usuario.count({ where: { email: datos.email } })).toBe(0);
  });

  it("R35: en `comoPlataforma`, con `organizacionId: null` explícito crea el usuario sin empresa (superadmin)", async () => {
    // SL-32 (R27): la base admite un solo superadmin, y el del `beforeAll` ya lo ocupa. Se borra
    // antes para que el alta de este caso sea la de verdad, y el nuevo pasa a ser el del archivo.
    await bajoLockDeEscrituraReal(() => base.usuario.delete({ where: { id: ids.superadmin } }));
    const datos = datosDeUsuario("r35-superadmin", rolSuperadmin);

    const creado = await comoPlataforma(SUPERADMIN.ficha, SUPERADMIN.motivo, () =>
      app.usuario.create({ data: { ...datos, organizacionId: null }, select: { id: true } }),
    );

    expect(await filaEnBase(creado.id)).toMatchObject({ email: datos.email, organizacionId: null });
    ids.superadmin = creado.id;
  });

  /* ------------------------------------------------------------------------ */
  /* R36 — email y cédula: desde SL-18 (R1) únicos POR EMPRESA                 */
  /* ------------------------------------------------------------------------ */
  // SL-17 R36 los dejó globales; SL-18 M1 los pasa a `(organizacion_id, email|cedula)`. Estos dos
  // casos decían «falla con P2002»; ahora la cuenta de B se crea, y dentro de B el repetido sigue
  // chocando con el error de dominio de siempre (SL-18 R2).

  it("SL-18 R1 (antes R36): un usuario de B con el email de un usuario de A se crea en B", async () => {
    const emailDeA = (await filaEnBase(ids.a1)).email;
    const datos = { ...datosDeUsuario("r36-email"), email: emailDeA };

    const creado = await comoB(() => repo.create(datos, ids.maestroB));

    expect(await filaEnBase(creado.id)).toMatchObject({ email: emailDeA, organizacionId: orgB });
    expect(await base.usuario.count({ where: { email: emailDeA } })).toBe(2);
    // Repetido en la MISMA empresa (B), el choque sigue llegando como error de dominio.
    const otraVez = { ...datosDeUsuario("r36-email-2"), email: emailDeA };
    await expect(comoB(() => repo.create(otraVez, ids.maestroB))).rejects.toEqual(new UsuarioDuplicadoError("email"));
    expect(await base.usuario.count({ where: { email: emailDeA } })).toBe(2);
  });

  it("SL-18 R1 (antes R36): un usuario de B con la cédula de un usuario de A se crea en B", async () => {
    const cedulaDeA = (await filaEnBase(ids.a1)).cedula;
    const datos = { ...datosDeUsuario("r36-cedula"), cedula: cedulaDeA };

    const creado = await comoB(() => repo.create(datos, ids.maestroB));

    expect(await filaEnBase(creado.id)).toMatchObject({ cedula: cedulaDeA, organizacionId: orgB });
    expect(await base.usuario.count({ where: { cedula: cedulaDeA } })).toBe(2);
    const otraVez = { ...datosDeUsuario("r36-cedula-2"), cedula: cedulaDeA };
    await expect(comoB(() => repo.create(otraVez, ids.maestroB))).rejects.toEqual(new UsuarioDuplicadoError("cedula"));
    expect(await base.usuario.count({ where: { cedula: cedulaDeA } })).toBe(2);
  });

  /* ------------------------------------------------------------------------ */
  /* R14 — el superadmin no tiene empresa por defecto                          */
  /* ------------------------------------------------------------------------ */

  it("R14: con el resolutor devolviendo null (superadmin), leer usuarios por el cliente de la app falla con EmpresaNoResuelta", async () => {
    const entrada = listarUsuariosSchema.parse({ q: RUN });

    await expect(servicio.listar(entrada, actorDe(ids.superadmin))).rejects.toBeInstanceOf(EmpresaNoResuelta);
    await expect(servicio.obtener(ids.b1, actorDe(ids.superadmin))).rejects.toBeInstanceOf(EmpresaNoResuelta);
    await expect(app.usuario.findMany({ where: { email: { contains: RUN } } })).rejects.toBeInstanceOf(
      EmpresaNoResuelta,
    );
  });
});
