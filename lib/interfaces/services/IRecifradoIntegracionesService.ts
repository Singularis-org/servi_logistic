// SL-36 (design §12; D10, R39, R40) — `pnpm integraciones:recifrar [--solo-contar]`.

export interface OpcionesRecifrado {
  /** R40: el mismo conteo, sin escribir nada. */
  soloContar: boolean;
}

/**
 * Lo unico que sale del recifrado: conteos. Ni valores, ni ids de integracion, ni empresas.
 *
 * `porVersion` cuenta los valores LEGIBLES por la version en que quedan guardados: tras recifrar,
 * todos en la activa; con `soloContar`, como estan hoy. Una version vieja se retira del anillo
 * cuando su conteo es 0. Los ilegibles van aparte y no se tocan nunca.
 */
export interface ResumenRecifrado {
  soloContar: boolean;
  versionActiva: string;
  porVersion: Record<string, number>;
  ilegibles: number;
  /** Valores reescritos en la version activa (0 con `soloContar`). */
  recifrados: number;
  /** Filas que el maestro cambio mientras corria: se quedan con su valor nuevo. */
  conflictos: number;
  /** Empresas en las que fallo la base: el comando sale con 1. */
  empresasConError: number;
}

export interface IRecifradoIntegracionesService {
  ejecutar(opciones: OpcionesRecifrado): Promise<ResumenRecifrado>;
}
