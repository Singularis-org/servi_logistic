import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { comoPlataforma, conEmpresa } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import { OrganizacionRepository } from "@/lib/repositories/OrganizacionRepository";
import { PremioRankingRepository } from "@/lib/repositories/PremioRankingRepository";
import { UserRepository } from "@/lib/repositories/UserRepository";
import { EmailOtpChallengeRepository } from "@/lib/repositories/EmailOtpChallengeRepository";
import { OrganizacionService } from "@/lib/services/OrganizacionService";
import { PasswordResetService } from "@/lib/services/PasswordResetService";
import { verifyPassword } from "@/lib/utils/password";
import type { EmailMessage } from "@/lib/interfaces/external/IEmailSender";
import type { AltaEmpresaResultado } from "@/lib/types/organizacion";
import { crearPaisDePrueba } from "@/tests/fabricas/paises";
import { HAY_BASE_DE_DATOS, bajoLockDeEscrituraReal, clienteConTransaccionAnidada, crearPrismaDeTest } from "./_postgres-real";
import { revertida } from "./_fixtures/pais-20";

// SL-17 / T2.8 (design §7.7) — R44, R45, R46 contra Postgres real, por el cliente EXTENDIDO
// (el de la app) y en el contexto de plataforma que pone `altaEmpresaAction`. Las cuentas de
// filas se hacen con el cliente base, que no filtra: ven todo lo que quedó escrito.
//
// Datos propios: slugs, emails y documentos con un sufijo único por ejecución. Solo se usan los
// catálogos `rol` y `tipo_identificacion` que dejan las migraciones. Todo lo creado se borra al
// final (el repositorio abre su propia transacción, así que no cabe dentro de una revertida).
//
// SL-20 (T2.2; R6, R8): el alta lleva el país. Los casos que necesitan un SEGUNDO país (`XA`) corren
// en una transacción revertida con el repositorio sobre `clienteConTransaccionAnidada`: así el país de
// prueba no llega a confirmarse y no lo ve ningún otro archivo de la suite.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const RUN = randomUUID().slice(0, 8);
const conSufijo = (base: string) => `${base}-${RUN}`;

let base: PrismaClient;
let app: PrismaClient;
const slugsCreados = new Set<string>();

function entrada(slug: string, email: string, documento: string, paisId = "CR") {
  slugsCreados.add(slug);
  return {
    nombre: `Empresa ${slug}`,
    slug,
    paisId,
    maestro: { nombre: "Maestra de prueba", email, telefono: "88887777", documento, tipoDocumento: "cedula" },
  };
}

// El alta commitea `organizacion`, `usuario` y su podio fuera de una transaccion revertida: bajo el
// lock de la 227, para no cruzarse con un `down.sql` serializado (ver `bajoLockDeEscrituraReal`).
function alta(input: unknown): Promise<AltaEmpresaResultado> {
  const servicio = new OrganizacionService(new OrganizacionRepository(app));
  return bajoLockDeEscrituraReal(() =>
    comoPlataforma("SL-17", "test de alta de empresa", () => servicio.altaEmpresa(input)),
  );
}

// Acotado a lo que esta ejecución puede escribir (todo slug pasa por `entrada`, y todo email o
// documento lleva `RUN`): un conteo global se rompía cuando otros archivos de la suite commitean
// organizaciones en paralelo. Una escritura de más de ESTE test sigue apareciendo aquí.
async function filas(): Promise<{ organizaciones: number; usuarios: number; podio: number }> {
  const [organizaciones, usuarios, podio] = await Promise.all([
    base.organizacion.count({ where: { slug: { in: [...slugsCreados] } } }),
    base.usuario.count({ where: { OR: [{ email: { contains: RUN } }, { cedula: { contains: RUN } }] } }),
    // SL-17 T3.9: el podio que siembra el alta, de las empresas de esta ejecución.
    base.premioRanking.count({ where: { organizacion: { slug: { in: [...slugsCreados] } } } }),
  ]);
  return { organizaciones, usuarios, podio };
}

/** El podio de una empresa tal como quedó en la base, sin pasar por la extensión. */
async function podioDe(organizacionId: string) {
  return base.premioRanking.findMany({
    where: { organizacionId },
    select: { organizacionId: true, posicion: true, monto: true, descripcion: true },
    orderBy: { posicion: "asc" },
  });
}

