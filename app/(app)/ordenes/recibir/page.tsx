import { RolValue } from "@prisma/client";
import { notFound } from "next/navigation";

import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import { esAccesoTotal } from "@/lib/auth/acceso-total";

import { EscanerRecepcionBodegaCentral } from "../_components/EscanerRecepcionBodegaCentral";
import { EscanerRecepcionOrigen } from "../_components/EscanerRecepcionOrigen";

/**
 * SLT-159 «Escaneo continuo en recepciones y recogidas» (DC5, R612) — la página «Recibir
 * paquetes» de `/ordenes`: maestro y admin reciben en bodega central; adminTienda, en su tienda.
 * Cualquier otro rol, o sin sesión, cae en `notFound()` ANTES de nada (forma de
 * `recepcion-satelite/por-recibir/page.tsx`). No lee datos: cada lectura va a la Server Action de
 * la superficie, que revalida en servidor.
 */
export default async function RecibirPaquetesOrdenesPage() {
  const actor = await resolveActorFromSession();
  if (!actor) notFound();
  if (esAccesoTotal(actor.rol)) {
    return <EscanerRecepcionBodegaCentral modo="pagina" volverA="/ordenes" />;
  }
  if (actor.rol === RolValue.adminTienda) {
    return <EscanerRecepcionOrigen modo="pagina" volverA="/ordenes" />;
  }
  notFound();
}
