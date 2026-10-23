import type { Prisma, PrismaClient } from "@prisma/client";
import {
  type ContextoDatos,
  EmpresaCruzada,
  EmpresaNoResuelta,
  UsuarioSinEmpresa,
  contextoActual,
  dentroDeTransaccionDeEmpresa,
  traducirErrorDeEmpresa,
} from "./contexto-empresa";
import { MODELO_NEGOCIO_NULABLE, esModeloDeNegocio } from "./modelos-de-negocio";

// SL-17 (design §6) — la extension que aisla por empresa el cliente de la app. Tabla de §6.1:
//
// | Contexto                   | Modelo de negocio          | Modelo de plataforma | SQL a mano            |
// |----------------------------|----------------------------|----------------------|-----------------------|
// | empresa, fuera de tx       | filtro + envoltura         | envoltura (RLS)      | envoltura (RLS)       |
// | empresa, dentro de tx      | filtro                     | tal cual (RLS)       | tal cual (RLS)        |
// | plataforma                 | tal cual (salvo R35)       | tal cual             | tal cual              |
// | ninguno                    | EmpresaNoResuelta          | tal cual             | EmpresaNoResuelta     |
//
// El filtro es la primera barrera; la RLS (que exige la envoltura con `set_config`) cubre lo que
// el filtro no ve: `include`/escrituras anidadas y el SQL a mano.
//
// «Modelo de plataforma» es aqui todo lo que no es de negocio (catalogos, geografia, auth, cache,
// `jobs`, `organizacion`). En contexto de empresa tambien va envuelto (SL-17 T3.10): sin la
// envoltura corre como dueno, sin RLS, y un `select`/`include` anidado hacia negocio
// (`distrito.zonas` → `zona_distrito`) traia filas de otras empresas; y una escritura en
// `vehiculos` o en la geografia pasaba, cuando R40 dice que falla. Con `servi_app` mandan las
// politicas de M1: catalogos y geografia solo lectura, auth con «dueno visible», cache y `jobs`
// abiertas. Sin empresa (login, superadmin, scripts) siguen tal cual: no la exigen.

type Args = Record<string, unknown>;

type ParamsOperacion = {
  model?: string;
  operation: string;
  args: unknown;
  query: (args: unknown) => Promise<unknown>;
};

const CAMPO = "organizacionId";
const RELACION = "organizacion";

const CON_WHERE = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "updateManyAndReturn",
  "deleteMany",
]);
const CON_WHERE_UNICO = new Set(["findUnique", "findUniqueOrThrow", "update", "delete", "upsert"]);
const CREACIONES = new Set(["create", "createMany", "createManyAndReturn", "upsert"]);

