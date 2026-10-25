// SL-39 (design §5; menor 6 de la revisión) — el nombre del impuesto, en UN solo sitio.
//
// SL-21 decidirá cómo se llama el impuesto en cada país. Hasta entonces, todo rótulo nuevo compone
// la palabra desde aquí y no la escribe suelta: cambiarla es cambiar esta línea. Vive en un módulo
// SIN dependencias porque lo leen la wallet y el detalle de cierres, y el bundle del panel de cierres
// no puede arrastrar el cliente de Prisma (`pagos-captura.guardia`, R19) que trae `wallet-labels`.
// `wallet-labels` lo re-exporta: es la MISMA constante.
export const IMPUESTO_ROTULO = "IVA";
