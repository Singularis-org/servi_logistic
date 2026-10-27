import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { registrarSuscripcionPush, type PushActionDeps } from "@/lib/actions/push";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import { PushEndpointPlataformaRepository } from "@/lib/repositories/PushEndpointPlataformaRepository";
import { PushSuscripcionRepository } from "@/lib/repositories/PushSuscripcionRepository";
import { UsuarioPreferenciaRepository } from "@/lib/repositories/UsuarioPreferenciaRepository";

import { crearOrganizacion } from "../../fabricas/organizaciones";
import { HAY_BASE_DE_DATOS, bajoLockDeEscrituraReal, crearPrismaDeTest } from "./_postgres-real";

// SL-18 / T6.1 (design §7) — R26, R27 y R28: PUSH, EL ÚLTIMO GANA, contra Postgres.
//
// Las piezas son las de la app: `registrarSuscripcionPush` con los repositorios reales sobre el
// cliente EXTENDIDO (filtro de empresa + RLS), y la empresa puesta con `conEmpresa`, que es lo que
// la petición hace en producción. Lo que queda en la base se mide con el cliente BASE, que no
// filtra. Los destinatarios de A se leen por `PushSuscripcionRepository.listarPorUsuarios` en el
// contexto de A: es la consulta con la que `PushWebService.entregarA` decide a qué navegadores sale
// un aviso.
//
// No cabe en una transacción revertida: el paso de plataforma y el alta corren en contextos
// distintos (cada uno con su conexión). Los datos se commitean con un sufijo único por ejecución y
// se borran en `afterAll`, bajo el lock de la 227 como la siembra.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const RUN = randomUUID().replace(/-/g, "").slice(0, 10);
const ENDPOINT = (n: string) => `https://fcm.googleapis.com/fcm/send/sl18-${n}-${RUN}`;

let base: PrismaClient;
let app: PrismaClient;
let orgA: string;
let orgB: string;
const u = { a1: "", a2: "", b1: "" };

function deps(usuarioId: string, organizacionId: string): PushActionDeps {
  return {
    repo: new PushSuscripcionRepository(app),
    plataformaRepo: new PushEndpointPlataformaRepository(app),
    preferenciaRepo: new UsuarioPreferenciaRepository(app),
    getActor: async () => ({ usuarioId, rol: "mensajero", zonaId: null, organizacionId }),
  };
}

/** El alta tal como llega desde el navegador: la action, en la empresa de la sesión. */
async function registrarComo(usuarioId: string, organizacionId: string, endpoint: string, clave = "P256") {
  const r = await conEmpresa(organizacionId, () =>
    registrarSuscripcionPush({ endpoint, p256dh: `${clave}-${RUN}`, auth: "AUTH" }, deps(usuarioId, organizacionId)),
  );
  expect(r).toEqual({ status: "ok" });
}

/** Lo que hay en la base para ese endpoint, sin filtro de empresa. */
function filasDe(endpoint: string) {
  return base.pushSuscripcion.findMany({
    where: { endpoint },
    select: { id: true, usuarioId: true, organizacionId: true, p256dh: true, updatedAt: true },
  });
}

/** Los endpoints a los que sale un aviso para ese usuario de A: el camino real del envío. */
async function endpointsDestinoEnA(usuarioId: string): Promise<string[]> {
  const subs = await conEmpresa(orgA, () => new PushSuscripcionRepository(app).listarPorUsuarios([usuarioId]));
  return subs.map((s) => s.endpoint).sort();
}

