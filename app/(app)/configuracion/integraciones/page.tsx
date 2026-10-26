import { AppPage } from "@/components/shared/AppPage";
import { listarIntegraciones } from "@/lib/actions/integraciones";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";

import { IntegracionesModule } from "./_components/IntegracionesModule";

const TEXTOS = {
  titulo: "Integraciones",
  descripcion: "Las cuentas de los servicios externos que usa tu empresa",
  sinPermiso: "No tienes permiso para acceder a esta sección.",
  referencia: "Referencia",
} as const;

/**
 * SL-36 (R6, R34) — `Configuración › Integraciones` (Server Component). Solo el `maestro`, como el
 * resto de `/configuracion` (patrón de `/configuracion/api`): el rol se niega ANTES de leer nada, y
 * el service lo vuelve a negar (R6), así que el superadmin, el admin y el mensajero no ven nada de
 * la integración de una empresa.
 *
 * Al módulo cliente solo viajan las vistas, que nunca traen secretos ni el token del webhook (R5,
 * R18): el token vive en el estado del cliente y al recargar ya no está en este HTML.
 */
export default async function IntegracionesPage() {
  const actor = await resolveActorFromSession();

  if (actor?.rol !== "maestro") {
    return (
      <AppPage title={TEXTOS.titulo}>
        <p role="alert" className="text-sm text-muted-foreground">
          {TEXTOS.sinPermiso}
        </p>
      </AppPage>
    );
  }

  const res = await listarIntegraciones();

  if (res.status === "forbidden") {
    return (
      <AppPage title={TEXTOS.titulo}>
        <p role="alert" className="text-sm text-muted-foreground">
          {TEXTOS.sinPermiso}
        </p>
      </AppPage>
    );
  }

  return (
    <AppPage title={TEXTOS.titulo} description={TEXTOS.descripcion}>
      {res.status === "ok" ? (
        <IntegracionesModule servicios={res.servicios} />
      ) : (
        <p role="alert" className="text-sm text-destructive">
          {res.texto} {TEXTOS.referencia}: {res.referencia}
        </p>
      )}
    </AppPage>
  );
}
