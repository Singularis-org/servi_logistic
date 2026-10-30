import type { PrismaClient } from "@prisma/client";

import { EmpresaNoResuelta, contextoActual } from "@/lib/db/contexto-empresa";
import type {
  CatalogoYAsignaciones,
  ICatalogoGeograficoRepository,
} from "@/lib/interfaces/repositories/ICatalogoGeograficoRepository";
import { SELECT_FLAG_PROPIO } from "@/lib/repositories/_shared/geografia-activa";
import { leerNodosConMarcaDeLaEmpresa, type ClienteDeMarcas } from "@/lib/repositories/_shared/zona-especial";
import {
  crearAsignaciones,
  crearCatalogo,
  type CatalogoGeografico,
  type NodoDelCatalogo,
  type TipoDeNivel,
} from "@/lib/services/geografia-dominio";

// SLT-44 (design §3, §4) — LA CARGA DEL CATALOGO GEOGRAFICO, una vez por peticion y por empresa.
//
// POR QUE LA MEMORIA VIVE EN LA INSTANCIA Y NO EN EL MODULO. Las composiciones crean el repositorio
// en cada llamada, asi que la vida de la memoria es la de la peticion: una escritura de geografia,
// de zona o de marca termina en su peticion y la siguiente lee lo nuevo, sin TTL ni invalidacion.
// Un `Map` de modulo serviria un nodo retirado durante el TTL y mezclaria asignaciones de empresas
// (design §11, alternativas 1 a 3).
//
// POR QUE SE MEMORIZA LA PROMESA Y NO EL RESULTADO. Las tres listas de los filtros van en
// `Promise.all`: con el resultado, las tres verian la memoria vacia y harian tres cargas.

/** La clave de la empresa que sale de la cookie: en una peticion es una sola. */
const CLAVE_SESION = "sesion";

type CatalogoPrismaClient = Pick<PrismaClient, "$transaction">;

/** Lo que la transaccion de la carga usa del cliente. Las marcas, por su tipo del punto unico. */
type TxDeCarga = Pick<PrismaClient, "zonaDistrito" | "organizacion" | "tipoNivelGeografico" | "nodoGeografico"> &
  ClienteDeMarcas;

type TxDeCatalogo = Pick<PrismaClient, "tipoNivelGeografico" | "nodoGeografico">;

const SELECT_TIPO = {
  id: true,
  clave: true,
  nombreSingular: true,
  nombrePlural: true,
  digitosCodigo: true,
  codigoHeredaPrefijo: true,
} as const;

// El flag propio por el fragmento compartido: la guardia `geografia-predicado-unico` prohibe el
// literal fuera de `_shared/geografia-activa.ts`.
const SELECT_NODO = {
  id: true,
  padreId: true,
  profundidad: true,
  tipoId: true,
  nombre: true,
  nombreNormalizado: true,
  codigoOficial: true,
  ...SELECT_FLAG_PROPIO,
} as const;

// Por nombre, con la collation de la base, como ordenan hoy las tablas viejas; el `id` fija el
// orden entre nombres repetidos, que hoy no esta definido (design §3).
const ORDEN_NODOS = [{ nombre: "asc" as const }, { id: "asc" as const }];

// Todas las lecturas de una carga ven la misma foto de la base.
const OPCIONES_TRANSACCION = { isolationLevel: "RepeatableRead" as const };

async function leerCatalogo(tx: TxDeCatalogo, paisId: string): Promise<CatalogoGeografico> {
  // El `where` por pais va explicito ademas de la RLS (R9): en plataforma no hay RLS que recorte.
  const tipos: TipoDeNivel[] = await tx.tipoNivelGeografico.findMany({
    where: { paisId },
    select: SELECT_TIPO,
    orderBy: { clave: "asc" },
  });
  const nodos: NodoDelCatalogo[] = await tx.nodoGeografico.findMany({
    where: { paisId },
    select: SELECT_NODO,
    orderBy: ORDEN_NODOS,
  });
  return crearCatalogo(paisId, tipos, nodos);
}

async function leerDeLaEmpresa(tx: TxDeCarga): Promise<CatalogoYAsignaciones> {
  // Primera a proposito: es un modelo de negocio, y sin empresa la extension la rechaza con
  // `EmpresaNoResuelta` antes de ejecutar nada (R10). El nodo es `distrito_id` (R12).
  const filasDeZona = await tx.zonaDistrito.findMany({
    select: { distritoId: true, zona: { select: { id: true, nombre: true, esCentral: true } } },
    orderBy: { id: "asc" },
  });
  // La politica `organizacion_propia` solo deja ver la empresa del contexto.
  const organizacion = await tx.organizacion.findFirst({ select: { paisId: true } });
  if (organizacion === null) throw new EmpresaNoResuelta("Organizacion", "findFirst");
  const catalogo = await leerCatalogo(tx, organizacion.paisId);
  const marcas = await leerNodosConMarcaDeLaEmpresa(tx);
  const asignaciones = crearAsignaciones(
    filasDeZona.map((f) => ({ nodoId: f.distritoId, zona: f.zona })),
    marcas,
  );
  return { catalogo, asignaciones };
}

export class CatalogoGeograficoRepository implements ICatalogoGeograficoRepository {
  private readonly cargas = new Map<string, Promise<CatalogoYAsignaciones>>();

  constructor(private readonly prisma: CatalogoPrismaClient) {}

  async deLaEmpresa(): Promise<CatalogoYAsignaciones> {
    const ctx = contextoActual();
    // En plataforma los modelos de negocio van sin filtro: sin este corte, `zona_distrito` traeria
    // las filas de todas las empresas (design §3, paso 1).
    if (ctx?.tipo === "plataforma") throw new EmpresaNoResuelta("CatalogoGeografico", "deLaEmpresa");
    const clave = ctx?.tipo === "empresa" ? ctx.organizacionId : CLAVE_SESION;

    const enCurso = this.cargas.get(clave);
    if (enCurso) return enCurso;

    const carga = this.prisma.$transaction((tx) => leerDeLaEmpresa(tx), OPCIONES_TRANSACCION);
    this.cargas.set(clave, carga);
    // Una carga fallida no se queda en la memoria: el siguiente intento vuelve a leer. El rechazo
    // le llega igual al llamador por `carga`.
    carga.catch(() => {
      if (this.cargas.get(clave) === carga) this.cargas.delete(clave);
    });
    return carga;
  }

  async dePais(paisId: string): Promise<CatalogoGeografico> {
    return this.prisma.$transaction((tx) => leerCatalogo(tx, paisId), OPCIONES_TRANSACCION);
  }
}
