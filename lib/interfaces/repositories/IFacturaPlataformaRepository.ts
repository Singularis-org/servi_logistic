// SLT-118 (design §3, §4) — contrato del repositorio de las facturas de la plataforma. Ningún método
// escribe la tabla: la escriben solo las funciones del dueño en la base (R22), y esto solo las llama.
// Lo vigila `tests/unit/guards/cobro-plataforma-solo-por-trigger.guardia.test.ts`.

import type { DetalleDeFactura, FacturaPlataformaDTO } from "@/lib/types/factura-plataforma";

export interface IFacturaPlataformaRepository {
  /**
   * Las empresas que recorre el cierre: todas. `factura_plataforma_cerrar` también abre la primera factura
   * de una empresa sin ninguna (R26) y deja la en curso alineada con el calendario (R2), así que no basta
   * con las que tienen una factura por cerrar. Por fecha de alta, como `paraCadaEmpresa`.
   */
  empresasACerrar(): Promise<string[]>;

  /**
   * `factura_plataforma_cerrar(organizacionId, ahora)` en su propia transacción (design §2.5): avanza la
   * factura en curso hasta `ahora` y cierra cada por cerrar con fin ≤ `ahora` − 5 minutos, salvo la espera
   * de R39. Idempotente (R11). Devuelve cuántas cerró; una en espera no es un fallo.
   */
  cerrar(organizacionId: string, ahora: Date): Promise<number>;

  /**
   * R21, R24: las facturas de la empresa de la sesión, en el orden de sus intervalos: las cerradas, con sus
   * cuotas emitidas, y las no cerradas (`factura_plataforma_en_curso`) con su total parcial, su fin (previsto o
   * fijado) y las cuotas previstas, cada una `null` si no la llevará. Corre como `servi_app`: sin empresa en el
   * contexto, la base la rechaza con 42501.
   */
  deLaEmpresa(): Promise<FacturaPlataformaDTO[]>;

  /**
   * R23, R24: lo mismo que `deLaEmpresa`, para el superadmin, de la empresa `organizacionId`. La fija con
   * `conEmpresa`: corre como `servi_app` con esa empresa en el contexto, así que solo salen las suyas.
   * Necesita el cliente con la extensión de empresa (`getPrismaClient()`).
   */
  deEmpresaParaPlataforma(organizacionId: string): Promise<FacturaPlataformaDTO[]>;

  /**
   * SLT-119 (design §2; R7, R8, R10, R11, R14): la factura `facturaId` de la empresa del contexto y la página
   * `pagina` (desde 1) de sus líneas: las filas de `cobro_plataforma_traza` con `cobrado_at` en `[desde, hasta)`,
   * por `(cobrado_at, id)`, de `LINEAS_POR_PAGINA` en `LINEAS_POR_PAGINA`, con el total de líneas de la factura
   * entera. La cabecera sale de `deLaEmpresa()`, la misma lectura que la lista. `null` si la factura no es de
   * esa empresa o no existe. Una página posterior a la última trae `lineas: []`. No escribe nada (R16).
   */
  detalleDeLaEmpresa(facturaId: string, pagina: number): Promise<DetalleDeFactura | null>;

  /**
   * SLT-119 (R12, R14): lo mismo para el superadmin, de la empresa `organizacionId`, fijada con `conEmpresa`
   * como `deEmpresaParaPlataforma`. `null` si la factura no es de esa empresa.
   */
  detalleParaPlataforma(organizacionId: string, facturaId: string, pagina: number): Promise<DetalleDeFactura | null>;
}
