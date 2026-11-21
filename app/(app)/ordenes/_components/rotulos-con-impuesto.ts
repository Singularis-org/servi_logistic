/**
 * SLT-240 (design §5; R16) — los rótulos del flete y la comisión con impuesto de órdenes.
 *
 * Es la única fuente de los dos textos para el listado (`ordenes-columns.tsx`), su descarga
 * (`ordenes-descarga-columnas.ts`) y el aviso de cambio de ubicación (`CorregirUbicacionAviso.tsx`):
 * así no pueden divergir, y ninguno de los tres escribe el nombre del impuesto. El nombre lo da
 * `useImpuestoDelPais()` en pantalla, o `IMPUESTO_ROTULO` como caída.
 *
 * Módulo puro: sin React.
 */
export const rotuloFleteConImpuesto = (impuesto: string): string => `Flete + ${impuesto}`;

export const rotuloComisionConImpuesto = (impuesto: string): string => `Comisión + ${impuesto}`;
