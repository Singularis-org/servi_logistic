import { z } from "zod";

// SL-38 (design §3) — la entrada de la marca de zona especial que guarda el `maestro` desde Tarifas.
//
// Es un DELTA, no el estado completo: lo que cambio en el formulario. Asi dos zonas abiertas a la vez
// no se pisan la marca de los distritos que ninguna toco. La empresa NO viaja en la entrada: sale de
// la sesion (SL-17 §5), y una empresa en el payload seria una puerta para escribir en otra.

export const distritosEspecialesSchema = z.object({
  /** Distritos que la empresa pasa a marcar como zona especial. */
  marcar: z.array(z.string().min(1)).default([]),
  /** Distritos cuya marca de la empresa se borra. */
  desmarcar: z.array(z.string().min(1)).default([]),
});

export type CambiosZonaEspecial = z.infer<typeof distritosEspecialesSchema>;
