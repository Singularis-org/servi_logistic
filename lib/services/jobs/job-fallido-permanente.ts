// SLT-59 (design §4; R29, R34) — un fallo que NINGUN reintento puede arreglar (p. ej. el proveedor
// rechaza la credencial con 401/403). Reintentarlo solo gasta llamadas pagadas: el drenador lo
// manda a dead-letter en ESTE intento, sin backoff. Es opt-in por handler: solo lo lanza el de
// `optimizacion_ruta`, asi que el resto de tipos de job conserva su manejo de fallos.

export class JobFallidoPermanente extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "JobFallidoPermanente";
  }
}
