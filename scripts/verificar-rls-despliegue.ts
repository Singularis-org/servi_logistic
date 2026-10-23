// SL-17 T4.1 (D21, design §4): verifica en una base REAL que la RLS por empresa protege a la app.
//
// Uso (las URLs van por variables de entorno; el script nunca las imprime):
//   DATABASE_URL=<pooler transaccional :6543> DIRECT_URL=<sesion :5432> \
//     pnpm exec tsx scripts/verificar-rls-despliegue.ts
//
//   · DATABASE_URL: la del runtime. Por ella van los puntos 2 a 5, que son los que dependen del
//     pooler (set_config local a la transaccion y conexion devuelta limpia al pool).
//   · DIRECT_URL: la del CLI. Por ella van los puntos 1 y 6 (catalogo). En local, sin pooler, se
//     pasa la misma URL en las dos.
//
// Solo lectura, salvo UNA transaccion que siempre se revierte (punto 3): dos organizaciones de
// prueba y una `zona` de cada una. Sale con 0 si los 6 puntos cuadran; con 1 nombrando el que
// falla. Si falla el 1 o el 2 aplica el plan B de design §4; si falla el 3, 4 o 5, no se dan de
// alta empresas en esa base.

import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@prisma/client";

const ROL_APP = "servi_app";
// Contrato de M2 y M3 (design §2.1, §3): 73 tablas de negocio, 150 FK de negocio a negocio.
const POLITICAS_POR_EMPRESA = 73;
const TRIGGERS_MISMA_EMPRESA = 150;
const TRIGGERS_SIN_CAMBIO = 73;

type Tx = Prisma.TransactionClient;

interface ResultadoPunto {
  punto: number;
  ok: boolean;
  detalle: string;
}

class Revertir extends Error {}

/** Quita de un mensaje cualquier URL de conexion, host o usuario de las URLs recibidas. */
function crearSaneador(urls: string[]): (texto: string) => string {
  const secretos = new Set<string>();
  for (const u of urls) {
    try {
      const p = new URL(u);
      if (p.hostname) secretos.add(p.hostname);
      // El usuario del pooler de Supabase es `<rol>.<ref del proyecto>`: el ref se oculta; el
      // nombre del rol (p. ej. `postgres`) no es secreto y se deja para leer los puntos 2 y 4.
      const usuario = decodeURIComponent(p.username);
      const punto = usuario.indexOf(".");
      if (punto >= 0) {
        secretos.add(usuario);
        secretos.add(usuario.slice(punto + 1));
      }
      if (p.password) secretos.add(decodeURIComponent(p.password));
    } catch {
      // URL no parseable: el reemplazo generico de abajo sigue aplicando
    }
  }
  return (texto) => {
    let t = texto.replace(/postgres(ql)?:\/\/\S+/g, "<url-oculta>");
    for (const s of secretos) t = t.split(s).join("<oculto>");
    return t;
  };
}

function cliente(url: string): PrismaClient {
  // max 1: las dos transacciones del punto 4 salen por la MISMA conexion del cliente, que es lo
  // que el pool de la app reutiliza.
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 1 }) });
}

async function uno<T>(tx: Tx | PrismaClient, sql: Prisma.Sql): Promise<T> {
  const filas = await tx.$queryRaw<T[]>(sql);
  return filas[0] as T;
}

async function punto1(directo: PrismaClient): Promise<ResultadoPunto> {
  const rol = await directo.$queryRaw<{ rolbypassrls: boolean; rolcanlogin: boolean }[]>(
    Prisma.sql`SELECT rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = ${ROL_APP}`
  );
  if (rol.length === 0) return { punto: 1, ok: false, detalle: `${ROL_APP} no existe en pg_roles` };
  const miembro = await uno<{ yo: string; miembro: boolean }>(
    directo,
    Prisma.sql`SELECT current_user::text AS yo, pg_has_role(current_user, ${ROL_APP}, 'MEMBER') AS miembro`
  );
  const { rolbypassrls, rolcanlogin } = rol[0];
  const ok = !rolbypassrls && !rolcanlogin && miembro.miembro;
  return {
    punto: 1,
    ok,
    detalle: `rolbypassrls=${rolbypassrls} rolcanlogin=${rolcanlogin} usuario_de_la_url_es_miembro=${miembro.miembro}`,
  };
}

