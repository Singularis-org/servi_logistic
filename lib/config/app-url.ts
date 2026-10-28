// SL-41 (design §8) — la URL base pública de la app, en un solo sitio.
//
// La necesitan el enlace del aviso interno de WhatsApp (ficha 474) y los correos (el logo de la
// cabecera y el enlace de bienvenida). Antes la lógica vivía solo en `baseUrlEnlace()`; con dos
// consumidores, una copia por consumidor acabaría divergiendo en el orden de las variables o en
// la barra final.
//
// Se lee en cada llamada, no al importar, para que los tests puedan fijar las variables.

/**
 * `NEXT_PUBLIC_APP_URL` y, si falta o está vacía, `NEXT_PUBLIC_SITE_URL`, sin barra final.
 * `null` si no hay ninguna: quien llama decide qué hacer sin URL (el OTP cae a la cabecera de
 * texto, R4; la bienvenida no sale, R40) en vez de construir un enlace roto.
 */
export function baseUrlDeLaApp(): string | null {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim() || "";
  if (raw === "") return null;
  return raw.replace(/\/+$/, "");
}
