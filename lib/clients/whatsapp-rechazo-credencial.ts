// SL-36 (design §5, R30) — Meta rechaza el token de la empresa durante un USO real.
//
// La señal es la de design §5: HTTP 401, o `error.code` 190 de Graph (token caducado, revocado o
// de otra app), que Graph suele mandar con 400. Se vigila en el `fetch` y no en cada cliente: los
// seis clientes de Meta (envio, subida, descarga, plantillas, subida reanudable y app id) llaman por
// `fetchImpl`, asi que un solo envoltorio cubre los seis y un cliente nuevo no se lo puede olvidar
// mientras se construya con el `fetchImpl` de la empresa.
//
// El envoltorio NO cambia la respuesta: el cliente la sigue leyendo y clasificando como siempre
// (permanente, transitorio...). Solo deja la marca en la integracion para que la pantalla diga
// «vuelve a escribir la credencial».

/** Codigo de Graph para un token de acceso invalido (OAuthException). */
const CODIGO_TOKEN_INVALIDO = 190;

interface Registro {
  warn(mensaje: string): void;
}

/** `error.code` de un cuerpo de error de Graph, sin lanzar. */
function codigoGraph(texto: string): number | undefined {
  try {
    const json: unknown = JSON.parse(texto);
    const code = (json as { error?: { code?: unknown } })?.error?.code;
    return typeof code === "number" ? code : undefined;
  } catch {
    return undefined;
  }
}

/** ¿Esta respuesta de Meta es un rechazo de la credencial? Solo mira respuestas de error. */
export async function esRechazoDeCredencialMeta(respuesta: Response): Promise<boolean> {
  if (respuesta.status === 401) return true;
  if (respuesta.status < 400) return false;
  // `clone` para no consumir el cuerpo que el cliente va a leer despues.
  const texto = await respuesta
    .clone()
    .text()
    .catch(() => "");
  return codigoGraph(texto) === CODIGO_TOKEN_INVALIDO;
}

/**
 * `fetch` que llama a `alRechazar` cuando Meta rechaza la credencial. Un fallo al marcar se avisa
 * por su nombre y no cambia la respuesta: la marca es para la pantalla, el envio sigue su curso.
 */
export function fetchQueVigilaRechazo(
  base: typeof fetch,
  alRechazar: () => Promise<void>,
  log: Registro = console,
): typeof fetch {
  return async (input, init) => {
    const respuesta = await base(input, init);
    if (await esRechazoDeCredencialMeta(respuesta)) {
      try {
        await alRechazar();
      } catch (error) {
        log.warn(`[whatsapp] rechazo de credencial no anotado: ${error instanceof Error ? error.name : "error"}`);
      }
    }
    return respuesta;
  };
}