const podioVacio = (organizacionId: string) =>
  [1, 2, 3].map((posicion) => ({ organizacionId, posicion, monto: null, descripcion: null }));

describeSiHayBase("SL-17 — alta de empresa contra Postgres", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
    // Sin sesión: fuera de `comoPlataforma` toda operación de negocio fallaría cerrado (R11).
    app = conAislamientoPorEmpresa(base, async () => null);
  });

  afterAll(async () => {
    const orgs = await base.organizacion.findMany({ where: { slug: { in: [...slugsCreados] } }, select: { id: true } });
    const ids = orgs.map((o) => o.id);
    const usuarios = await base.usuario.findMany({ where: { organizacionId: { in: ids } }, select: { id: true } });
    const uids = usuarios.map((u) => u.id);
    await bajoLockDeEscrituraReal(async () => {
      await base.emailOtpChallenge.deleteMany({ where: { usuarioId: { in: uids } } });
      await base.premioRanking.deleteMany({ where: { organizacionId: { in: ids } } });
      await base.usuario.deleteMany({ where: { id: { in: uids } } });
      await base.organizacion.deleteMany({ where: { id: { in: ids } } });
    });
    await base.$disconnect();
  }, 120_000);

  it("R44: crea la organización y un maestro activo de esa empresa, sin contraseña utilizable", async () => {
    const slug = conSufijo("alta");
    const email = `alta-${RUN}@ejemplo.test`;
    const antes = await filas();

    const r = await alta(entrada(slug, email, `doc-alta-${RUN}`));

    expect(r.estado).toBe("creada");
    if (r.estado !== "creada") return;
    expect(await filas()).toEqual({
      organizaciones: antes.organizaciones + 1,
      usuarios: antes.usuarios + 1,
      podio: antes.podio + 3,
    });
    // SL-17 T3.9: el podio de la empresa nueva, con su empresa y sin premio asignado.
    expect(await podioDe(r.organizacionId)).toEqual(podioVacio(r.organizacionId));

    const org = await base.organizacion.findUniqueOrThrow({ where: { id: r.organizacionId } });
    expect(org).toMatchObject({ slug, nombre: `Empresa ${slug}` });
    const maestro = await base.usuario.findUniqueOrThrow({ where: { id: r.maestroId }, include: { rol: true } });
    expect(maestro).toMatchObject({ email, estado: "activo", organizacionId: r.organizacionId, cedula: `doc-alta-${RUN}` });
    expect(maestro.rol.value).toBe("maestro");

    // El login compara con `verifyPassword`: ninguna contraseña tecleable abre la cuenta.
    expect(maestro.passwordHash).toMatch(/^\$2[aby]\$/);
    for (const intento of ["", " ", "password", "12345678", email, maestro.cedula, maestro.telefono, maestro.passwordHash]) {
      expect(await verifyPassword(intento, maestro.passwordHash)).toBe(false);
    }
  });

  it("SL-17 T3.9: dos empresas tienen cada una su podio, y el premio de una no toca el de la otra", async () => {
    const a = await alta(entrada(conSufijo("podio-a"), `podio-a-${RUN}@ejemplo.test`, `doc-podio-a-${RUN}`));
    const b = await alta(entrada(conSufijo("podio-b"), `podio-b-${RUN}@ejemplo.test`, `doc-podio-b-${RUN}`));
    expect([a.estado, b.estado]).toEqual(["creada", "creada"]);
    if (a.estado !== "creada" || b.estado !== "creada") return;

    // Con el único global de antes, la segunda alta chocaba con la posición 1 de la primera.
    expect(await podioDe(a.organizacionId)).toEqual(podioVacio(a.organizacionId));
    expect(await podioDe(b.organizacionId)).toEqual(podioVacio(b.organizacionId));

    // El repositorio real del podio, con la empresa A fijada, solo ve y toca el de A.
    const repo = new PremioRankingRepository(app);
    const enA = await conEmpresa(a.organizacionId, async () => {
      await repo.upsertPremio(1, { monto: "15000.00", descripcion: "Oro A" });
      return repo.listar();
    });
    expect(enA).toEqual([
      { posicion: 1, monto: "15000.00", descripcion: "Oro A" },
      { posicion: 2, monto: null, descripcion: null },
      { posicion: 3, monto: null, descripcion: null },
    ]);
    expect(await podioDe(b.organizacionId)).toEqual(podioVacio(b.organizacionId));
  });

  it("R45: el mismo slug con el mismo email es idempotente y no escribe", async () => {
    const slug = conSufijo("idem");
    const email = `idem-${RUN}@ejemplo.test`;
    const primera = await alta(entrada(slug, email, `doc-idem-${RUN}`));
    expect(primera.estado).toBe("creada");
    if (primera.estado !== "creada") return;
    const antes = await filas();

    // Otro documento a propósito: si la segunda intentara insertar, chocaría o crearía otra fila.
    const segunda = await alta(entrada(slug, email, `doc-idem-otro-${RUN}`));

    expect(segunda).toEqual({ estado: "ya_existe", organizacionId: primera.organizacionId });
    expect(await filas()).toEqual(antes);
  });

  it("R45: el mismo slug con otro email es conflicto por slug y no escribe", async () => {
    const slug = conSufijo("choque");
    const primera = await alta(entrada(slug, `choque-${RUN}@ejemplo.test`, `doc-choque-${RUN}`));
    expect(primera.estado).toBe("creada");
    const antes = await filas();

    const r = await alta(entrada(slug, `otro-${RUN}@ejemplo.test`, `doc-choque-otro-${RUN}`));

    expect(r).toEqual({ estado: "conflicto", campo: "slug" });
    expect(await filas()).toEqual(antes);
  });

  it("R45: el email de un usuario de OTRA empresa en el mismo slug no cuenta como el mismo maestro", async () => {
    // Guarda el `organizacionId` del WHERE de idempotencia: un email que existe, pero en otra
    // empresa, no convierte el alta de este slug en `ya_existe`.
    const emailA = `ajena-${RUN}@ejemplo.test`;
    const a = await alta(entrada(conSufijo("ajena-a"), emailA, `doc-ajena-a-${RUN}`));
    const slugB = conSufijo("ajena-b");
    const b = await alta(entrada(slugB, `ajena-b-${RUN}@ejemplo.test`, `doc-ajena-b-${RUN}`));
    expect([a.estado, b.estado]).toEqual(["creada", "creada"]);

    expect(await alta(entrada(slugB, emailA, `doc-ajena-c-${RUN}`))).toEqual({ estado: "conflicto", campo: "slug" });
  });

  // SL-18 R1: estos dos casos decían «conflicto y revierte todo» porque email y documento eran
  // únicos GLOBALES (SL-17 R36). Ahora son por empresa: la empresa nueva no tiene a nadie, así que
  // el maestro con el email o el documento de otra empresa se crea. El P2002 de esos índices ya no
  // puede darse en un alta (la traducción en `OrganizacionRepository.campoDuplicado` queda como
  // defensa), y el duplicado dentro de una empresa lo cubre `usuario-unico-por-empresa.test.ts`.
  it("SL-18 R1 (antes R46/R36): un email ya usado en OTRA empresa no impide el alta: se crea con su maestro", async () => {
    const email = `dup-${RUN}@ejemplo.test`;
    const a = await alta(entrada(conSufijo("dup-a"), email, `doc-dup-a-${RUN}`));
    expect(a.estado).toBe("creada");
    const antes = await filas();

    const b = await alta(entrada(conSufijo("dup-b"), email, `doc-dup-b-${RUN}`));

    expect(b.estado).toBe("creada");
    if (a.estado !== "creada" || b.estado !== "creada") return;
    expect(await filas()).toEqual({
      organizaciones: antes.organizaciones + 1,
      usuarios: antes.usuarios + 1,
      podio: antes.podio + 3,
    });
    const maestros = await base.usuario.findMany({ where: { email }, select: { organizacionId: true } });
    expect(new Set(maestros.map((m) => m.organizacionId))).toEqual(new Set([a.organizacionId, b.organizacionId]));
  });

  it("SL-18 R1 (antes R46/R36): un documento ya usado en OTRA empresa no impide el alta", async () => {
    const documento = `doc-dupdoc-${RUN}`;
    expect((await alta(entrada(conSufijo("dupdoc-a"), `dupdoc-a-${RUN}@ejemplo.test`, documento))).estado).toBe("creada");
    const antes = await filas();

    const r = await alta(entrada(conSufijo("dupdoc-b"), `dupdoc-b-${RUN}@ejemplo.test`, documento));

    expect(r.estado).toBe("creada");
    expect(await filas()).toEqual({
      organizaciones: antes.organizaciones + 1,
      usuarios: antes.usuarios + 1,
      podio: antes.podio + 3,
    });
    expect(await base.usuario.count({ where: { cedula: documento } })).toBe(2);
  });

  it("R46: la entrada inválida no escribe nada", async () => {
    const antes = await filas();
    const malas = [
      entrada("Mal-Slug", `mal1-${RUN}@ejemplo.test`, `doc-mal1-${RUN}`),
      entrada(conSufijo("mal-email"), "no-es-email", `doc-mal2-${RUN}`),
      { ...entrada(conSufijo("mal-nombre"), `mal3-${RUN}@ejemplo.test`, `doc-mal3-${RUN}`), nombre: "" },
      {
        ...entrada(conSufijo("mal-tipo"), `mal4-${RUN}@ejemplo.test`, `doc-mal4-${RUN}`),
        maestro: { nombre: "X", email: `mal4-${RUN}@ejemplo.test`, telefono: "1", documento: `doc-mal4-${RUN}`, tipoDocumento: "no-existe" },
      },
    ];
    const resultados = [];
    for (const m of malas) resultados.push(await alta(m));

    expect(resultados).toEqual([
      { estado: "invalida", campo: "slug" },
      { estado: "invalida", campo: "maestro.email" },
      { estado: "invalida", campo: "nombre" },
      { estado: "invalida", campo: "maestro.tipoDocumento" },
    ]);
    expect(await filas()).toEqual(antes);
  });

  it("SL-20 R6: la empresa nace en el país de la entrada (Costa Rica)", async () => {
    const r = await alta(entrada(conSufijo("pais-cr"), `pais-cr-${RUN}@ejemplo.test`, `doc-pais-cr-${RUN}`));
    expect(r.estado).toBe("creada");
    if (r.estado !== "creada") return;
    expect((await base.organizacion.findUniqueOrThrow({ where: { id: r.organizacionId } })).paisId).toBe("CR");
  });

  it("SL-20 R6: sin país, o con uno que no existe, es `invalida` `paisId` y no escribe nada", async () => {
    const antes = await filas();
    const sinPais = entrada(conSufijo("sin-pais"), `sin-pais-${RUN}@ejemplo.test`, `doc-sin-pais-${RUN}`);
    const sinElCampo = { nombre: sinPais.nombre, slug: sinPais.slug, maestro: sinPais.maestro };

    const resultados = [
      await alta(sinElCampo),
      // `XZ` tiene forma de código pero ninguna migración ni test lo crea: pasa zod y lo rechaza el repositorio.
      await alta(entrada(conSufijo("pais-xz"), `pais-xz-${RUN}@ejemplo.test`, `doc-pais-xz-${RUN}`, "XZ")),
    ];

    expect(resultados).toEqual([
      { estado: "invalida", campo: "paisId" },
      { estado: "invalida", campo: "paisId" },
    ]);
    expect(await filas()).toEqual(antes);
  });

  it("SL-20 R6/R8: en otro país nace allí, y repetirla con otro país es `conflicto` `paisId` sin cambiar nada", async () => {
    const slug = conSufijo("pais-xa");
    const email = `pais-xa-${RUN}@ejemplo.test`;
    const r = await revertida(base, async (tx) => {
      await crearPaisDePrueba(tx, "XA");
      const servicio = new OrganizacionService(new OrganizacionRepository(clienteConTransaccionAnidada(tx)));
      const primera = await servicio.altaEmpresa(entrada(slug, email, `doc-pais-xa-${RUN}`, "XA"));
      const repetida = await servicio.altaEmpresa(entrada(slug, email, `doc-pais-xa-${RUN}`, "XA"));
      const conOtroPais = await servicio.altaEmpresa(entrada(slug, email, `doc-pais-xa-${RUN}`, "CR"));
      const despues = await tx.organizacion.findMany({ where: { slug }, select: { id: true, paisId: true } });
      return { primera, repetida, conOtroPais, despues };
    });

    expect(r.primera.estado).toBe("creada");
    if (r.primera.estado !== "creada") return;
    expect(r.repetida).toEqual({ estado: "ya_existe", organizacionId: r.primera.organizacionId });
    expect(r.conOtroPais).toEqual({ estado: "conflicto", campo: "paisId" });
    expect(r.despues).toEqual([{ id: r.primera.organizacionId, paisId: "XA" }]);
  });

  // Enmienda 2026-10-26, decisión 6. La repetición de la empresa que ya existía sigue la propuesta de
  // la pregunta abierta de `requirements.md` («R45 solo frena altas nuevas»), que es lo que hace el
  // orden de `altaEnTransaccion` (design §13): si el humano decide otra cosa, este caso cambia.
  it("SL-20 R45/R46: con XA apagado, un alta nueva en XA es `invalida` `paisId` sin escribir nada; la empresa que ya estaba sigue en XA", async () => {
    const slugVieja = conSufijo("xa-vieja");
    const emailVieja = `xa-vieja-${RUN}@ejemplo.test`;
    const slugNueva = conSufijo("xa-nueva");
    const emailNueva = `xa-nueva-${RUN}@ejemplo.test`;
    const r = await revertida(base, async (tx) => {
      await crearPaisDePrueba(tx, "XA");
      const servicio = new OrganizacionService(new OrganizacionRepository(clienteConTransaccionAnidada(tx)));
      const vieja = await servicio.altaEmpresa(entrada(slugVieja, emailVieja, `doc-xa-vieja-${RUN}`, "XA"));

      await tx.pais.update({ where: { id: "XA" }, data: { disponible: false } });

      const nueva = await servicio.altaEmpresa(entrada(slugNueva, emailNueva, `doc-xa-nueva-${RUN}`, "XA"));
      const repetida = await servicio.altaEmpresa(entrada(slugVieja, emailVieja, `doc-xa-vieja-${RUN}`, "XA"));
      return {
        vieja,
        nueva,
        repetida,
        escritoDeLaNueva: {
          organizaciones: await tx.organizacion.count({ where: { slug: slugNueva } }),
          usuarios: await tx.usuario.count({ where: { email: emailNueva } }),
        },
        organizacionesEnXA: await tx.organizacion.findMany({ where: { paisId: "XA" }, select: { slug: true } }),
      };
    });

    expect(r.vieja.estado).toBe("creada");
    if (r.vieja.estado !== "creada") return;
    expect(r.nueva).toEqual({ estado: "invalida", campo: "paisId" });
    expect(r.escritoDeLaNueva).toEqual({ organizaciones: 0, usuarios: 0 });
    expect(r.repetida).toEqual({ estado: "ya_existe", organizacionId: r.vieja.organizacionId });
    expect(r.organizacionesEnXA).toEqual([{ slug: slugVieja }]);
  });

  it("R44: primer acceso — tras «recuperar contraseña» la nueva contraseña vale", async () => {
    const email = `primer-${RUN}@ejemplo.test`;
    const r = await alta(entrada(conSufijo("primer"), email, `doc-primer-${RUN}`));
    expect(r.estado).toBe("creada");
    if (r.estado !== "creada") return;

    // SL-18 (R20): la recuperación ya no va por código, sino por un enlace por cuenta (design §4.1).
    const enviados: EmailMessage[] = [];
    const correo = {
      sender: { enviar: async (m: EmailMessage) => (enviados.push(m), { messageId: null }) },
      baseUrl: "https://app.example.test",
    };
    const otpRepo = new EmailOtpChallengeRepository(app);
    const reset = new PasswordResetService(new UserRepository(app), otpRepo, correo);
    const nueva = `Nueva-${RUN}-Clave!9`;

    // Recuperar contraseña corre sin sesión y sin empresa: en plataforma, igual que T2.1.
    const resultado = await comoPlataforma("SL-17", "test del primer acceso", async () => {
      await reset.solicitar({ email, deviceHash: "dispositivo-test", ipAddress: "127.0.0.1" });
      expect(enviados).toHaveLength(1);
      expect(enviados[0].to).toBe(email);
      const enlace = /#enlace=([^\s"<]+)/.exec(enviados[0].text)![1];
      return reset.crearContrasenaConEnlace({ enlace, newPassword: nueva, ipAddress: "127.0.0.1" });
    });

    expect(resultado).toEqual({ status: "ok" });
    const { passwordHash } = await base.usuario.findUniqueOrThrow({ where: { id: r.maestroId } });
    expect(await verifyPassword(nueva, passwordHash)).toBe(true);
    expect(await verifyPassword("", passwordHash)).toBe(false);
  });
});
