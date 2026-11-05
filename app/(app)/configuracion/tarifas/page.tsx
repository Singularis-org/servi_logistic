import { AppPage } from "@/components/shared/AppPage";
import { cargarPantallaTarifas, cargarZonaTarifas } from "@/lib/actions/tarifas";

import { TEXTOS } from "./_components/tarifas-textos";
import { TarifasEncabezado } from "./_components/TarifasEstado";
import { TarifasErrorCarga, TarifasModule, type PantallaOk } from "./_components/TarifasModule";

/**
 * Los nombres de los grupos de otras zonas que tienen precio de tienda: `cargarPantallaTarifas` no los trae y
 * la lista de tiendas los enseña. Solo esas zonas, en serie; suelen ser pocas.
 */
async function nombresDeGrupo(pantalla: PantallaOk): Promise<Record<string, string>> {
  const zonas = new Set(
    pantalla.preciosTienda.flatMap((v) => (v.grupoId !== null && v.zonaId !== null ? [v.zonaId] : [])),
  );
  const nombres: Record<string, string> = {};
  for (const zonaId of zonas) {
    const r = await cargarZonaTarifas({ zonaId });
    if (r.status === "ok") for (const g of r.grupos) nombres[g.id] = g.nombre;
  }
  return nombres;
}

/**
 * SLT-54 (R25, R55, R57): `/configuracion/tarifas`. El servidor decide que se pinta: otro rol o sin sesion ve
 * solo el aviso, y `puedeEscribir` viaja a la pantalla sin que ella compare roles. Autorizan tambien cada
 * action y cada service (R5).
 */
export default async function TarifasPage({
  searchParams,
}: Readonly<{ searchParams?: Promise<{ zona?: string | string[] }> }>) {
  const pantalla = await cargarPantallaTarifas();

  if (pantalla.status === "error") {
    return (
      <AppPage title={TEXTOS.titulo}>
        <TarifasErrorCarga />
      </AppPage>
    );
  }
  if (pantalla.status !== "ok") {
    return (
      <AppPage title={TEXTOS.titulo}>
        <p role="alert" className="text-sm text-muted-foreground">
          {TEXTOS.sinPermiso}
        </p>
      </AppPage>
    );
  }

  const pedida = (await searchParams)?.zona;
  const zona = pantalla.zonas.find((z) => z.id === pedida) ?? pantalla.zonas[0] ?? null;
  const zonaInicial = zona === null ? null : await cargarZonaTarifas({ zonaId: zona.id });

  return (
    <AppPage
      title={TEXTOS.titulo}
      actions={<TarifasEncabezado activadaAt={pantalla.activacion?.activadaAt ?? null} />}
    >
      <TarifasModule
        pantalla={pantalla}
        zonaInicialId={zona?.id ?? null}
        zonaInicial={zonaInicial}
        nombresDeGrupo={await nombresDeGrupo(pantalla)}
      />
    </AppPage>
  );
}
