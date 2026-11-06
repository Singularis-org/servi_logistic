import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { conEmpresa } from "@/lib/db/contexto-empresa";
import type { CreateOrdenData } from "@/lib/interfaces/repositories/IOrdenRepository";
import { ORDEN_MODULOS } from "@/lib/modulos/catalogo";
import { CatalogoGeograficoRepository } from "@/lib/repositories/CatalogoGeograficoRepository";
import { CupoPlanRepository } from "@/lib/repositories/CupoPlanRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { TarifaVigenteRepository } from "@/lib/repositories/TarifaVigenteRepository";
import { BulkOrdenService } from "@/lib/services/BulkOrdenService";
import type { CatalogoGeografico } from "@/lib/services/geografia-dominio";
import { fksDeNodo, resolverUbicacion } from "@/lib/services/geo-ubicacion";
import { ESTADOS_SIN_CORRECCION } from "@/lib/types/correccion-datos-cliente";
import { comoApp, datosDeOrganizacionDePrueba, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import {
  HAY_BASE_DE_DATOS,
  clienteConSavepoint,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";

// SLT-45 T3.3 (design §3; R25, R26, R27, R28) — LA ORDEN GUARDA EL NODO Y LAS 3 FK.
//
// Contra Postgres real y con el rol de la app (`servi_app`, con RLS), dentro de una transaccion que
// siempre se revierte. Se crea por los caminos que escriben una orden:
//  · v1: `BulkOrdenService.cargarViaApi` real, con la terna de nombres (profundidad 3);
//  · v2: el motor (`resolverUbicacion` → `fksDeNodo`) sobre el catalogo real de la empresa, y el
//    `createManyOrdenesConGuia` del repositorio, que es lo que hara la ruta v2 (T4/T5 aun no
//    existen). Profundidad 3 y profundidad 2: el canton va por el repositorio con el
//    `CreateOrdenData` que arma `fksDeNodo`, porque hasta SLT-46 ningun canton tiene zona y la
//    ruta no llega a escribir;
// y se corrige con `OrdenRepository.corregirDatosCliente`.
//
// En cada fila se lee lo que quedo en la base: las 3 FK derivadas de la ruta del nodo (R25, R26),
// `nodo_geografico_id` = el nodo resuelto = `COALESCE(distrito_id, canton_id)` (R27). Y aparte, que
// el trigger de SLT-43 sigue derivando el nodo de las FK (R28).

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const PAIS = "CR";
const ZONA_CENTRAL: string[][] = [
  ["Cartago", "Cartago", "Occidental"],
  ["Cartago", "Cartago", "Oriental"],
];

const TARIFA_FIJA = {
  valorFlete: "2500.00",
  valorFleteDevuelto: "1250.00",
  valorFleteGam: "2000.00",
  valorFleteDevueltoGam: "1000.00",
  comisionCod: "2.00",
  ivaFlete: "13.00",
  ivaComisionCod: "13.00",
  tarifaEspecial: "4000.00",
  tarifaEspecialDevuelta: "1500.00",
} as const;

interface FilaDeOrden {
  id: string;
  provincia_id: string;
  canton_id: string;
  distrito_id: string | null;
  nodo_geografico_id: string | null;
  coalesce: string;
}

interface Contexto {
  tx: TxDeTest;
  cli: PrismaClient;
  repo: OrdenRepository;
  organizacionId: string;
  tiendaId: string;
  zonaId: string;
  estatusId: string;
  catalogo: CatalogoGeografico;
}

async function nodoPorRuta(tx: TxDeTest, ruta: string[]): Promise<string> {
  let padreId: string | null = null;
  for (const nombre of ruta) {
    const nodo: { id: string } | null = await tx.nodoGeografico.findFirst({
      where: { paisId: PAIS, padreId, nombre },
      select: { id: true },
    });
    if (nodo === null) throw new Error(`la siembra no encuentra el nodo ${ruta.join(" / ")} en ${PAIS}`);
    padreId = nodo.id;
  }
  if (padreId === null) throw new Error("ruta vacia");
  return padreId;
}

async function leerOrden(tx: TxDeTest, where: { id?: string; numRemision?: string }): Promise<FilaDeOrden> {
  const filas = await tx.$queryRawUnsafe<FilaDeOrden[]>(
    `SELECT id, provincia_id, canton_id, distrito_id, nodo_geografico_id,
            COALESCE(distrito_id, canton_id) AS coalesce
       FROM orden WHERE ${where.id !== undefined ? "id = $1" : "num_remision = $1"}`,
    where.id ?? where.numRemision,
  );
  if (filas.length !== 1) throw new Error(`se esperaba UNA orden y hay ${filas.length}`);
  return filas[0];
}

/** Siembra una empresa de CR con una tienda `apiKey`, una zona central con tarifa y lo corre como la app. */
async function conEmpresaSembrada<T>(prisma: PrismaClient, fn: (c: Contexto) => Promise<T>): Promise<T> {
  return enTransaccionRevertida(prisma, async (tx) => {
    await serializarEscriturasReales(tx);
    const org = await tx.organizacion.create({ data: datosDeOrganizacionDePrueba(), select: { id: true } });
    await tx.organizacionModulo.createMany({
      data: ORDEN_MODULOS.map((modulo) => ({ organizacionId: org.id, modulo })),
    });
    await fijarEmpresa(tx, org.id);

    const rol = await tx.rol.findUniqueOrThrow({ where: { value: "apiKey" }, select: { id: true } });
    const tipo = await tx.tipoIdentificacion.findUniqueOrThrow({ where: { value: "cedula" }, select: { id: true } });
    const sufijo = randomUUID().replace(/-/g, "").slice(0, 12);
    const tienda = await tx.usuario.create({
      data: {
        nombre: "Tienda Nodo",
        primerApellido: "SLT45",
        email: `slt45-nodo-${sufijo}@example.com`,
        telefono: "80000000",
        passwordHash: "x",
        cedula: `slt45-${sufijo}`,
        tipoIdentificacionId: tipo.id,
        rolId: rol.id,
        estado: "activo",
      },
      select: { id: true },
    });

    const zona = await tx.zona.create({
      data: { nombre: "zona_1", esCentral: true, sinpeNumero: "80000000", sinpeNombre: "Titular de Prueba" },
      select: { id: true },
    });
    for (const ruta of ZONA_CENTRAL) {
      await tx.zonaDistrito.create({ data: { zonaId: zona.id, distritoId: await nodoPorRuta(tx, ruta) } });
    }
    await tx.tarifa.create({ data: { ...TARIFA_FIJA, zonaId: zona.id, tiendaId: null } });
    const estatus = await tx.orderStatus.findUniqueOrThrow({
      where: { value: "por_recolectar_en_tienda" },
      select: { id: true },
    });

    await comoApp(tx, org.id);
    try {
      const cli = clienteConSavepoint(tx);
      return await conEmpresa(org.id, async () => {
        const { catalogo } = await new CatalogoGeograficoRepository(cli).deLaEmpresa();
        return fn({
          tx,
          cli,
          repo: new OrdenRepository(cli),
          organizacionId: org.id,
          tiendaId: tienda.id,
          zonaId: zona.id,
          estatusId: estatus.id,
          catalogo,
        });
      });
    } finally {
      await tx.$executeRawUnsafe("RESET ROLE");
    }
  });
}

function datosDeOrden(c: Contexto, numRemision: string, geo: Pick<CreateOrdenData, "provinciaId" | "cantonId" | "distritoId" | "nodoGeograficoId">): CreateOrdenData {
  return {
    numRemision,
    estatusId: c.estatusId,
    destinatario: "Destinatario SLT-45",
    telefonoDest: "80000001",
    tiendaId: c.tiendaId,
    zonaId: c.zonaId,
    ...geo,
    producto: "Caja",
    peso: null,
    notas: null,
    direccion: null,
    montoCobrar: null,
  };
}

/** Lo que haran v2 y la sesion con el motor: crear por el repositorio con las FK de `fksDeNodo`. */
async function crearPorElRepositorio(c: Contexto, numRemision: string, nodoId: string): Promise<FilaDeOrden> {
  const nodo = c.catalogo.porId.get(nodoId);
  if (nodo === undefined) throw new Error(`el nodo ${nodoId} no esta en el catalogo de la empresa`);
  const fks = fksDeNodo(c.catalogo, nodo);
  if (fks === null) throw new Error(`el nodo ${nodoId} no admite guardado`);
  const r = await c.repo.createManyOrdenesConGuia(
    [datosDeOrden(c, numRemision, { ...fks, nodoGeograficoId: nodo.id })],
    500,
    { actorUsuarioId: c.tiendaId, origenTipo: "carga_api" },
    { cargaId: null, usuarioCargaId: c.tiendaId, totalFiles: 1, name: null },
    { conGuia: true },
  );
  expect(r.creadas).toHaveLength(1);
  return leerOrden(c.tx, { numRemision });
}

function esperarRuta(fila: FilaDeOrden, ruta: { provincia: string; canton: string; distrito: string | null }, nodo: string) {
  // R25/R26: las 3 FK derivadas de la ruta del nodo.
  expect(fila.provincia_id).toBe(ruta.provincia);
  expect(fila.canton_id).toBe(ruta.canton);
  expect(fila.distrito_id).toBe(ruta.distrito);
  // R27: el nodo guardado es el resuelto y es `COALESCE(distrito_id, canton_id)`.
  expect(fila.nodo_geografico_id).toBe(nodo);
  expect(fila.nodo_geografico_id).toBe(fila.coalesce);
}

describeSiHayBase("SLT-45 T3.3 — la orden guarda el nodo y las 3 FK (R25–R28)", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("R25/R27 — v1 (`cargarViaApi`), profundidad 3: provincia, canton y distrito de la terna; nodo = distrito", async () => {
    await conEmpresaSembrada(prisma, async (c) => {
      const servicio = new BulkOrdenService(c.repo, new TarifaVigenteRepository(c.cli), undefined, new CupoPlanRepository(c.cli));
      const r = await servicio.cargarViaApi(
        [
          {
            num_remision: "SLT45-V1-1",
            destinatario: "Destinatario 1",
            telefono: "80000001",
            provincia: "Cartago",
            canton: "Cartago",
            distrito: "Occidental",
            direccion: "Direccion 1",
            producto: "Producto 1",
          },
        ],
        { usuarioId: c.tiendaId, rol: "apiKey" },
      );
      expect(r.status).toBe("ok");
      if (r.status === "ok") expect(r.summary.creadas).toBe(1);

      const provincia = await nodoPorRuta(c.tx, ["Cartago"]);
      const canton = await nodoPorRuta(c.tx, ["Cartago", "Cartago"]);
      const distrito = await nodoPorRuta(c.tx, ["Cartago", "Cartago", "Occidental"]);
      esperarRuta(await leerOrden(c.tx, { numRemision: "SLT45-V1-1" }), { provincia, canton, distrito }, distrito);
    });
  });

  it("R25/R27 — v2 (motor + repositorio), profundidad 3: abuelo, padre y nodo; nodo = distrito", async () => {
    await conEmpresaSembrada(prisma, async (c) => {
      const resultado = resolverUbicacion(
        { tipo: "ruta", nombres: ["Cartago", "Cartago", "Oriental"] },
        c.catalogo,
        (await new CatalogoGeograficoRepository(c.cli).deLaEmpresa()).asignaciones,
      );
      expect(resultado.ok).toBe(true);
      if (!resultado.ok) return;
      const { nodo } = resultado.u;
      expect(nodo.profundidad).toBe(3);

      const fila = await crearPorElRepositorio(c, "SLT45-V2-3", nodo.id);
      const canton = await nodoPorRuta(c.tx, ["Cartago", "Cartago"]);
      const provincia = await nodoPorRuta(c.tx, ["Cartago"]);
      esperarRuta(fila, { provincia, canton, distrito: nodo.id }, nodo.id);
      // Las FK que escribio la app son las del motor, no otras.
      expect(resultado.u.fks).toEqual({ provinciaId: provincia, cantonId: canton, distritoId: nodo.id });
    });
  });

  it("R25/R27 — profundidad 2 (canton, por el repositorio): provincia = padre, canton = nodo, distrito vacio; nodo = canton", async () => {
    await conEmpresaSembrada(prisma, async (c) => {
      const provincia = await nodoPorRuta(c.tx, ["Cartago"]);
      const canton = await nodoPorRuta(c.tx, ["Cartago", "Paraíso"]);
      expect(c.catalogo.porId.get(canton)?.profundidad).toBe(2);

      const fila = await crearPorElRepositorio(c, "SLT45-V2-2", canton);
      esperarRuta(fila, { provincia, canton, distrito: null }, canton);
    });
  });

  it("R26/R27 — corregir la ubicacion escribe el distrito nuevo en las 3 FK y en el nodo, en la misma escritura", async () => {
    await conEmpresaSembrada(prisma, async (c) => {
      const provincia = await nodoPorRuta(c.tx, ["Cartago"]);
      const cantonViejo = await nodoPorRuta(c.tx, ["Cartago", "Paraíso"]);
      const canton = await nodoPorRuta(c.tx, ["Cartago", "Cartago"]);
      const occidental = await nodoPorRuta(c.tx, ["Cartago", "Cartago", "Occidental"]);
      const oriental = await nodoPorRuta(c.tx, ["Cartago", "Cartago", "Oriental"]);

      // De profundidad 3 a otro distrito.
      const de3 = await crearPorElRepositorio(c, "SLT45-COR-3", occidental);
      expect(
        await c.repo.corregirDatosCliente(
          de3.id,
          { provinciaId: provincia, cantonId: canton, distritoId: oriental, nodoGeograficoId: oriental, zonaId: c.zonaId },
          ESTADOS_SIN_CORRECCION,
          { actorUsuarioId: null, ubicacionCorregida: false },
        ),
      ).toBe("ok");
      esperarRuta(await leerOrden(c.tx, { id: de3.id }), { provincia, canton, distrito: oriental }, oriental);

      // De profundidad 2 (canton, sin distrito) a un distrito de otro canton: cambian canton y distrito.
      const de2 = await crearPorElRepositorio(c, "SLT45-COR-2", cantonViejo);
      expect(
        await c.repo.corregirDatosCliente(
          de2.id,
          { cantonId: canton, distritoId: occidental, nodoGeograficoId: occidental, zonaId: c.zonaId },
          ESTADOS_SIN_CORRECCION,
          { actorUsuarioId: null, ubicacionCorregida: false },
        ),
      ).toBe("ok");
      esperarRuta(await leerOrden(c.tx, { id: de2.id }), { provincia, canton, distrito: occidental }, occidental);
    });
  });

  it("R28 — el trigger `orden_nodo_geografico` de SLT-43 sigue derivando el nodo de las FK", async () => {
    const [funcion] = await prisma.$queryRawUnsafe<{ def: string }[]>(
      `SELECT pg_get_functiondef(p.oid) AS def
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'orden_nodo_geografico'`,
    );
    expect(funcion, "desaparecio la funcion `orden_nodo_geografico`").toBeDefined();
    const cuerpo = funcion.def.replace(/\s+/g, " ");
    expect(cuerpo).toContain("NEW.nodo_geografico_id := COALESCE(NEW.distrito_id, NEW.canton_id);");

    const [trigger] = await prisma.$queryRawUnsafe<{ def: string }[]>(
      `SELECT pg_get_triggerdef(t.oid) AS def
         FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'orden' AND t.tgname = 'orden_nodo_geografico'`,
    );
    expect(trigger, "desaparecio el trigger `orden_nodo_geografico`").toBeDefined();
    expect(trigger.def).toContain(
      "BEFORE INSERT OR UPDATE OF provincia_id, canton_id, distrito_id, nodo_geografico_id ON public.orden",
    );
    expect(trigger.def).toContain("EXECUTE FUNCTION orden_nodo_geografico()");
  });
});
