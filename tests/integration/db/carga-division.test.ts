import { describe, it, expect, beforeAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { GeoRepository } from "@/lib/repositories/GeoRepository";
import { CargaDivisionService } from "@/lib/services/CargaDivisionService";
import type { Actor } from "@/lib/interfaces/services/IVehiculoService";
import { planificarDivision } from "@/lib/utils/division-csv";

import { crearPaisDePrueba } from "../../fabricas/paises";
import { HAY_BASE_DE_DATOS, clienteConSavepoint, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { errorEnSavepoint, revertida } from "./_fixtures/pais-20";

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

  beforeAll(async () => {
    prisma = crearPrismaDeTest();
    const usuario = await prisma.usuario.findFirst({
      select: { id: true, nombre: true, primerApellido: true },
    });
    if (!usuario) {
      throw new Error("hay DATABASE_URL pero `usuario` esta vacia: sin actor no se mide su congelado (R33)");
    }
    actor = { usuarioId: usuario.id, rol: "superadmin" };
    actorNombre = [usuario.nombre, usuario.primerApellido].filter((p) => p != null && p !== "").join(" ");
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
        const a = await tx.canton.create({ data: { nombre: "San Jose", provinciaId: p.id }, select: { id: true } });
        const b = await tx.canton.create({ data: { nombre: "San José", provinciaId: p.id }, select: { id: true } });
        const primero = [a.id, b.id].sort()[0];

        const r = await service.cargar("XA", archivo("Región,,SAN JOSE,,Barrio,"), actor);
        expect(r).toMatchObject({ status: "ok", creados: { provincia: 0, canton: 0, distrito: 1 } });

        const barrio = await tx.distrito.findFirst({ where: { nombre: "Barrio", paisId: "XA" }, select: { cantonId: true } });
        expect(barrio?.cantonId).toBe(primero);
      });
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
});
