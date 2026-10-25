import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { BovedaIntegraciones, ResumenSecretoSha256 } from "@/lib/crypto/boveda-integraciones";
import { conEmpresa, EmpresaNoResuelta } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import { PRISMA_OMIT } from "@/lib/db/prisma-client";
import type { NuevaIntegracion } from "@/lib/interfaces/repositories/IIntegracionRepository";
import { IntegracionRepository } from "@/lib/repositories/IntegracionRepository";
import { comoApp, crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";
import {
  CLAVE_LOCK_ESCRITURA_REAL,
  HAY_BASE_DE_DATOS,
  bajoLockDeEscrituraReal,
  clienteConSavepoint,
  crearPrismaDeTest,
  urlDeBaseDeDatos,
  type TxDeTest,
} from "./_postgres-real";
import { idDeRol, insertarUsuario } from "./_fixtures/superadmin-32";

// SL-36 T3.1 (design §2, §4, §13) — `IntegracionRepository` contra Postgres real, con DOS empresas:
// R5 (en la base solo `v<n>:` y hex de 64), R8 (B no lee, edita, prueba, regenera ni borra lo de A,
// por repositorio y por SQL a mano con RLS), R9 (id inválido, inexistente o de otra empresa: el mismo
// `null`), R10 (una por servicio, también con dos altas a la vez), R11 (número de A rechazado en B;
// liberado al desconectar), R14/R15 (lo que el repositorio escribe en una edición y en una prueba),
// R32 (borrado físico; el historial sobrevive) y R33 (las cinco acciones con su fila, sin secretos).
//
// POR QUÉ EL CLIENTE BASE. El cliente del test es el del dueño de las tablas y no lleva la extensión:
// ni filtra por empresa ni baja a `servi_app`. Así lo único que separa a A de B en los casos de
// repositorio es el `where` del propio repositorio, que es lo que este archivo existe para medir.
// La RLS se mide aparte, con `comoApp`, y la concurrencia con el cliente de la app.
//
// SIEMBRA OBLIGATORIA. Cada caso crea lo suyo y, antes de medir lo que B no ve, comprueba como dueño
// que la fila de A está ahí. Las empresas nacen en `beforeAll`; sin base, el archivo sale SKIPPED.
//
// Mutaciones medidas (progress/impl_SL-36-T3.md): sin `organizacionId` en el `where` de leer, editar
// o borrar cae R8; con el P2002 del número traducido a `ya_existe` cae R11.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;
let A: string;
let B: string;

const boveda = new BovedaIntegraciones(() => ({ activa: "v1", claves: new Map([["v1", Buffer.alloc(32, 0x5a)]]) }));
const resumidor = new ResumenSecretoSha256();

class Revertir extends Error {
  constructor(readonly valor: unknown) {
    super("rollback deliberado del test");
  }
}

/** Transacción del dueño que siempre se revierte, bajo el lock de escritura real de la 227. */
async function revertida<T>(fn: (tx: TxDeTest) => Promise<T>): Promise<T> {
  try {
    await base.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${CLAVE_LOCK_ESCRITURA_REAL})`);
        throw new Revertir(await fn(tx));
      },
      { timeout: 60_000, maxWait: 15_000 },
    );
  } catch (e) {
    if (e instanceof Revertir) return e.valor as T;
    throw e;
  }
  throw new Error("la transaccion termino sin revertirse: imposible");
}

/**
 * Corre `fn` como la empresa `org`: el contexto que lee el repositorio y el `set_config` que en
 * producción pone la envoltura de la extensión. Sin este último, el `DEFAULT` de
 * `historial_accion.organizacion_id` queda NULL (`appendAccion` no lo escribe: lo pone la extensión
 * o el DEFAULT). Sigue siendo el rol dueño: la RLS no actúa y solo el `where` separa a A de B.
 */
async function como<T>(tx: TxDeTest, org: string, fn: () => Promise<T>): Promise<T> {
  await fijarEmpresa(tx, org);
  return conEmpresa(org, fn);
}

/** Un número de WhatsApp que no está en ninguna otra fila de la base (el único es global). */
function numeroNuevo(): string {
  return `9${Date.now()}${Math.floor(Math.random() * 1e6)}`;
}

interface Alta {
  nueva: NuevaIntegracion;
  /** Lo que nunca puede aparecer en la base ni en el historial (R5, R33). */
  sensibles: string[];
}

async function altaWhatsapp(org: string, numero = numeroNuevo()): Promise<Alta> {
  const id = randomUUID();
  const claros = { token_acceso: `tok-claro-${randomUUID()}`, app_secret: `secreto-claro-${randomUUID()}` };
  const token = `verificacion-${randomUUID()}`;
  const secretos = {
    token_acceso: await boveda.cifrar(claros.token_acceso, { organizacionId: org, integracionId: id, campo: "token_acceso" }),
    app_secret: await boveda.cifrar(claros.app_secret, { organizacionId: org, integracionId: id, campo: "app_secret" }),
  };
  const whatsappResumenVerificacion = resumidor.resumen(token);
  return {
    nueva: {
      id,
      servicio: "whatsapp",
      datosPublicos: { nombreVisible: "Mensajería", wabaId: "120000000000001", telefonoVisible: "+506 0000 0000", nombreVerificado: "Mensajeria SA" },
      secretos,
      whatsappNumeroId: numero,
      whatsappResumenVerificacion,
      probadaAt: new Date("2026-10-25T10:00:00.000Z"),
    },
    sensibles: [
      claros.token_acceso,
      claros.app_secret,
      Buffer.from(claros.token_acceso).toString("base64"),
      secretos.token_acceso,
      secretos.app_secret,
      token,
      whatsappResumenVerificacion,
      numero,
    ],
  };
}

async function altaMaps(org: string): Promise<Alta> {
  const id = randomUUID();
  const claro = `clave-maps-${randomUUID()}`;
  const clave_api = await boveda.cifrar(claro, { organizacionId: org, integracionId: id, campo: "clave_api" });
  return {
    nueva: { id, servicio: "google_maps", datosPublicos: {}, secretos: { clave_api }, probadaAt: new Date() },
    sensibles: [claro, clave_api],
  };
}

/** Repositorio sobre la tx del caso; su `$transaction` abre un SAVEPOINT real (un P2002 no aborta el caso). */
function repoDe(tx: TxDeTest): IntegracionRepository {
  return new IntegracionRepository(clienteConSavepoint(tx));
}

type FilaDueno = {
  id: string;
  organizacion_id: string;
  estado: string;
  secretos: Record<string, string>;
  whatsapp_numero_id: string | null;
  whatsapp_resumen_verificacion: string | null;
  ultimo_error_codigo: string | null;
  ultima_prueba_at: Date | null;
  ultimo_webhook_at: Date | null;
  updated_at: Date;
};

/** La fila medida como dueño, sin filtro de empresa: lo que de verdad hay en la base. */
async function filaComoDueno(tx: TxDeTest, id: string): Promise<FilaDueno | null> {
  const filas = await tx.$queryRawUnsafe<FilaDueno[]>(
    `SELECT id, organizacion_id, estado::text AS estado, secretos, whatsapp_numero_id,
            whatsapp_resumen_verificacion, ultimo_error_codigo, ultima_prueba_at, ultimo_webhook_at, updated_at
       FROM integracion WHERE id = $1`,
    id,
  );
  return filas[0] ?? null;
}

type FilaHistorial = {
  accion: string;
  entidad_tipo: string;
  entidad_etiqueta: string;
  actor_usuario_id: string | null;
  actor_rol: string | null;
  valor_anterior: string | null;
  valor_nuevo: string | null;
  organizacion_id: string;
};

async function historialDe(tx: TxDeTest, entidadId: string): Promise<FilaHistorial[]> {
  return tx.$queryRawUnsafe<FilaHistorial[]>(
    `SELECT accion::text AS accion, entidad_tipo::text AS entidad_tipo, entidad_etiqueta, actor_usuario_id,
            actor_rol::text AS actor_rol, valor_anterior, valor_nuevo, organizacion_id
       FROM historial_accion WHERE entidad_id = $1 ORDER BY created_at, accion`,
    entidadId,
  );
}

describeSiHayBase("SL-36 T3.1 — IntegracionRepository con dos empresas contra Postgres", () => {
  beforeAll(async () => {
    base = crearPrismaDeTest();
    await bajoLockDeEscrituraReal(async () => {
      A = (await crearOrganizacion(base, { nombre: "Empresa A SL36 repo" })).id;
      B = (await crearOrganizacion(base, { nombre: "Empresa B SL36 repo" })).id;
    });
    expect(await base.organizacion.count({ where: { id: { in: [A, B] } } })).toBe(2);
  }, 60_000);

  afterAll(async () => {
    if (A !== undefined && B !== undefined) {
      await bajoLockDeEscrituraReal(async () => {
        for (const tabla of ["historial_accion", "integracion", "integracion_prueba_minuto"]) {
          await base.$executeRawUnsafe(`DELETE FROM "${tabla}" WHERE organizacion_id = ANY($1::text[])`, [A, B]);
        }
        await base.$executeRawUnsafe(`DELETE FROM organizacion WHERE id = ANY($1::text[])`, [A, B]);
      });
    }
    await base?.$disconnect();
  }, 60_000);

  it("sin contexto de empresa, falla con EmpresaNoResuelta sin consultar", async () => {
    const repo = new IntegracionRepository(base);
    await expect(repo.listar()).rejects.toBeInstanceOf(EmpresaNoResuelta);
    await expect(repo.porServicio("whatsapp")).rejects.toBeInstanceOf(EmpresaNoResuelta);
    await expect(repo.borrar(randomUUID(), null)).rejects.toBeInstanceOf(EmpresaNoResuelta);
  });

  it("R5: en la base solo hay v<n>: y hex de 64; la lectura no trae el resumen ni texto en claro", async () => {
    const r = await revertida(async (tx) => {
      const alta = await altaWhatsapp(A);
      const creada = await como(tx, A,() => repoDe(tx).crear(alta.nueva, null));
      const fila = await filaComoDueno(tx, alta.nueva.id);
      const leida = await como(tx, A,() => repoDe(tx).porId(alta.nueva.id));
      const lista = await como(tx, A,() => repoDe(tx).listar());
      return { alta, creada, fila, leida, lista };
    });

    expect(r.creada.status).toBe("creada");
    expect(r.fila).not.toBeNull();
    const valores = Object.values(r.fila!.secretos);
    expect(valores).toHaveLength(2);
    // La forma COMPLETA del contrato (CHECK `integracion_secretos_cifrados` y la boveda), escrita
    // aqui y no importada: si la boveda cambiara de forma, este literal es el que lo delata.
    // `v<n>:<iv>:<tag>:<cifrado>` en base64 ESTANDAR (con `+` y `/`, nunca base64url): iv de 12
    // bytes = 16 caracteres sin relleno, tag de 16 bytes = 22 caracteres + `==`, cifrado no vacio
    // y con su relleno canonico. Anclada al final: nada puede colgar detras del cifrado.
    const FORMA_CIFRADA =
      /^v[1-9][0-9]*:[A-Za-z0-9+/]{16}:[A-Za-z0-9+/]{22}==:(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{4}|[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)$/;
    for (const v of valores) expect(v).toMatch(FORMA_CIFRADA);
    expect(r.fila!.whatsapp_resumen_verificacion).toMatch(/^[0-9a-f]{64}$/);
    const enBase = JSON.stringify(r.fila);
    for (const claro of r.alta.sensibles.slice(0, 3)) expect(enBase).not.toContain(claro);

    // La lectura nunca proyecta el resumen; la vista (sin secretos) tampoco lleva los cifrados.
    expect(Object.keys(r.leida!).sort()).toEqual(
      ["datosPublicos", "estado", "id", "secretos", "servicio", "ultimaPruebaAt", "ultimoErrorCodigo", "ultimoWebhookAt", "whatsappNumeroId"].sort(),
    );
    expect(JSON.stringify(r.leida)).not.toContain(r.alta.nueva.whatsappResumenVerificacion as string);
    const vista = JSON.stringify(r.lista);
    expect(r.lista.map((i) => i.id)).toEqual([r.alta.nueva.id]);
    for (const s of r.alta.sensibles.filter((x) => x !== r.alta.nueva.whatsappNumeroId)) expect(vista).not.toContain(s);
  });

  it("R8: B no lee, edita, prueba, regenera, marca ni borra la de A por el repositorio; A sigue intacta", async () => {
    const r = await revertida(async (tx) => {
      const alta = await altaWhatsapp(A);
      expect((await como(tx, A,() => repoDe(tx).crear(alta.nueva, null))).status).toBe("creada");
      const antes = await filaComoDueno(tx, alta.nueva.id);
      // Siembra comprobada como dueño: sin la fila de A, todo lo de abajo mediría el vacío.
      expect(antes?.organizacion_id).toBe(A);

      const id = alta.nueva.id;
      const repo = repoDe(tx);
      const deB = await como(tx, B,async () => ({
        porId: await repo.porId(id),
        porServicio: await repo.porServicio("whatsapp"),
        lista: await repo.listar(),
        actualizar: await repo.actualizar(id, { datosPublicos: { ...alta.nueva.datosPublicos, nombreVisible: "de B" } }, null),
        prueba: await repo.registrarPrueba(id, { ok: false, codigo: "prueba_fallida.whatsapp.proveedor" }, new Date(), null),
        token: await repo.regenerarToken(id, "b".repeat(64), null),
        borrar: await repo.borrar(id, null),
        marcar: await repo.marcarError("whatsapp", "whatsapp.credencial_rechazada"),
        webhook: await repo.anotarWebhook(id, new Date()),
      }));
      return { antes, despues: await filaComoDueno(tx, id), deB, historial: await historialDe(tx, id) };
    });

    expect(r.deB).toEqual({
      porId: null,
      porServicio: null,
      lista: [],
      actualizar: { status: "no_encontrada" },
      prueba: false,
      token: false,
      borrar: null,
      marcar: undefined,
      webhook: undefined,
    });
    // Ni una columna de A cambió, y B no dejó ninguna fila de historial sobre ella.
    expect(r.despues).toEqual(r.antes);
    expect(r.historial.map((h) => h.accion)).toEqual(["integracion_conectada"]);
  });

  it("R8: con comoApp(B), el SQL a mano no ve, no cambia ni borra la fila de A (RLS)", async () => {
    const r = await revertida(async (tx) => {
      const alta = await altaWhatsapp(A);
      await como(tx, A,() => repoDe(tx).crear(alta.nueva, null));
      const antes = await filaComoDueno(tx, alta.nueva.id);
      expect(antes?.organizacion_id).toBe(A);

      await comoApp(tx, B);
      const vistas = await tx.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM integracion WHERE id = $1`, alta.nueva.id);
      const cambiadas = await tx.$executeRawUnsafe(`UPDATE integracion SET estado = 'error' WHERE id = $1`, alta.nueva.id);
      const borradas = await tx.$executeRawUnsafe(`DELETE FROM integracion WHERE id = $1`, alta.nueva.id);
      // Y por el repositorio, con las dos capas a la vez.
      const porRepo = await como(tx, B,() => repoDe(tx).porId(alta.nueva.id));
      await tx.$executeRawUnsafe(`SET LOCAL ROLE NONE`);
      return { antes, vistas: vistas[0].n, cambiadas, borradas, porRepo, despues: await filaComoDueno(tx, alta.nueva.id) };
    });

    expect(r).toMatchObject({ vistas: 0, cambiadas: 0, borradas: 0, porRepo: null });
    expect(r.despues).toEqual(r.antes);
  });

  it("R9: id sin forma, inexistente o de otra empresa dan el mismo null", async () => {
    const r = await revertida(async (tx) => {
      const alta = await altaMaps(A);
      await como(tx, A,() => repoDe(tx).crear(alta.nueva, null));
      expect((await filaComoDueno(tx, alta.nueva.id))?.organizacion_id).toBe(A);
      const repo = repoDe(tx);
      return como(tx, B,async () => [
        await repo.porId("no-es-un-uuid"),
        await repo.porId(randomUUID()),
        await repo.porId(alta.nueva.id),
      ]);
    });
    expect(r).toEqual([null, null, null]);
  });

  it("R10: la segunda alta del mismo servicio en la empresa es ya_existe; la de otra empresa entra", async () => {
    const r = await revertida(async (tx) => {
      const repo = repoDe(tx);
      const primera = await como(tx, A,async () => repo.crear((await altaMaps(A)).nueva, null));
      const segunda = await como(tx, A,async () => repo.crear((await altaMaps(A)).nueva, null));
      const deB = await como(tx, B,async () => repo.crear((await altaMaps(B)).nueva, null));
      const filas = await tx.$queryRawUnsafe<{ organizacion_id: string; n: number }[]>(
        `SELECT organizacion_id, count(*)::int AS n FROM integracion
          WHERE organizacion_id = ANY($1::text[]) AND servicio = 'google_maps' GROUP BY organizacion_id`,
        [A, B],
      );
      return { primera: primera.status, segunda, deB: deB.status, filas: Object.fromEntries(filas.map((f) => [f.organizacion_id, f.n])) };
    });
    expect(r).toEqual({ primera: "creada", segunda: { status: "ya_existe" }, deB: "creada", filas: { [A]: 1, [B]: 1 } });
  });

  it("R10: dos altas concurrentes del mismo servicio dejan una sola fila (cliente de la app, commiteado)", async () => {
    // Cliente propio con pool de 4: las dos altas van por conexiones distintas y se esperan en el
    // índice único, que es lo que la concurrencia real hace. Con el cliente de la app (extensión +
    // RLS) y `servi_app`, como en producción.
    const crudo = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlDeBaseDeDatos(), max: 4 }), omit: PRISMA_OMIT });
    const app = conAislamientoPorEmpresa(crudo as unknown as PrismaClient, async () => null);
    try {
      const [uno, dos] = await Promise.all([altaMaps(A), altaMaps(A)]);
      const repo = new IntegracionRepository(app);
      const resultados = await bajoLockDeEscrituraReal(() =>
        conEmpresa(A, () => Promise.all([repo.crear(uno.nueva, null), repo.crear(dos.nueva, null)])),
      );
      const estados = resultados.map((x) => x.status).sort();
      const filas = await base.integracion.findMany({ where: { organizacionId: A, servicio: "google_maps" }, select: { id: true } });
      const historial = await base.historialAccion.count({
        where: { entidadId: { in: [uno.nueva.id, dos.nueva.id] }, accion: "integracion_conectada" },
      });

      expect(estados).toEqual(["creada", "ya_existe"]);
      expect(filas).toHaveLength(1);
      expect([uno.nueva.id, dos.nueva.id]).toContain(filas[0].id);
      // La alta perdedora no deja rastro: su historial iba en la transacción que se revirtió.
      expect(historial).toBe(1);
    } finally {
      await crudo.$disconnect();
    }
  }, 60_000);

  it("R11: número de A rechazado en B como numero_ocupado (alta y edición); liberado al desconectar", async () => {
    const r = await revertida(async (tx) => {
      const repo = repoDe(tx);
      const numero = numeroNuevo();
      const deA = await altaWhatsapp(A, numero);
      expect((await como(tx, A,() => repo.crear(deA.nueva, null))).status).toBe("creada");

      const altaEnB = await como(tx, B,async () => repo.crear((await altaWhatsapp(B, numero)).nueva, null));
      const propiaDeB = await altaWhatsapp(B);
      expect((await como(tx, B,() => repo.crear(propiaDeB.nueva, null))).status).toBe("creada");
      const edicionEnB = await como(tx, B,() => repo.actualizar(propiaDeB.nueva.id, { whatsappNumeroId: numero }, null));
      const deBAntes = await filaComoDueno(tx, propiaDeB.nueva.id);

      expect(await como(tx, A,() => repo.borrar(deA.nueva.id, null))).toBe("whatsapp");
      const edicionTrasLiberar = await como(tx, B,() => repo.actualizar(propiaDeB.nueva.id, { whatsappNumeroId: numero }, null));
      return {
        altaEnB,
        edicionEnB,
        numeroDeBAntes: deBAntes?.whatsapp_numero_id,
        propio: propiaDeB.nueva.whatsappNumeroId,
        tras: edicionTrasLiberar.status,
        numeroDeBDespues: (await filaComoDueno(tx, propiaDeB.nueva.id))?.whatsapp_numero_id,
        numero,
      };
    });

    expect(r.altaEnB).toEqual({ status: "numero_ocupado" });
    expect(r.edicionEnB).toEqual({ status: "numero_ocupado" });
    expect(r.numeroDeBAntes).toBe(r.propio);
    expect(r.tras).toBe("guardada");
    expect(r.numeroDeBDespues).toBe(r.numero);
  });

  it("otra violación de unicidad (el resumen del token repetido) se propaga sin traducirse", async () => {
    const r = await revertida(async (tx) => {
      const repo = repoDe(tx);
      const deA = await altaWhatsapp(A);
      await como(tx, A,() => repo.crear(deA.nueva, null));
      const deB = await altaWhatsapp(B);
      const choque = { ...deB.nueva, whatsappResumenVerificacion: deA.nueva.whatsappResumenVerificacion } as NuevaIntegracion;
      return como(tx, B,() => repo.crear(choque, null).then(() => "sin error", (e: { code?: string }) => e.code));
    });
    expect(r).toBe("P2002");
  });

  it("R14/R15: la edición conserva el cifrado intacto de lo que no cambia; la prueba fija estado, código y hora", async () => {
    const r = await revertida(async (tx) => {
      const repo = repoDe(tx);
      const alta = await altaWhatsapp(A);
      const id = alta.nueva.id;
      await como(tx, A,() => repo.crear(alta.nueva, null));
      const t1 = new Date("2026-10-25T11:00:00.000Z");
      await como(tx, A,() => repo.registrarPrueba(id, { ok: false, codigo: "prueba_fallida.whatsapp.sin_respuesta" }, t1, null));
      const trasFallo = await filaComoDueno(tx, id);

      // Solo un dato que la prueba no verifica: sin `probadaAt`, el estado no se toca (R14).
      await como(tx, A,() => repo.actualizar(id, { datosPublicos: { ...alta.nueva.datosPublicos, nombreVisible: "Otro nombre" } }, null));
      const trasNombre = await filaComoDueno(tx, id);

      const tokenNuevo = await boveda.cifrar("tok-nuevo", { organizacionId: A, integracionId: id, campo: "token_acceso" });
      const t2 = new Date("2026-10-25T12:00:00.000Z");
      await como(tx, A,() => repo.actualizar(id, { secretos: { token_acceso: tokenNuevo }, probadaAt: t2 }, null));
      const trasSecreto = await filaComoDueno(tx, id);
      const leida = await como(tx, A,() => repo.porId(id));
      return { alta, trasFallo, trasNombre, trasSecreto, tokenNuevo, t1, t2, leida };
    });

    expect(r.trasFallo).toMatchObject({ estado: "error", ultimo_error_codigo: "prueba_fallida.whatsapp.sin_respuesta", ultima_prueba_at: r.t1 });
    expect(r.trasNombre).toMatchObject({ estado: "error", ultimo_error_codigo: "prueba_fallida.whatsapp.sin_respuesta", ultima_prueba_at: r.t1 });
    expect(r.trasNombre?.secretos).toEqual(r.alta.nueva.secretos);
    expect(r.trasSecreto).toMatchObject({ estado: "conectada", ultimo_error_codigo: null, ultima_prueba_at: r.t2 });
    // El App Secret, que no llegó, es el MISMO texto cifrado: no se descifró ni se volvió a cifrar.
    expect(r.trasSecreto?.secretos).toEqual({
      token_acceso: r.tokenNuevo,
      app_secret: (r.alta.nueva.secretos as Record<string, string>).app_secret,
    });
    expect(r.leida?.datosPublicos).toMatchObject({ nombreVisible: "Otro nombre" });
  });

  it("R32: desconectar borra la fila y sus secretos; el historial sobrevive", async () => {
    const r = await revertida(async (tx) => {
      const repo = repoDe(tx);
      const alta = await altaWhatsapp(A);
      await como(tx, A,() => repo.crear(alta.nueva, null));
      expect(await filaComoDueno(tx, alta.nueva.id)).not.toBeNull();
      const servicio = await como(tx, A,() => repo.borrar(alta.nueva.id, null));
      const restos = await tx.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM integracion WHERE id = $1 OR secretos::text LIKE $2`,
        alta.nueva.id,
        `%${(alta.nueva.secretos as Record<string, string>).token_acceso.slice(0, 40)}%`,
      );
      return {
        servicio,
        restos: restos[0].n,
        porServicio: await como(tx, A,() => repo.porServicio("whatsapp")),
        historial: (await historialDe(tx, alta.nueva.id)).map((h) => h.accion),
      };
    });
    expect(r).toEqual({
      servicio: "whatsapp",
      restos: 0,
      porServicio: null,
      historial: ["integracion_conectada", "integracion_desconectada"],
    });
  });

  it("R33: alta, edición, prueba, regenerar y desconectar dejan su fila de historial sin secretos", async () => {
    const r = await revertida(async (tx) => {
      const maestro = await insertarUsuario(tx, await idDeRol(tx, "maestro"), A);
      if (!maestro.desenlace.ok) throw new Error(`no se sembro el maestro: ${JSON.stringify(maestro.desenlace)}`);
      const repo = repoDe(tx);
      const alta = await altaWhatsapp(A);
      const id = alta.nueva.id;
      const quien = maestro.id;
      const otroToken = resumidor.resumen(`otro-${randomUUID()}`);
      await como(tx, A,async () => {
        await repo.crear(alta.nueva, quien);
        await repo.actualizar(id, { datosPublicos: { ...alta.nueva.datosPublicos, nombreVisible: "Editado" } }, quien);
        await repo.registrarPrueba(id, { ok: true }, new Date(), quien);
        await repo.registrarPrueba(id, { ok: false, codigo: "prueba_fallida.whatsapp.credencial_rechazada" }, new Date(), quien);
        await repo.regenerarToken(id, otroToken, quien);
        await repo.borrar(id, quien);
      });
      return { quien, historial: await historialDe(tx, id), sensibles: [...alta.sensibles, otroToken] };
    });

    // `created_at` es el de la transacción (`now()`): el orden se afirma por conjunto, no por posición.
    expect(r.historial.map((h) => [h.accion, h.valor_nuevo]).sort()).toEqual(
      [
        ["integracion_actualizada", null],
        ["integracion_conectada", null],
        ["integracion_desconectada", null],
        ["integracion_probada", "ok"],
        ["integracion_probada", "prueba_fallida.whatsapp.credencial_rechazada"],
        ["integracion_token_regenerado", null],
      ].sort(),
    );
    for (const h of r.historial) {
      expect(h).toMatchObject({
        entidad_tipo: "integracion",
        entidad_etiqueta: "WhatsApp Business",
        actor_usuario_id: r.quien,
        actor_rol: "maestro",
        valor_anterior: null,
        organizacion_id: A,
      });
    }
    const texto = JSON.stringify(r.historial);
    for (const s of r.sensibles) expect(texto).not.toContain(s);
  });
});
