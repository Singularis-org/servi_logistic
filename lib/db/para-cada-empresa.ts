import type { ModuloApagable } from "@prisma/client";

import { comoPlataforma, conEmpresa } from "./contexto-empresa";
import { getPrismaClient } from "./prisma-client";

// SL-17 (R16) — un cron o job recurrente que toca datos de negocio corre una vez por empresa,
// cada vez con esa empresa en contexto: asi el filtro y la RLS le aplican igual que a una
// peticion. Listar las organizaciones es lo unico que se hace como plataforma.

/** Lo minimo que se necesita del cliente; lo cumple `getPrismaClient()` y un doble de test. */
export type ClienteDeOrganizaciones = {
  organizacion: {
    findMany(args: {
      select: { id: true };
      orderBy: { createdAt: "asc" };
      /** SL-23 (R21): solo las empresas con el módulo encendido. */
      where?: { modulos: { some: { modulo: ModuloApagable } } };
    }): Promise<{ id: string }[]>;
  };
};

export type ResumenPorEmpresa = {
  ok: string[];
  fallidas: { organizacionId: string; error: unknown }[];
  /** SL-23 (R21): las que tienen apagado el módulo del cron; no corrieron. Vacío sin `modulo`. */
  saltadas: string[];
};

export type OpcionesParaCadaEmpresa = {
  cliente?: ClienteDeOrganizaciones;
  /**
   * SL-23 (design §5.4, R21): el módulo del cron o job. Se salta las empresas que lo tienen apagado.
   * Los de cálculo continuo (§3.8, R30) no lo pasan: corren para todas.
   */
  modulo?: ModuloApagable;
};

async function listar(
  cliente: ClienteDeOrganizaciones,
  modulo: ModuloApagable | undefined,
): Promise<{ organizaciones: { id: string }[]; saltadas: string[] }> {
  const todas = await cliente.organizacion.findMany({ select: { id: true }, orderBy: { createdAt: "asc" } });
  if (modulo === undefined) return { organizaciones: todas, saltadas: [] };
  const con = await cliente.organizacion.findMany({
    select: { id: true },
    orderBy: { createdAt: "asc" },
    where: { modulos: { some: { modulo } } },
  });
  const encendidas = new Set(con.map((o) => o.id));
  return {
    organizaciones: con,
    saltadas: todas.filter((o) => !encendidas.has(o.id)).map((o) => o.id),
  };
}

export async function paraCadaEmpresa(
  fn: (organizacionId: string) => Promise<void>,
  opciones: OpcionesParaCadaEmpresa = {},
): Promise<ResumenPorEmpresa> {
  // El tipo ancho de `getPrismaClient()` no conoce el modelo hasta regenerar el cliente con el
  // esquema de SL-17; la forma se fija en `ClienteDeOrganizaciones`.
  const cliente = opciones.cliente ?? (getPrismaClient() as unknown as ClienteDeOrganizaciones);
  const { organizaciones, saltadas } = await comoPlataforma(
    "SL-17",
    "listar empresas para un job por empresa",
    () => listar(cliente, opciones.modulo),
  );
  if (saltadas.length > 0) {
    // Ids de empresa, no datos personales: para ver en el log a quién no le corrió y por qué.
    console.info(`[paraCadaEmpresa] módulo ${opciones.modulo} apagado, se saltan: ${saltadas.join(", ")}`);
  }

  const resumen: ResumenPorEmpresa = { ok: [], fallidas: [], saltadas };
  // En serie, no en paralelo: el pool por instancia es de 3 conexiones (prisma-client.ts) y un
  // job por empresa en paralelo lo agotaria con pocas empresas.
  for (const { id } of organizaciones) {
    try {
      await conEmpresa(id, () => fn(id));
      resumen.ok.push(id);
    } catch (error) {
      // Una empresa con datos raros no puede dejar sin correr el job de las demas.
      console.error(`[paraCadaEmpresa] fallo en la empresa ${id}:`, error);
      resumen.fallidas.push({ organizacionId: id, error });
    }
  }
  return resumen;
}