async function punto6(directo: PrismaClient): Promise<ResultadoPunto> {
  const p = await uno<{ politicas: number; para_app: number; con_rls: number }>(
    directo,
    Prisma.sql`
      SELECT count(*)::int AS politicas,
             count(*) FILTER (WHERE ${ROL_APP}::name = ANY (pol.roles))::int AS para_app,
             count(*) FILTER (WHERE c.relrowsecurity)::int AS con_rls
        FROM pg_policies pol
        JOIN pg_namespace n ON n.nspname = pol.schemaname
        JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = pol.tablename
       WHERE pol.schemaname = 'public' AND pol.policyname LIKE '%\\_por\\_empresa'`
  );
  const t = await uno<{ sme: number; sin_cambio: number }>(
    directo,
    Prisma.sql`
      SELECT count(*) FILTER (WHERE t.tgname LIKE 'sme\\_%' AND f.proname = 'verificar_misma_empresa')::int AS sme,
             count(*) FILTER (WHERE t.tgname LIKE '%\\_sin\\_cambio\\_de\\_empresa' AND f.proname = 'impedir_cambio_de_empresa')::int AS sin_cambio
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_proc f ON f.oid = t.tgfoid
       WHERE n.nspname = 'public' AND NOT t.tgisinternal AND t.tgenabled <> 'D'`
  );
  const ok =
    p.politicas === POLITICAS_POR_EMPRESA &&
    p.para_app === POLITICAS_POR_EMPRESA &&
    p.con_rls === POLITICAS_POR_EMPRESA &&
    t.sme === TRIGGERS_MISMA_EMPRESA &&
    t.sin_cambio === TRIGGERS_SIN_CAMBIO;
  return {
    punto: 6,
    ok,
    detalle:
      `politicas *_por_empresa=${p.politicas}/${POLITICAS_POR_EMPRESA} (para ${ROL_APP}=${p.para_app}, ` +
      `tabla con RLS activa=${p.con_rls}); triggers sme_*=${t.sme}/${TRIGGERS_MISMA_EMPRESA} activos, ` +
      `*_sin_cambio_de_empresa=${t.sin_cambio}/${TRIGGERS_SIN_CAMBIO} activos`,
  };
}

async function fijarEmpresa(tx: Tx, organizacionId: string): Promise<void> {
  await tx.$queryRaw(Prisma.sql`SELECT set_config('app.organizacion_id', ${organizacionId}, true)`);
}

