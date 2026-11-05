import { notFound } from "next/navigation";

import { AppPage } from "@/components/shared/AppPage";
import { listarVehiculosPlataformaAction } from "@/lib/actions/vehiculos-plataforma";
import { esPlataforma } from "@/lib/auth/plataforma";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import type { VehiculoDTO } from "@/lib/types/vehiculos";

import { VehiculosPlataformaModule } from "./_components/VehiculosPlataformaModule";
import { TEXTOS_VEHICULOS } from "./_components/vehiculos-plataforma-textos";

/**
 * SL-42 (design §5; R1, R2) — el catálogo de vehículos del superadmin (Server Component).
 *
 * R1: cualquier rol de empresa (el `maestro` incluido) recibe `notFound()` ANTES de leer nada, igual
 * que «Empresas» y «Geografía».
 *
 * R2: lista activos e inactivos (el módulo los ordena por nombre). Un fallo de lectura baja como bandera y lo pinta el
 * módulo (decisión 13 de SL-20): pintado aquí, el módulo recibiría `[]` y diría además «aún no hay».
 */
export default async function VehiculosPlataformaPage() {
  const actor = await resolveActorFromSession();

  if (!actor || !esPlataforma(actor.rol)) notFound();

  const res = await listarVehiculosPlataformaAction();
  const vehiculos: VehiculoDTO[] = res.status === "ok" ? res.items : [];

  return (
    <AppPage title={TEXTOS_VEHICULOS.titulo}>
      <VehiculosPlataformaModule initialVehiculos={vehiculos} cargaError={res.status !== "ok"} />
    </AppPage>
  );
}