describeSiHayBase("SL-18 — push: el último gana (Postgres)", () => {
  beforeAll(async () => {
    base = crearPrismaDeTest();
    // Sin sesión: la empresa solo puede venir de `conEmpresa`. Fuera de él, todo falla cerrado.
    app = conAislamientoPorEmpresa(base, async () => null);

    const rol = await base.rol.findFirstOrThrow({ where: { value: "mensajero" }, select: { id: true } });
    const tipo = await base.tipoIdentificacion.findUniqueOrThrow({ where: { value: "cedula" }, select: { id: true } });
    const usuario = async (organizacionId: string, tag: string) =>
      (
        await base.usuario.create({
          data: {
            nombre: `SL18 push ${tag} ${RUN}`,
            email: `sl18-push-${tag}-${RUN}@ejemplo.test`,
            telefono: "88880000",
            passwordHash: "x",
            cedula: `sl18p-${tag}-${RUN}`,
            tipoIdentificacionId: tipo.id,
            rolId: rol.id,
            estado: "activo",
            organizacionId,
          },
          select: { id: true },
        })
      ).id;

    await bajoLockDeEscrituraReal(async () => {
      orgA = (await crearOrganizacion(base, { nombre: `SL18 push A ${RUN}` })).id;
      orgB = (await crearOrganizacion(base, { nombre: `SL18 push B ${RUN}` })).id;
      u.a1 = await usuario(orgA, "a1");
      u.a2 = await usuario(orgA, "a2");
      u.b1 = await usuario(orgB, "b1");
    });
  }, 120_000);

  afterAll(async () => {
    if (base === undefined) return;
    await bajoLockDeEscrituraReal(async () => {
      const uids = Object.values(u).filter(Boolean);
      // `push_suscripcion` y `usuario_preferencia` caen por la cascada de `usuario`.
      await base.pushSuscripcion.deleteMany({ where: { endpoint: { contains: RUN } } });
      await base.usuario.deleteMany({ where: { id: { in: uids } } });
      await base.organizacion.deleteMany({ where: { id: { in: [orgA, orgB].filter(Boolean) } } });
    });
    await base.$disconnect();
  }, 120_000);

  it("⭑ R26 + R28: el navegador de A registrado en B queda solo en B, A deja de enviarle y nada más cambia", async () => {
    const compartido = ENDPOINT("compartido");
    const otroDeA = ENDPOINT("otro-a");
    const otroDeB = ENDPOINT("otro-b");

    await registrarComo(u.a1, orgA, compartido);
    await registrarComo(u.a2, orgA, otroDeA);
    await registrarComo(u.b1, orgB, otroDeB);

    // Control positivo: antes del cambio, A SÍ envía a ese navegador. Sin esto, el «ya no lo
    // incluye» de abajo pasaría también con una lectura que no devolviera nada.
    expect(await endpointsDestinoEnA(u.a1)).toEqual([compartido]);
    const antesOtros = [...(await filasDe(otroDeA)), ...(await filasDe(otroDeB))];
    expect(antesOtros).toHaveLength(2);

    // El mismo navegador, ahora con la cuenta de B.
    await registrarComo(u.b1, orgB, compartido, "P256-NUEVA");

    // R26: una sola fila para ese endpoint, la de B.
    const filas = await filasDe(compartido);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ usuarioId: u.b1, organizacionId: orgB, p256dh: `P256-NUEVA-${RUN}` });

    // R26: los avisos de A ya no salen a ese navegador.
    expect(await endpointsDestinoEnA(u.a1)).toEqual([]);

    // R28: los otros endpoints, de A y de B, siguen idénticos (dueño, empresa, claves y sello).
    const despuesOtros = [...(await filasDe(otroDeA)), ...(await filasDe(otroDeB))];
    expect(despuesOtros).toEqual(antesOtros);
    expect(await endpointsDestinoEnA(u.a2)).toEqual([otroDeA]);
  });

  it("⭑ R27: el mismo navegador cambia de cuenta dentro de A y el dueño se reescribe", async () => {
    const telefono = ENDPOINT("misma-empresa");

    await registrarComo(u.a1, orgA, telefono);
    const antes = await filasDe(telefono);
    expect(antes).toHaveLength(1);

    await registrarComo(u.a2, orgA, telefono, "P256-A2");

    const despues = await filasDe(telefono);
    expect(despues).toHaveLength(1);
    // La MISMA fila (upsert de la ficha 410), con el dueño nuevo y en la misma empresa.
    expect(despues[0]).toMatchObject({ id: antes[0].id, usuarioId: u.a2, organizacionId: orgA, p256dh: `P256-A2-${RUN}` });
    expect(await endpointsDestinoEnA(u.a1)).not.toContain(telefono);
    expect(await endpointsDestinoEnA(u.a2)).toContain(telefono);
  });

  it("R28: el paso de plataforma, llamado a secas, no borra la fila de la propia empresa ni otro endpoint", async () => {
    const propio = ENDPOINT("propio-b");
    const ajeno = ENDPOINT("ajeno-a");
    await registrarComo(u.b1, orgB, propio);
    await registrarComo(u.a1, orgA, ajeno);

    const plataforma = new PushEndpointPlataformaRepository(app);
    // Desde B, sobre su propio endpoint: no es «de otra empresa», no se toca.
    expect(await plataforma.liberarDeOtrasEmpresas(propio, orgB)).toBe(0);
    // Desde A, sobre el mismo endpoint de B: sí se libera, y SOLO ese.
    expect(await plataforma.liberarDeOtrasEmpresas(propio, orgA)).toBe(1);

    expect(await filasDe(propio)).toEqual([]);
    expect(await filasDe(ajeno)).toHaveLength(1);
  });
});
