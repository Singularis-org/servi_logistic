import { contextoActual, EmpresaNoResuelta } from "@/lib/db/contexto-empresa";

// SL-19 (design §3.3; R15–R18) — la carpeta de la empresa dentro de cada bucket. Los adaptadores de
// `lib/storage/` tratan toda ruta como relativa a `<organizacion_id>/` y la empresa sale siempre del
// contexto, nunca de la ruta: desde B no hay cadena que llegue a un objeto de A, porque `x` es `B/x`
// y `../A/x` no pasa la validacion.

/** R17: ruta vacia, absoluta, con `\`, o con un segmento vacio, `.` o `..`. No se llamo a Storage. */
export class RutaDeAlmacenInvalida extends Error {
  readonly motivo: string;
  constructor(motivo: string) {
    super(`Ruta de almacen invalida: ${motivo}`);
    this.name = "RutaDeAlmacenInvalida";
    this.motivo = motivo;
  }
}

// Import perezoso, como en `prisma-client.ts`: el resolutor depende de `next/headers`, y
// `lib/storage` se importa tambien desde scripts y tests fuera de Next.
async function empresaDeLaSesionPerezosa(): Promise<string | null> {
  const { empresaDeLaPeticion } = await import("@/lib/auth/empresa-de-la-peticion");
  return empresaDeLaPeticion();
}

/**
 * R18: la misma regla que `empresaEnCurso` de SL-36. En plataforma no hay carpeta que elegir, y
 * prestar la de otra empresa es justo lo que se cierra aqui: falla antes de llamar a Storage.
 */
export async function empresaDelAlmacen(
  bucket: string,
  operacion: string,
  empresaDeLaSesion: () => Promise<string | null> = empresaDeLaSesionPerezosa,
): Promise<string> {
  const contexto = contextoActual();
  if (contexto?.tipo === "empresa") return contexto.organizacionId;
  const donde = `${bucket}:${operacion}`;
  if (contexto?.tipo === "plataforma") throw new EmpresaNoResuelta("Storage", donde);
  const organizacionId = await empresaDeLaSesion();
  if (organizacionId === null) throw new EmpresaNoResuelta("Storage", donde);
  return organizacionId;
}

function validarRuta(ruta: string): void {
  if (ruta.length === 0) throw new RutaDeAlmacenInvalida("vacia");
  if (ruta.startsWith("/")) throw new RutaDeAlmacenInvalida("empieza por /");
  if (ruta.includes("\\")) throw new RutaDeAlmacenInvalida("contiene \\");
  for (const segmento of ruta.split("/")) {
    if (segmento === "") throw new RutaDeAlmacenInvalida("segmento vacio");
    if (segmento === "." || segmento === "..") throw new RutaDeAlmacenInvalida(`segmento «${segmento}»`);
  }
}

/** `<organizacionId>/<ruta>`, despues de validar la ruta (R15–R17). */
export function rutaEnCarpeta(organizacionId: string, ruta: string): string {
  // Un id de empresa con `/` partiria la carpeta en dos: se exige un solo segmento valido.
  if (organizacionId.length === 0 || organizacionId.includes("/")) {
    throw new RutaDeAlmacenInvalida("empresa sin un solo segmento");
  }
  validarRuta(organizacionId);
  validarRuta(ruta);
  return `${organizacionId}/${ruta}`;
}

/** La ruta sin la carpeta, o `null` si no esta dentro de ella. Para respuestas y listados. */
export function rutaRelativa(organizacionId: string, completa: string): string | null {
  const prefijo = `${organizacionId}/`;
  if (!completa.startsWith(prefijo)) return null;
  const relativa = completa.slice(prefijo.length);
  try {
    validarRuta(relativa);
  } catch {
    // Una respuesta de Storage con una ruta que la app no habria podido pedir no se devuelve.
    return null;
  }
  return relativa;
}
