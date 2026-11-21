import { notFound } from "next/navigation";

import { resolveActorFromSession } from "@/lib/auth/resolve-actor";

import { EscanerRecepcion } from "../_components/EscanerRecepcion";

/** R613: solo se vuelve a una de las dos pantallas de la satélite; cualquier otro valor, a la primera. */
const DESTINOS = new Set(["por-recibir", "en-bodega"]);

/** `volverA` desde `?desde=`, con lista blanca (nunca una URL de fuera). */
function volverASatelite(desde: string | string[] | undefined): string {
  const valor = typeof desde === "string" && DESTINOS.has(desde) ? desde : "por-recibir";
  return `/recepcion-satelite/${valor}`;
}

/**
 * SLT-159 «Escaneo continuo en recepciones y recogidas» (DC5, R612-R613) — la página «Recibir
 * paquetes» de la bodega satélite. Solo adminSatelite; cualquier otro rol, o sin sesión, cae en
 * `notFound()` ANTES de nada. No lee datos: sin zona, cada lectura dice el motivo de `sin_zona`.
 */
export default async function RecibirPaquetesSatelitePage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string | string[] }>;
}) {
  const actor = await resolveActorFromSession();
  if (!actor || actor.rol !== "adminSatelite") notFound();
  const { desde } = await searchParams;
  return <EscanerRecepcion modo="pagina" volverA={volverASatelite(desde)} />;
}
