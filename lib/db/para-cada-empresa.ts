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
    }): Promise<{ id: string }[]>;
  };
};

export type ResumenPorEmpresa = {
  ok: string[];
  fallidas: { organizacionId: string; error: unknown }[];
};

export async function paraCadaEmpresa(
  fn: (organizacionId: string) => Promise<void>,
  opciones: { cliente?: ClienteDeOrganizaciones } = {},
): Promise<ResumenPorEmpresa> {
  // El tipo ancho de `getPrismaClient()` no conoce el modelo hasta regenerar el cliente con el
  // esquema de SL-17; la forma se fija en `ClienteDeOrganizaciones`.
  const cliente = opciones.cliente ?? (getPrismaClient() as unknown as ClienteDeOrganizaciones);
  const organizaciones = await comoPlataforma("SL-17", "listar empresas para un job por empresa", () =>
    cliente.organizacion.findMany({ select: { id: true }, orderBy: { createdAt: "asc" } }),
  );

  const resumen: ResumenPorEmpresa = { ok: [], fallidas: [] };
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