function esObjeto(v: unknown): v is Args {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function comoLista(v: unknown): unknown[] {
  return Array.isArray(v) ? v : v === undefined ? [] : [v];
}

/* -------------------------------------------------------------------------- */
/* Filtro (§6.2)                                                               */
/* -------------------------------------------------------------------------- */

function conWhere(where: unknown, id: string): Args {
  return { AND: [where ?? {}, { [CAMPO]: id }] };
}

function conWhereUnico(where: unknown, id: string): Args {
  const w = esObjeto(where) ? where : {};
  // Si el llamador ya filtra por empresa, no se pisa su valor: se le suma la del contexto, y un
  // valor de otra empresa da «no encontrado» (R8) en vez de reescribirse a la propia.
  if (w[CAMPO] === undefined) return { ...w, [CAMPO]: id };
  return { ...w, AND: [...comoLista(w.AND), { [CAMPO]: id }] };
}

/** Valor que una escritura pretende dejar en la columna (`x` o `{ set: x }`). */
function valorEscrito(v: unknown): unknown {
  return esObjeto(v) && "set" in v ? v.set : v;
}

/** Lanza `EmpresaCruzada` si `datos` llevan a la fila a otra empresa (R10). */
function exigirMismaEmpresa(modelo: string, datos: unknown, id: string): void {
  if (!esObjeto(datos)) return;
  if (datos[CAMPO] !== undefined && valorEscrito(datos[CAMPO]) !== id) {
    throw new EmpresaCruzada(modelo);
  }
  const relacion = datos[RELACION];
  if (relacion !== undefined) {
    // Solo vale conectar con la propia: `create`, `disconnect` o `connectOrCreate` sobre la
    // relacion con la empresa es, por definicion, salir de ella.
    const soloConecta = esObjeto(relacion) && Object.keys(relacion).length === 1 && esObjeto(relacion.connect);
    if (!soloConecta || (relacion.connect as Args).id !== id) {
      throw new EmpresaCruzada(modelo);
    }
  }
}

/**
 * Datos de una creacion con la empresa puesta.
 *
 * Solo se inyecta la columna cuando los datos son escalares puros. Si traen escrituras de
 * relacion (`tienda: { connect }`), Prisma puede estar validando la forma «checked», donde la
 * columna FK no existe y pasarla rompe la consulta; el DMMF de Prisma 7 en ejecucion no dice que
 * lado de una relacion es el dueno, asi que no se puede decidir. Ahi la empresa la pone el
 * `DEFAULT` de la columna (design §3, M2), que sale del mismo `set_config` de la envoltura.
 */
function conEmpresaEnDatos(modelo: string, datos: unknown, id: string): unknown {
  if (!esObjeto(datos)) return datos;
  exigirMismaEmpresa(modelo, datos, id);
  if (datos[RELACION] !== undefined) return datos;
  const traeRelaciones = Object.entries(datos).some(([k, v]) => k !== CAMPO && esEscrituraDeRelacion(v));
  return traeRelaciones ? datos : { ...datos, [CAMPO]: id };
}

const OPERACIONES_DE_RELACION = [
  "connect",
  "connectOrCreate",
  "create",
  "createMany",
  "disconnect",
  "set",
  "update",
  "updateMany",
  "upsert",
  "delete",
  "deleteMany",
];

function esEscrituraDeRelacion(v: unknown): boolean {
  // `{ set: x }` tambien es la forma de actualizar un escalar, pero en una creacion no aparece.
  return esObjeto(v) && Object.keys(v).some((k) => OPERACIONES_DE_RELACION.includes(k));
}

function argsFiltrados(modelo: string, operacion: string, args: unknown, id: string): unknown {
  const a: Args = esObjeto(args) ? { ...args } : {};

  if (CON_WHERE.has(operacion)) a.where = conWhere(a.where, id);
  else if (CON_WHERE_UNICO.has(operacion)) a.where = conWhereUnico(a.where, id);
  else if (!CREACIONES.has(operacion)) {
    // Una operacion nueva de Prisma sin regla aqui no puede pasar sin filtro.
    throw new Error(`SL-17: ${modelo}.${operacion} no tiene regla de aislamiento por empresa`);
  }

  switch (operacion) {
    case "create":
      a.data = conEmpresaEnDatos(modelo, a.data, id);
      break;
    case "createMany":
    case "createManyAndReturn":
      a.data = Array.isArray(a.data)
        ? a.data.map((d) => conEmpresaEnDatos(modelo, d, id))
        : conEmpresaEnDatos(modelo, a.data, id);
      break;
    case "upsert":
      a.create = conEmpresaEnDatos(modelo, a.create, id);
      exigirMismaEmpresa(modelo, a.update, id);
      break;
    case "update":
    case "updateMany":
    case "updateManyAndReturn":
      exigirMismaEmpresa(modelo, a.data, id);
      break;
  }
  return a;
}

/** R35: en plataforma, un usuario solo nace sin empresa si alguien escribio el `null`. */
function exigirEmpresaDeclaradaEnUsuario(operacion: string, args: unknown): void {
  if (!CREACIONES.has(operacion) || !esObjeto(args)) return;
  const datos = operacion === "upsert" ? [args.create] : comoLista(args.data);
  for (const d of datos) {
    const declarada = esObjeto(d) && (d[CAMPO] !== undefined || d[RELACION] !== undefined);
    if (!declarada) throw new UsuarioSinEmpresa();
  }
}

/* -------------------------------------------------------------------------- */
/* La extension                                                                */
/* -------------------------------------------------------------------------- */

export function conAislamientoPorEmpresa(
  base: PrismaClient,
  resolver: () => Promise<string | null>,
): PrismaClient {
  // Siempre con el cliente BASE: por el extendido, el `set_config` volveria a pasar por la
  // extension y abriria otra transaccion en otra conexion.
  const fijarEmpresa = (id: string) =>
    base.$executeRaw`SELECT set_config('app.organizacion_id', ${id}, true), set_config('role', 'servi_app', true)`;

  function aplicar(ctx: ContextoDatos | undefined, p: ParamsOperacion): Promise<unknown> {
    const { model, operation, args, query } = p;
    const esSqlAMano = model === undefined;
    const esNegocio = !esSqlAMano && esModeloDeNegocio(model);

    if (!ctx) {
      // Plataforma sin empresa: no la exige. El SQL a mano o el negocio sin contexto correrian
      // como dueno, sin RLS: verian todas las empresas.
      if (!esSqlAMano && !esNegocio) return query(args);
      return Promise.reject(new EmpresaNoResuelta(model ?? "$sql", operation));
    }

    if (ctx.tipo === "plataforma") {
      if (model === MODELO_NEGOCIO_NULABLE) exigirEmpresaDeclaradaEnUsuario(operation, args);
      return query(args);
    }

    const id = ctx.organizacionId;
    // Solo el negocio lleva filtro: un modelo de plataforma no tiene `organizacion_id`. Lo que
    // cuelga de el lo filtra la RLS de la envoltura.
    const filtrados = esNegocio ? argsFiltrados(model, operation, args, id) : args;
    // Dentro de una transaccion el `set_config` ya se puso al abrirla (§6.4). Aqui `query` se
    // devuelve sin encadenar nada: en un lote, Prisma espera las promesas tal cual las da.
    if (ctx.enTransaccion) return query(filtrados);

    return base
      .$transaction([fijarEmpresa(id), query(filtrados) as Prisma.PrismaPromise<unknown>])
      .then(([, resultado]) => resultado);
  }

  function manejar(p: ParamsOperacion): Promise<unknown> {
    const traducir = (e: unknown) => Promise.reject(traducirErrorDeEmpresa(e, p.model ?? p.operation));
    try {
      const explicito = contextoActual();
      // Con contexto explicito, todo es sincrono hasta `query`: en un `$transaction([...])` el
      // lote se despacha con las promesas que ya llegaron, y un `await` previo lo descuadraria.
      if (explicito) {
        const r = aplicar(explicito, p);
        return explicito.tipo === "empresa" && explicito.enTransaccion ? r : r.catch(traducir);
      }
      // Tambien para los modelos de plataforma: en una peticion con sesion la empresa sale de
      // aqui, y sin ella su lectura correria como dueno (ver la cabecera). Si no resuelve, van
      // tal cual. El resolutor memoriza por sesion; lo que se paga es la envoltura (~1 ms).
      return resolver()
        .then((orgId) => aplicar(orgId ? { tipo: "empresa", organizacionId: orgId } : undefined, p))
        .catch(traducir);
    } catch (e) {
      return traducir(e);
    }
  }

  const extendido = base.$extends({
    query: {
      $allOperations(params) {
        return manejar(params as unknown as ParamsOperacion);
      },
    },
  }) as unknown as PrismaClient;

  async function contextoDeTransaccion(): Promise<ContextoDatos | undefined> {
    const explicito = contextoActual();
    if (explicito) return explicito;
    const orgId = await resolver();
    return orgId ? { tipo: "empresa", organizacionId: orgId } : undefined;
  }

  // §6.4: una `$transaction` de empresa fija la empresa una vez, al abrirla, y marca el contexto
  // para que lo de dentro no se vuelva a envolver. Una llamada al `$transaction` del cliente
  // dentro de otra transaccion abre una NUEVA (otra conexion), asi que tambien se fija.
  function transaccion(arg: unknown, opciones?: unknown): Promise<unknown> {
    const traducir = (e: unknown) => Promise.reject(traducirErrorDeEmpresa(e));
    return contextoDeTransaccion()
      .then((ctx): Promise<unknown> => {
        if (ctx?.tipo !== "empresa") {
          return Array.isArray(arg)
            ? base.$transaction(arg as Prisma.PrismaPromise<unknown>[], opciones as never)
            : extendido.$transaction(arg as (tx: Prisma.TransactionClient) => Promise<unknown>, opciones as never);
        }
        const id = ctx.organizacionId;
        if (Array.isArray(arg)) {
          return dentroDeTransaccionDeEmpresa(id, () =>
            base.$transaction(
              [fijarEmpresa(id), ...(arg as Prisma.PrismaPromise<unknown>[])],
              opciones as never,
            ),
          ).then((resultados) => resultados.slice(1));
        }
        const fn = arg as (tx: Prisma.TransactionClient) => Promise<unknown>;
        // La interactiva va por el EXTENDIDO: su `tx` tiene que seguir filtrando (§6.2).
        return extendido.$transaction(
          (tx) =>
            dentroDeTransaccionDeEmpresa(id, async () => {
              await tx.$executeRaw`SELECT set_config('app.organizacion_id', ${id}, true), set_config('role', 'servi_app', true)`;
              return fn(tx);
            }),
          opciones as never,
        );
      })
      .catch(traducir);
  }

  return new Proxy(extendido, {
    get(objetivo, prop) {
      if (prop === "$transaction") return transaccion;
      const valor = Reflect.get(objetivo, prop) as unknown;
      return typeof valor === "function" ? (valor as (...a: unknown[]) => unknown).bind(objetivo) : valor;
    },
  });
}
