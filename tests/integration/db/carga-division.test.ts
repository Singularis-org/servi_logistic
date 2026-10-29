import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { GeoRepository } from "@/lib/repositories/GeoRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { CargaDivisionService } from "@/lib/services/CargaDivisionService";
import { GeografiaService } from "@/lib/services/GeografiaService";
import type { Actor } from "@/lib/interfaces/services/IVehiculoService";
import { planificarDivision } from "@/lib/utils/division-csv";

import { crearPaisDePrueba } from "../../fabricas/paises";
import {
  HAY_BASE_DE_DATOS,
  bajoLockDeEscrituraReal,
  clienteConSavepoint,
  crearPrismaDeTest,
  type TxDeTest,
} from "./_postgres-real";
import { errorEnSavepoint, revertida } from "./_fixtures/pais-20";
import { exigirSinSuperadmin, idDeRol, insertarUsuario, tomarLockDeSuperadmin } from "./_fixtures/superadmin-32";

/**
 * SL-20 (design §6; R24, R25, R26, R33, R35) — LA CARGA DE LA DIVISION DE UN PAIS, CONTRA POSTGRES.
 *
 * Por que aqui y no solo con dobles: «una sola transaccion» y «con un error no se escribe nada» son
 * propiedades del MOTOR. El repositorio corre sobre `clienteConSavepoint`, que abre un SAVEPOINT
 * REAL y hace `ROLLBACK TO` al fallar; con el paso-a-traves, el caso de la carrera pasaria en verde
 * aunque la primera mitad de la escritura se quedara.
 *
 * Todo en `XA` (fabrica `paises.ts`), dentro de una transaccion del dueño que siempre se revierte:
 * es el camino del superadmin, que corre como dueño (`comoPlataforma`). SIN `DATABASE_URL` se SALTA.
 *
 * El actor es SU PROPIO superadmin (review SL-20 M1): la base de CI solo recibe `migrate deploy` +
 * `db:seed`, que no siembra usuarios, así que la suite no lee ningún usuario ajeno. Lo crea y lo
 * commitea en `beforeAll` (la FK del actor en `historial_plataforma` y el congelado de R33 lo
 * necesitan visible) y lo borra en `afterAll`. El índice `usuario_un_solo_superadmin` es GLOBAL:
 * el archivo sostiene `tomarLockDeSuperadmin` desde antes de crearlo hasta después de borrarlo, y
 * el de la 227 va por dentro (orden de locks de `superadmin-32.ts`). Todo lo que cuelga del usuario
 * (las filas de historial) se escribe dentro de `revertida` y se va con el rollback.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const CABECERA = "nivel_1,codigo_nivel_1,nivel_2,codigo_nivel_2,nivel_3,codigo_nivel_3";

function archivo(...lineas: string[]) {
  return { nombre: "division.csv", bytes: new TextEncoder().encode([CABECERA, ...lineas].join("\n")) };
}

interface FilaHistorial {
  accion: string;
  entidad_tipo: string;
  entidad_id: string;
  entidad_etiqueta: string;
  pais_id: string;
  actor_usuario_id: string | null;
  actor_nombre: string | null;
  detalle: unknown;
}

async function historialDe(tx: TxDeTest, paisId: string): Promise<FilaHistorial[]> {
  return tx.$queryRawUnsafe<FilaHistorial[]>(
    `SELECT "accion"::text AS accion, "entidad_tipo"::text AS entidad_tipo, "entidad_id",
            "entidad_etiqueta", "pais_id", "actor_usuario_id", "actor_nombre", "detalle"
       FROM "historial_plataforma" WHERE "pais_id" = $1 ORDER BY "created_at", "id"`,
    paisId,
  );
}

async function nodosDe(tx: TxDeTest, paisId: string) {
  const [provincias, cantones, distritos] = await Promise.all([
    tx.provincia.findMany({ where: { paisId }, select: { id: true, nombre: true, codigoDta: true, activo: true } }),
    tx.canton.findMany({
      where: { paisId },
      select: { id: true, nombre: true, codigoDta: true, activo: true, provinciaId: true },
    }),
    tx.distrito.findMany({
      where: { paisId },
      select: { id: true, nombre: true, codigoDta: true, activo: true, cantonId: true },
    }),
  ]);
  return { provincias, cantones, distritos };
}

describeSiHayBase("SL-20 — la carga de la division de un pais (Postgres real)", () => {
  let prisma: PrismaClient;
  let actor: Actor;
  let actorNombre: string;
  let superadminId: string | null = null;
  let soltarSuperadmin: () => Promise<void> = async () => {};

  beforeAll(async () => {
    prisma = crearPrismaDeTest();
    soltarSuperadmin = await tomarLockDeSuperadmin();
    await exigirSinSuperadmin(prisma);
    superadminId = await bajoLockDeEscrituraReal(() =>
      prisma.$transaction(async (tx) => {
        const u = await insertarUsuario(tx, await idDeRol(tx, "superadmin"), null);
        if (!u.desenlace.ok) throw new Error(`no se sembró el superadmin: ${JSON.stringify(u.desenlace)}`);
        return u.id;
      }),
    );
    // Se lee SOLO el usuario recién creado, por su id: el nombre congelado esperado (R33).
    const usuario = await prisma.usuario.findUniqueOrThrow({
      where: { id: superadminId },
      select: { nombre: true, primerApellido: true },
    });
    actor = { usuarioId: superadminId, rol: "superadmin" };
    actorNombre = [usuario.nombre, usuario.primerApellido].filter((p) => p != null && p !== "").join(" ");
  }, 60_000);

  afterAll(async () => {
    try {
      if (prisma !== undefined && superadminId !== null) {
        const id = superadminId;
        await bajoLockDeEscrituraReal(() => prisma.$executeRawUnsafe(`DELETE FROM "usuario" WHERE "id" = $1`, id));
      }
    } finally {
      await soltarSuperadmin();
      await prisma?.$disconnect();
    }
  }, 60_000);

  it("control: el actor es el superadmin de la suite, sin empresa (no un usuario sembrado)", async () => {
    const u = await prisma.usuario.findUnique({
      where: { id: actor.usuarioId },
      select: { organizacionId: true, email: true },
    });
    expect(u?.organizacionId).toBeNull();
    expect(u?.email).toMatch(/^sl32-[0-9a-f]{12}@example\.com$/);
  });

  async function conPais<T>(
    fn: (ctx: { tx: TxDeTest; geo: GeoRepository; service: CargaDivisionService }) => Promise<T>,
  ): Promise<T> {
    return revertida(prisma, async (tx) => {
      await crearPaisDePrueba(tx, "XA");
      const geo = new GeoRepository(clienteConSavepoint(tx));
      return fn({ tx, geo, service: new CargaDivisionService(geo) });
    });
  }

  // ===============================================================================================
  // R24 — un CSV valido crea lo que falta, en una transaccion, y lo cuenta
  // ===============================================================================================

  describe("SL-20/R24 — un CSV valido crea los tres niveles bajo su padre", () => {
    it("crea, cuelga cada nodo de su padre en XA, guarda el codigo y devuelve el resumen", async () => {
      await conPais(async ({ tx, service }) => {
        const r = await service.cargar(
          "XA",
          archivo(
            "Región Norte,RN,Comuna Uno,RN-1,Barrio A,RN-1-A",
            "Región Norte,RN,Comuna Uno,RN-1,Barrio B,RN-1-B",
            "Región Norte,RN,Comuna Dos,RN-2,,",
            "Región Sur,,Comuna Tres,,Barrio C,",
          ),
          actor,
        );
        expect(r).toEqual({
          status: "ok",
          creados: { provincia: 2, canton: 3, distrito: 3 },
          existentes: 0,
          codigosCompletados: 0,
          avisos: [],
        });

        const { provincias, cantones, distritos } = await nodosDe(tx, "XA");
        expect(provincias).toHaveLength(2);
        expect(cantones).toHaveLength(3);
        expect(distritos).toHaveLength(3);
        // Todo nace activo (R13) y el pais de cantones y distritos lo puso el trigger.
        expect([...provincias, ...cantones, ...distritos].every((n) => n.activo)).toBe(true);

        const norte = provincias.find((p) => p.nombre === "Región Norte")!;
        expect(norte.codigoDta).toBe("RN");
        const uno = cantones.find((c) => c.nombre === "Comuna Uno")!;
        expect(uno.provinciaId).toBe(norte.id);
        expect(distritos.filter((d) => d.cantonId === uno.id).map((d) => d.codigoDta).sort()).toEqual([
          "RN-1-A",
          "RN-1-B",
        ]);
        expect(provincias.find((p) => p.nombre === "Región Sur")!.codigoDta).toBeNull();
      });
    });

    it("R33: deja EXACTAMENTE una fila `division_cargada` con las cifras y el actor congelado", async () => {
      await conPais(async ({ tx, service }) => {
        await service.cargar("XA", archivo("Región,R,Comuna,C,Barrio,B"), actor);

        const filas = await historialDe(tx, "XA");
        expect(filas).toHaveLength(1);
        expect(filas[0]).toMatchObject({
          accion: "division_cargada",
          entidad_tipo: "pais",
          entidad_id: "XA",
          entidad_etiqueta: "País de prueba XA",
          pais_id: "XA",
          actor_usuario_id: actor.usuarioId,
          actor_nombre: actorNombre,
        });
        // Solo cifras (design §2.6): ni un nombre de nodo.
        expect(filas[0].detalle).toEqual({
          creados: { provincia: 1, canton: 1, distrito: 1 },
          existentes: 0,
          codigosCompletados: 0,
        });
      });
    });

    it("R35: la carga no escribe NADA en `historial_accion`", async () => {
      await conPais(async ({ tx, service }) => {
        const antes = await tx.historialAccion.count();
        await service.cargar("XA", archivo("Región,R,Comuna,C,Barrio,B"), actor);
        expect(await tx.historialAccion.count()).toBe(antes);
      });
    });
  });

  // ===============================================================================================
  // R26 — lo que ya existe no se toca, salvo poner el codigo que faltaba
  // ===============================================================================================

  describe("SL-20/R26 — recargar no duplica ni cambia; solo completa codigos", () => {
    it("la segunda carga del mismo CSV no crea nada y no deja fila de historial", async () => {
      await conPais(async ({ tx, service }) => {
        const csv = archivo("Región,R,Comuna,C,Barrio,B");
        await service.cargar("XA", csv, actor);
        const r = await service.cargar("XA", csv, actor);

        expect(r).toMatchObject({
          status: "ok",
          creados: { provincia: 0, canton: 0, distrito: 0 },
          existentes: 3,
          codigosCompletados: 0,
        });
        expect((await nodosDe(tx, "XA")).distritos).toHaveLength(1);
        // «Si `creados` y `codigosCompletados` son 0, no se escribe historial» (design §6).
        expect(await historialDe(tx, "XA")).toHaveLength(1);
      });
    });

    it("a un nodo sin codigo se le pone el de la fila; su nombre, su estado y sus hijos no cambian", async () => {
      await conPais(async ({ tx, service }) => {
        const p = await tx.provincia.create({
          data: { nombre: "Región", paisId: "XA", activo: false },
          select: { id: true },
        });

        const r = await service.cargar("XA", archivo("REGION,R9,Comuna,,,"), actor);
        expect(r).toMatchObject({
          status: "ok",
          creados: { provincia: 0, canton: 1, distrito: 0 },
          existentes: 1,
          codigosCompletados: 1,
        });

        const fila = await tx.provincia.findUnique({
          where: { id: p.id },
          select: { nombre: true, codigoDta: true, activo: true },
        });
        // El nombre NO pasa a «REGION» (la carga no renombra) y sigue retirada (no reactiva).
        expect(fila).toEqual({ nombre: "Región", codigoDta: "R9", activo: false });

        const [historial] = await historialDe(tx, "XA");
        expect(historial.detalle).toMatchObject({ codigosCompletados: 1 });
      });
    });

    it("decision 4: un alta bajo un padre RETIRADO se permite y el hijo nace activo", async () => {
      await conPais(async ({ tx, service }) => {
        const p = await tx.provincia.create({
          data: { nombre: "Retirada", paisId: "XA", activo: false },
          select: { id: true },
        });
        await service.cargar("XA", archivo("Retirada,,Comuna nueva,,,"), actor);

        const hijo = await tx.canton.findFirst({
          where: { provinciaId: p.id },
          select: { nombre: true, activo: true },
        });
        expect(hijo).toEqual({ nombre: "Comuna nueva", activo: true });
      });
    });

    it("decision 4: con dos homonimos normalizados bajo el mismo padre, gana el primero (por id)", async () => {
      await conPais(async ({ tx, service }) => {
        const p = await tx.provincia.create({
          data: { nombre: "Región", paisId: "XA" },
          select: { id: true },
        });
        // El UNIQUE de la base compara el nombre LITERAL: los dos caben (datos heredados).
        // SLT-43 (excepción a R36 autorizada por Camilo, 2026-10-29): este estado es imposible en el modelo
        // nuevo (R9/R14) y ninguna vía de la app lo crea; se siembra con la sincronía apagada en esta tx revertida.
        await tx.$executeRawUnsafe(`ALTER TABLE "canton" DISABLE TRIGGER "canton_sincroniza_nodo_geografico"`);
        const a = await tx.canton.create({ data: { nombre: "San Jose", provinciaId: p.id }, select: { id: true } });
        const b = await tx.canton.create({ data: { nombre: "San José", provinciaId: p.id }, select: { id: true } });
        await tx.$executeRawUnsafe(`ALTER TABLE "canton" ENABLE TRIGGER "canton_sincroniza_nodo_geografico"`);
        const primero = [a.id, b.id].sort()[0];
        // Misma excepción a R36 (aprobada por Camilo, 2026-10-29): el distrito de la carga necesita el nodo
        // de su cantón (FK compuesta); solo el ganador lo recibe, con un UPDATE sin cambios que dispara la sincronía.
        await tx.$executeRawUnsafe(`UPDATE "canton" SET "nombre" = "nombre" WHERE "id" = $1`, primero);

        const r = await service.cargar("XA", archivo("Región,,SAN JOSE,,Barrio,"), actor);
        expect(r).toMatchObject({ status: "ok", creados: { provincia: 0, canton: 0, distrito: 1 } });

        const barrio = await tx.distrito.findFirst({ where: { nombre: "Barrio", paisId: "XA" }, select: { cantonId: true } });
        expect(barrio?.cantonId).toBe(primero);
      });
      const [trigger] = await prisma.$queryRawUnsafe<{ tgenabled: string }[]>(
        `SELECT "tgenabled"::text AS "tgenabled" FROM "pg_trigger" WHERE "tgname" = 'canton_sincroniza_nodo_geografico'`,
      );
      expect(trigger?.tgenabled).toBe("O");
    });
  });

  // ===============================================================================================
  // R25 — todo o nada
  // ===============================================================================================

  describe("SL-20/R25 — con un solo error no se escribe NADA", () => {
    it("una fila mala entre buenas: `invalido` con su linea, cero nodos y cero historial", async () => {
      await conPais(async ({ tx, service }) => {
        const r = await service.cargar(
          "XA",
          archivo("Región,R,Comuna,C,Barrio,B", "Región,R,Otra,C,,"),
          actor,
        );
        expect(r.status).toBe("invalido");
        if (r.status !== "invalido") throw new Error("no fue invalido");
        expect(r.errores.map((e) => e.linea)).toEqual([3]);

        const { provincias, cantones, distritos } = await nodosDe(tx, "XA");
        expect(provincias.length + cantones.length + distritos.length).toBe(0);
        expect(await historialDe(tx, "XA")).toEqual([]);
      });
    });

    it("⭑ un fallo de la base a MITAD de la escritura deshace tambien lo ya escrito", async () => {
      // La carrera del design §6: el plan se calcula, alguien da de alta a mano el mismo canton y la
      // escritura choca con el UNIQUE en el segundo `createMany`. Las provincias del primero ya
      // estaban escritas: tienen que desaparecer con el resto.
      await conPais(async ({ tx, geo }) => {
        const p = await tx.provincia.create({ data: { nombre: "Existente", paisId: "XA" }, select: { id: true } });
        const division = await geo.leerDivisionDePais("XA");
        const plan = planificarDivision(
          [
            { linea: 2, nivel1: "Nueva", codigoNivel1: "", nivel2: "Hija", codigoNivel2: "", nivel3: "", codigoNivel3: "" },
            { linea: 3, nivel1: "Existente", codigoNivel1: "", nivel2: "Choque", codigoNivel2: "", nivel3: "", codigoNivel3: "" },
          ],
          division!.arbol,
          division!.regla,
        );
        if (!("plan" in plan)) throw new Error("el plan de prueba tenia errores");
        await tx.canton.create({ data: { nombre: "Choque", provinciaId: p.id } });

        const error = await errorEnSavepoint(tx, () => geo.importarDivision("XA", plan.plan, actor.usuarioId));
        expect(error, "la carrera no llego a fallar").not.toBeNull();

        expect(await tx.provincia.count({ where: { paisId: "XA", nombre: "Nueva" } })).toBe(0);
        expect(await tx.canton.count({ where: { paisId: "XA", nombre: "Hija" } })).toBe(0);
        expect(await historialDe(tx, "XA")).toEqual([]);
      });
    });

    it("CONTRAPRUEBA: el mismo plan SIN la carrera si escribe", async () => {
      await conPais(async ({ tx, geo }) => {
        await tx.provincia.create({ data: { nombre: "Existente", paisId: "XA" } });
        const division = await geo.leerDivisionDePais("XA");
        const plan = planificarDivision(
          [{ linea: 2, nivel1: "Nueva", codigoNivel1: "", nivel2: "Hija", codigoNivel2: "", nivel3: "", codigoNivel3: "" }],
          division!.arbol,
          division!.regla,
        );
        if (!("plan" in plan)) throw new Error("el plan de prueba tenia errores");
        await geo.importarDivision("XA", plan.plan, actor.usuarioId);
        expect(await tx.provincia.count({ where: { paisId: "XA", nombre: "Nueva" } })).toBe(1);
        expect(await historialDe(tx, "XA")).toHaveLength(1);
      });
    });
  });

  // ===============================================================================================
  // El pais acota la lectura del plan
  // ===============================================================================================

  it("T4.1 `listArbolDePais`: el arbol de XA tras la carga, con codigo, sin CR y sin zonas", async () => {
    await conPais(async ({ geo, service }) => {
      await service.cargar("XA", archivo("Región,R,Comuna,C,Barrio,B", "Región,R,Comuna,C,Aldea,A"), actor);
      expect(await geo.listArbolDePais("XA")).toEqual([
        {
          id: expect.any(String),
          nombre: "Región",
          codigo: "R",
          activo: true,
          cantones: [
            {
              id: expect.any(String),
              nombre: "Comuna",
              codigo: "C",
              activo: true,
              // Por nombre, y sin `zonaId` ni `zonaEspecial`: son de cada empresa.
              distritos: [
                { id: expect.any(String), nombre: "Aldea", codigo: "A", activo: true },
                { id: expect.any(String), nombre: "Barrio", codigo: "B", activo: true },
              ],
            },
          ],
        },
      ]);
      // Y el de CR no trae nada de XA.
      const deCR = await geo.listArbolDePais("CR");
      expect(deCR.length).toBeGreaterThan(0);
      expect(deCR.some((p) => p.nombre === "Región")).toBe(false);
    });
  });

  it("la geografia de OTRO pais no cuenta como existente: «San José» de CR no evita el alta en XA", async () => {
    await conPais(async ({ service }) => {
      const r = await service.cargar("XA", archivo("San José,,San José,,Carmen,"), actor);
      expect(r).toMatchObject({ status: "ok", creados: { provincia: 1, canton: 1, distrito: 1 }, existentes: 0 });
    });
  });

  // ===============================================================================================
  // R35 y R30 — las escrituras de nodo del superadmin (GeografiaService real sobre la misma tx)
  // ===============================================================================================

  function geografia(tx: TxDeTest): GeografiaService {
    const cliente = clienteConSavepoint(tx);
    return new GeografiaService(new GeoRepository(cliente), new OrdenRepository(cliente));
  }

  /**
   * La version fisica de la fila. Todo pasa en UNA transaccion, asi que `xmin` no distinguiria una
   * fila escrita de una actualizada; `ctid` si: un UPDATE (tambien uno HOT) deja una tupla nueva.
   */
  async function ctidDe(tx: TxDeTest, id: string): Promise<string> {
    const [fila] = await tx.$queryRawUnsafe<{ ctid: string }[]>(
      `SELECT ctid::text AS ctid FROM "provincia" WHERE "id" = $1`,
      id,
    );
    return fila.ctid;
  }

  describe("SL-20/R35 — alta, renombre y retiro de nodo del superadmin no escriben en `historial_accion`", () => {
    it("tres escrituras: cero filas nuevas en `historial_accion` y tres en `historial_plataforma`", async () => {
      await conPais(async ({ tx }) => {
        const servicio = geografia(tx);
        const antes = await tx.historialAccion.count();

        const alta = await servicio.crear({ nivel: "provincia", nombre: "Región Nueva", paisId: "XA" }, actor);
        if (alta.status !== "ok") throw new Error(`alta: ${alta.status}`);
        const renombre = await servicio.renombrar({ nivel: "provincia", id: alta.id, nombre: "Región Renombrada" }, actor);
        const retiro = await servicio.cambiarActivacion({ nivel: "provincia", id: alta.id, activo: false }, actor);

        expect(renombre.status).toBe("ok");
        expect(retiro.status).toBe("ok");
        expect(await tx.historialAccion.count()).toBe(antes);
        // Contraprueba: las tres SI se registraron, en el historial de plataforma y con este actor.
        const filas = await historialDe(tx, "XA");
        // Ordenadas: en una sola transaccion `created_at` empata y el desempate por `id` es azar.
        expect(filas.map((f) => f.accion).sort()).toEqual([
          "nodo_geografico_creado",
          "nodo_geografico_desactivado",
          "nodo_geografico_renombrado",
        ]);
        expect(new Set(filas.map((f) => f.actor_usuario_id))).toEqual(new Set([actor.usuarioId]));
      });
    });
  });

  describe("SL-20/R30 — pedir el estado que el nodo ya tiene es éxito sin escribir", () => {
    it("retirar uno ya retirado y reactivar uno activo: `ok`, misma tupla y cero filas de historial", async () => {
      await conPais(async ({ tx }) => {
        const servicio = geografia(tx);
        const retirada = await tx.provincia.create({ data: { nombre: "Retirada", paisId: "XA", activo: false }, select: { id: true } });
        const activa = await tx.provincia.create({ data: { nombre: "Activa", paisId: "XA" }, select: { id: true } });
        const ctidRetirada = await ctidDe(tx, retirada.id);
        const ctidActiva = await ctidDe(tx, activa.id);
        const accionAntes = await tx.historialAccion.count();

        const otraVezRetiro = await servicio.cambiarActivacion({ nivel: "provincia", id: retirada.id, activo: false }, actor);
        const otraVezActiva = await servicio.cambiarActivacion({ nivel: "provincia", id: activa.id, activo: true }, actor);

        expect(otraVezRetiro).toEqual({ status: "ok", nivel: "provincia", id: retirada.id, activo: false });
        expect(otraVezActiva).toEqual({ status: "ok", nivel: "provincia", id: activa.id, activo: true });
        // Ni UPDATE (la tupla es la misma) ni fila de registro en ninguno de los dos historiales.
        expect(await ctidDe(tx, retirada.id)).toBe(ctidRetirada);
        expect(await ctidDe(tx, activa.id)).toBe(ctidActiva);
        expect(await historialDe(tx, "XA")).toEqual([]);
        expect(await tx.historialAccion.count()).toBe(accionAntes);
      });
    });

    it("CONTRAPRUEBA de la medida: un cambio de verdad SI cambia la tupla y deja su fila", async () => {
      await conPais(async ({ tx }) => {
        const activa = await tx.provincia.create({ data: { nombre: "Activa", paisId: "XA" }, select: { id: true } });
        const ctid = await ctidDe(tx, activa.id);

        const r = await geografia(tx).cambiarActivacion({ nivel: "provincia", id: activa.id, activo: false }, actor);

        expect(r).toEqual({ status: "ok", nivel: "provincia", id: activa.id, activo: false });
        expect(await ctidDe(tx, activa.id)).not.toBe(ctid);
        expect((await historialDe(tx, "XA")).map((f) => f.accion)).toEqual(["nodo_geografico_desactivado"]);
      });
    });
  });
});