/** Puntos 2, 3 y 5 en UNA transaccion por el pooler, revertida siempre. Devuelve el dueno. */
async function puntos2a5(
  pooler: PrismaClient,
  resultados: ResultadoPunto[],
  ids: { orgA: string; orgB: string; zonaA: string; zonaB: string }
): Promise<string | null> {
  let dueno: string | null = null;
  let base = "?";
  let enCurso = 5; // el punto que se esta evaluando cuando algo lanza
  try {
    await pooler.$transaction(
      async (tx) => {
        const inicio = await uno<{ yo: string; base: string }>(
          tx,
          Prisma.sql`SELECT current_user::text AS yo, current_database()::text AS base`
        );
        dueno = inicio.yo;
        base = inicio.base;
        const sufijo = ids.orgA.slice(0, 8);
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO organizacion (id, nombre, slug, updated_at) VALUES
            (${ids.orgA}, 'Verificacion T4.1 A', ${`t41-verif-a-${sufijo}`}, now()),
            (${ids.orgB}, 'Verificacion T4.1 B', ${`t41-verif-b-${sufijo}`}, now())`);
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO zona (id, nombre, sinpe_numero, sinpe_nombre, organizacion_id) VALUES
            (${ids.zonaA}, 'Verificacion T4.1 A', '60000000', 'Verificacion', ${ids.orgA}),
            (${ids.zonaB}, 'Verificacion T4.1 B', '60000000', 'Verificacion', ${ids.orgB})`);

        // Punto 5 (a): como dueno, sin bajar de rol, un SELECT sin WHERE ve las dos empresas.
        const comoDueno = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM zona`);
        const duenoVeA = comoDueno.some((f) => f.id === ids.zonaA);
        const duenoVeB = comoDueno.some((f) => f.id === ids.zonaB);

        // Punto 2: la bajada de rol de la app (design §4), por el pooler.
        enCurso = 2;
        await tx.$queryRaw(
          Prisma.sql`SELECT set_config('app.organizacion_id', ${ids.orgA}, true), set_config('role', ${ROL_APP}, true)`
        );
        const yo = (await uno<{ yo: string }>(tx, Prisma.sql`SELECT current_user::text AS yo`)).yo;
        resultados.push({
          punto: 2,
          ok: yo === ROL_APP,
          detalle: `base=${base}; current_user antes=${dueno} despues de set_config('role')=${yo}`,
        });
        if (yo !== ROL_APP) throw new Revertir();

        // Punto 3: con empresa A ve solo A; con B solo B; sin empresa, 0 filas.
        enCurso = 3;
        const conA = await tx.$queryRaw<{ id: string; organizacion_id: string }[]>(
          Prisma.sql`SELECT id, organizacion_id FROM zona`
        );
        await fijarEmpresa(tx, ids.orgB);
        const conB = await tx.$queryRaw<{ id: string; organizacion_id: string }[]>(
          Prisma.sql`SELECT id, organizacion_id FROM zona`
        );
        await fijarEmpresa(tx, "");
        const sinEmpresa = await uno<{ n: number }>(tx, Prisma.sql`SELECT count(*)::int AS n FROM zona`);
        const soloA = conA.length > 0 && conA.every((f) => f.organizacion_id === ids.orgA);
        const soloB = conB.length > 0 && conB.every((f) => f.organizacion_id === ids.orgB);
        const ok3 =
          soloA && soloB && conA.some((f) => f.id === ids.zonaA) && conB.some((f) => f.id === ids.zonaB) && sinEmpresa.n === 0;
        resultados.push({
          punto: 3,
          ok: ok3,
          detalle:
            `con empresa A: ${conA.length} fila(s), todas de A=${soloA}; con empresa B: ${conB.length} fila(s), ` +
            `todas de B=${soloB}; sin empresa: ${sinEmpresa.n} fila(s)`,
        });

        // Punto 5 (b): el mismo SELECT, con la bajada de rol, ve una sola empresa.
        enCurso = 5;
        resultados.push({
          punto: 5,
          ok: duenoVeA && duenoVeB && soloA && !conA.some((f) => f.id === ids.zonaB),
          detalle:
            `como dueno (${dueno}) sin bajar de rol ve A=${duenoVeA} y B=${duenoVeB} (${comoDueno.length} fila(s)); ` +
            `como ${ROL_APP} con empresa A ve B=${conA.some((f) => f.id === ids.zonaB)}`,
        });
        throw new Revertir();
      },
      { timeout: 30_000, maxWait: 30_000 }
    );
  } catch (e) {
    if (!(e instanceof Revertir)) {
      if (!resultados.some((r) => r.punto === enCurso)) {
        resultados.push({ punto: enCurso, ok: false, detalle: `error: ${(e as Error).message}` });
      }
      throw e;
    }
  }
  return dueno;
}

async function punto4(
  pooler: PrismaClient,
  dueno: string,
  ids: { orgA: string; orgB: string; zonaA: string; zonaB: string }
): Promise<ResultadoPunto> {
  const r = await pooler.$transaction(async (tx) =>
    uno<{ yo: string; empresa: string | null; zonas: number; orgs: number }>(
      tx,
      Prisma.sql`
        SELECT current_user::text AS yo,
               current_setting('app.organizacion_id', true) AS empresa,
               (SELECT count(*)::int FROM zona WHERE id IN (${ids.zonaA}, ${ids.zonaB})) AS zonas,
               (SELECT count(*)::int FROM organizacion WHERE id IN (${ids.orgA}, ${ids.orgB})) AS orgs`
    )
  );
  const vacia = r.empresa === null || r.empresa === "";
  return {
    punto: 4,
    ok: r.yo === dueno && vacia && r.zonas === 0 && r.orgs === 0,
    detalle:
      `transaccion siguiente: current_user=${r.yo} (dueno=${dueno}); app.organizacion_id=` +
      `${r.empresa === null ? "NULL" : `'${r.empresa}'`}; filas de prueba que quedan: zona=${r.zonas} organizacion=${r.orgs}`,
  };
}

export async function verificar(urlPooler: string, urlDirecta: string): Promise<ResultadoPunto[]> {
  const pooler = cliente(urlPooler);
  const directo = cliente(urlDirecta);
  const resultados: ResultadoPunto[] = [];
  const ids = { orgA: randomUUID(), orgB: randomUUID(), zonaA: randomUUID(), zonaB: randomUUID() };
  try {
    resultados.push(await punto1(directo));
    try {
      const dueno = await puntos2a5(pooler, resultados, ids);
      if (dueno !== null) resultados.push(await punto4(pooler, dueno, ids));
    } catch {
      // ya registrado en `resultados` con el punto que estaba en curso
    }
    resultados.push(await punto6(directo));
  } finally {
    await Promise.allSettled([pooler.$disconnect(), directo.$disconnect()]);
  }
  return resultados.sort((a, b) => a.punto - b.punto);
}

async function main(): Promise<number> {
  const urlPooler = process.env.DATABASE_URL;
  const urlDirecta = process.env.DIRECT_URL;
  if (!urlPooler || !urlDirecta) {
    console.error("Faltan DATABASE_URL (pooler) y/o DIRECT_URL (sesion).");
    return 2;
  }
  const sanear = crearSaneador([urlPooler, urlDirecta]);
  const puerto = (u: string): string => {
    try {
      return new URL(u).port || "5432";
    } catch {
      return "?";
    }
  };
  console.log(`verificar-rls-despliegue: DATABASE_URL puerto ${puerto(urlPooler)}, DIRECT_URL puerto ${puerto(urlDirecta)}`);
  let resultados: ResultadoPunto[];
  try {
    resultados = await verificar(urlPooler, urlDirecta);
  } catch (e) {
    console.error(`FALLA: no se pudo verificar: ${sanear((e as Error).message)}`);
    return 1;
  }
  for (let n = 1; n <= 6; n++) {
    const r = resultados.find((x) => x.punto === n);
    if (!r) console.log(`Punto ${n}: FALLA (no evaluado: fallo un punto anterior)`);
    else console.log(`Punto ${n}: ${r.ok ? "OK" : "FALLA"} - ${sanear(r.detalle)}`);
  }
  const fallan = [1, 2, 3, 4, 5, 6].filter((n) => !resultados.find((x) => x.punto === n)?.ok);
  if (fallan.length === 0) {
    console.log("RESULTADO: los 6 puntos cuadran.");
    return 0;
  }
  console.log(`RESULTADO: FALLA en el/los punto(s) ${fallan.join(", ")}.`);
  return 1;
}

const esEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (esEntrypoint) {
  main().then(
    (codigo) => {
      process.exitCode = codigo;
    },
    () => {
      console.error("FALLA: error inesperado (detalle omitido para no exponer la conexion).");
      process.exitCode = 1;
    }
  );
}
