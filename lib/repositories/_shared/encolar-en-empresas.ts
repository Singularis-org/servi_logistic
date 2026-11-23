import type { Prisma } from "@prisma/client";

/**
 * Outbox por empresa (SL-24 §16.4; movido aquí por SLT-136 §7.1 para compartirlo con
 * `FacturaPlataformaRepository.cerrar`). El `organizacion_id` de un trabajo sale del DEFAULT de `jobs`
 * (`app.organizacion_id`, SL-17 M4), así que cada encolado corre con SU empresa fijada y al final se deja
 * el valor de antes: el resto de la transacción de plataforma no la ve.
 *
 * Sin `finally` a propósito: si un encolado falla, la transacción ya está abortada y otra sentencia
 * taparía el error de verdad; el `set_config` es local a la transacción y se va con ella.
 */
export async function encolarEnEmpresas(
  tx: Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">,
  trabajos: readonly { organizacionId: string; encolar: () => Promise<unknown> }[],
): Promise<void> {
  const [{ previa }] = await tx.$queryRaw<{ previa: string | null }[]>`
    SELECT current_setting('app.organizacion_id', true) AS "previa"`;
  for (const t of trabajos) {
    await tx.$executeRaw`SELECT set_config('app.organizacion_id', ${t.organizacionId}, true)`;
    await t.encolar();
  }
  await tx.$executeRaw`SELECT set_config('app.organizacion_id', ${previa ?? ""}, true)`;
}
