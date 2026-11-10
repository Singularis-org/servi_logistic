"use client";

import { Cuenta } from "./Cuenta";
import { cuentaConciliacion, marcaConciliacion, type DetalleBodegaVista } from "./detalle-cierre-vista";

// SLT-104 «Detalle de cierre de bodega en el detalle único (central)» (T3.1; R43, R117) — la pestaña
// «Conciliación» del detalle de bodega, como el canvas: una cuenta en formato cascada de ancho
// limitado (520 px) con «Debe llegar a la central», «− Recibido» («—» sin marca), «Falta por recibir»
// en negrita y, bajo raya punteada, quién marcó y cuándo. Es la `Cuenta` del detalle, sin piezas
// propias; las líneas las arma `cuentaConciliacion` y no se opera con ningún importe (R71).

export interface ConciliacionCierreBodegaProps {
  detalle: DetalleBodegaVista;
}

export function ConciliacionCierreBodega({ detalle }: Readonly<ConciliacionCierreBodegaProps>) {
  const cuenta = cuentaConciliacion(detalle);
  return (
    <Cuenta
      titulo={cuenta.titulo}
      lineas={cuenta.lineas}
      notas={[marcaConciliacion(detalle)]}
      className="max-w-[520px]"
    />
  );
}
