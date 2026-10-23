// Feature 128 (T6.3, R14) — HANDLER del job puntual `analitica_invalidacion_cache`.
//
// Es el otro extremo del enganche del backfill: `revalidateTag` LANZA fuera de un request de
// Next (`revalidate.js:104-107`) y el backfill de la 125 es un proceso `tsx`, asi que el
// script ENCOLA y este handler —que corre dentro del request del cron, cada minuto— invalida.
//
// ⚠ ESTE TIPO **NO SE REGISTRA EN `buildRecurrencias`**. Es PUNTUAL, disparado por un evento
// (una corrida de backfill que escribio), como `geocodificacion` o `webhook_estado`.
// Registrarlo en las recurrencias lo re-agendaria para siempre y vaciaria la cache operativa
// cada minuto, que es exactamente lo contrario de lo que esta feature compra.
//
// El handler NO mira el payload para decidir QUE invalidar: la granularidad es POR DOMINIO
// (D3), un unico tag. El payload (`{ desde, hasta }`) existe solo para el registro de R23.
//
// SL-17 (R42, design §7.6): la etiqueta es POR EMPRESA y la empresa es la del job, que el
// drenador pone en contexto con `conEmpresa(job.organizacionId)`. Un job sin empresa corre en
// plataforma: no hay etiqueta de empresa que invalidar, y vaciar la de todas convertiria un
// backfill de una empresa en recomputo para todas. Se dice en el log y no se lanza: reintentar
// no le daria una empresa.
//
// Sin `try/catch`, por el mismo motivo que el del rollup diario: si la invalidacion falla, el
// job tiene que fallar para que `JobQueueService` lo reintente con backoff. Una invalidacion
// que se traga su error deja la cifra recomputada invisible hasta que expire el TTL, y sin
// senal de que eso ocurrio.

import { TAGS_OPERATIVA } from "@/lib/analytics/cache-tags";
import { contextoActual } from "@/lib/db/contexto-empresa";
import type { IAnaliticaCache } from "@/lib/interfaces/external/IAnaliticaCache";
import type { JobHandler } from "@/lib/interfaces/services/IJobQueueService";

export type AvisoInvalidacionSinEmpresa = (mensaje: string) => void;

const avisoPorDefecto: AvisoInvalidacionSinEmpresa = (m) => console.warn(m);

export function crearAnaliticaInvalidacionCacheHandler(
  cache: IAnaliticaCache,
  avisar: AvisoInvalidacionSinEmpresa = avisoPorDefecto,
): JobHandler {
  return async () => {
    if (contextoActual()?.tipo !== "empresa") {
      avisar(
        "[analitica_invalidacion_cache] job sin empresa: no se invalida ninguna cache de empresa",
      );
      return;
    }
    await cache.invalidar("backfill", TAGS_OPERATIVA);
  };
}
