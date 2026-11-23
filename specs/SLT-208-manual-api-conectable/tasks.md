# Tasks — SLT-208 «Manual, Postman y Swagger de la API: revisión completa para que un integrador se conecte»

- [x] T1 · URL de producción en la guía, Postman (`baseUrl`) y OpenAPI (`servers` con `/` y producción). R1
- [x] T2 · Revisión de cada operación contra `app/api/ordenes/api-key/**` y los servicios; corregir la documentación. R2, R3
- [x] T3 · Ejemplos `curl` nuevos (primera petición, cotización, detalle, habilitación) y ejemplo verificable de firma. R2, R4
- [x] T4 · Colección de Postman: tests corregidos, remisiones con `{{$timestamp}}`, sin parámetros vacíos, cancelación omitida sin guía. R4, R5
- [x] T5 · E2E `e2e/guia-api-ejemplos-ejecutables.spec.ts`: curl, Postman (con y sin fulfillment), clave de fila ausente, dos empresas, 401, firma, `servers`. R2-R5, R12
- [x] T6 · Sin símbolos vetados ni país o moneda en los cuatro archivos (también comentarios del `.yaml`). R6, R7
- [x] T7 · Guía sin remisiones a archivos del repositorio; el contrato por su URL servida. R8
- [x] T8 · Guardia `tests/unit/guards/api-artefactos-url-y-simbolos.guardia.test.ts` con sus mutaciones. R9
- [x] T9 · PDF regenerado y test de su URL. R10
- [x] T10 · Entrada en `docs/api/CHANGELOG.md` y sección 9 de la guía. R11
- [x] T11 · Sección 3.7 (varias empresas, una URL). R12
