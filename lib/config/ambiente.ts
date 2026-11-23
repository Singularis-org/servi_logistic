// SLT-257 — ¿esta app corre en el sandbox (el ambiente de pruebas)?
//
// El sandbox es un proyecto de Vercel aparte cuya rama de produccion es `prod`, asi que alli
// `VERCEL_ENV` vale `production` igual que en el real: no sirve para distinguirlos. Lo decide SOLO
// `AMBIENTE_PRUEBAS`, y solo con el valor exacto `true` (sin recortar espacios ni pasar a
// minusculas: R1, R2, R3). El nombre de la variable vive unicamente aqui.

/** `true` solo si `AMBIENTE_PRUEBAS` vale exactamente la cadena `true`. */
export function ambienteDePruebas(): boolean {
  return process.env.AMBIENTE_PRUEBAS === "true";
}
