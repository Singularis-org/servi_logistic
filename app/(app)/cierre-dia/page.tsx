import { notFound } from "next/navigation";

import { AppPage } from "@/components/shared/AppPage";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import {
  listarCierreDia,
  listarCierresPasadosPaginado,
  estadoBloqueoMensajero,
  verCierrePasado,
} from "@/lib/actions/cierre-dia";
import { SIN_BLOQUEO, type CierreAResolver } from "@/lib/utils/bloqueo-cierre";
import type { CierreReenviable } from "@/components/private/cierres/detalle/detalle-cierre-vista";

import { CierreDiaModule } from "./_components/CierreDiaModule";

/**
 * Feature 37 (T14, R1): módulo "Cierre del día" del rol `mensajero`. El rol se
 * resuelve SOLO server-side vía `resolveActorFromSession` (patrón feature 36):
 * cualquier rol distinto de `mensajero` (o sin sesión) NO ve el módulo
 * (`notFound`, defensa real). Pre-fetch del detalle+totales por la Server Action
 * y paso de los datos a los componentes cliente por props (datos sensibles: el
 * padre valida permisos).
 */
export default async function CierreDiaPage() {
  const actor = await resolveActorFromSession();
  if (!actor || actor.rol !== "mensajero") notFound(); // R1

  // Feature 170 — FASE 2 (T I.2, R40): el listado compuesto sigue trayendo las gestiones del
  // día, los totales y los gates; «Cierres solicitados» llega como PÁGINA 1 y su total (R41).
  const [result, pasadosResult] = await Promise.all([
    listarCierreDia(),
    listarCierresPasadosPaginado({}),
  ]);
  if (result.status !== "ok") notFound(); // forbidden/unauthenticated → sin módulo
  if (pasadosResult.status !== "ok") notFound(); // defensa en profundidad

  // Feature 41 (R21) -> FEATURE 271 (T9.3): el DETALLE del bloqueo, derivado server-side por la
  // regla N/V. SUSTITUYE a tres props del módulo: el flag `bloqueado` y los dos `tieneVencido` /
  // `tieneRechazado` que salían de `listarCierreDia` — la misma pregunta por dos caminos, que es
  // como se desincronizan. Ahora la pantalla lo deriva todo de este objeto.
  //
  // Si la acción degrada (sin sesión), baja `SIN_BLOQUEO`: no se pinta aviso ni CTA, y la
  // escritura la sigue gateando el servidor (defensa suave arriba, defensa real abajo).
  const estado = await estadoBloqueoMensajero();
  const bloqueo = estado.status === "ok" ? estado.bloqueo : SIN_BLOQUEO;

  // SLT-109 «/cierre-dia: el cierre de hoy, rechazado o vencido como página» (R240, R253): con un
  // cierre por reenviar, la página pinta ESE, leído aquí y no en el cliente —llega pintada y
  // `router.refresh()` lo relee por el mismo camino—. Solo en el caso raro.
  const reenviable = bloqueo.aReenviarPrimero ? await leerReenviable(bloqueo.aReenviarPrimero) : undefined;

  return (
    <AppPage
      title="Cierre del día"
      description="Detalle de lo gestionado, totales por método de pago y solicitud de cierre"
    >
      <CierreDiaModule
        grupos={result.grupos}
        totales={result.totales}
        totalPagoMensajero={result.totalPagoMensajero}
        puedesSolicitar={result.puedesSolicitar}
        motivoBloqueo={result.motivoBloqueo}
        cierresPasados={{
          items: pasadosResult.items,
          total: pasadosResult.total,
          pageSize: pasadosResult.pageSize,
        }}
        bloqueo={bloqueo}
        // FICHA 477 (R25/R26): lo que hace falta para corregir cada cierre rechazado propio.
        correcciones={result.correcciones ?? []}
        reenviable={reenviable}
      />
    </AppPage>
  );
}

/**
 * R253: `no_encontrada`, `forbidden` o una excepción son `error`, sin `notFound()`: el mensajero tiene
 * que poder enviar ese cierre aunque no se haya podido leer.
 */
async function leerReenviable(c: CierreAResolver): Promise<CierreReenviable> {
  const reenviableEstado = c.estado === "rechazado" ? "rechazado" : "vencido";
  try {
    const r = await verCierrePasado({ cierreId: c.cierreId });
    if (r.status !== "ok") return { estado: "error", reenviableEstado };
    return {
      estado: "ok",
      cierre: r.cierre,
      grupos: r.grupos,
      ordenesSinGestion: r.ordenesSinGestion,
      sinGestionRegistrado: r.sinGestionRegistrado,
      rechazosDeTienda: r.rechazosDeTienda,
    };
  } catch {
    return { estado: "error", reenviableEstado };
  }
}
