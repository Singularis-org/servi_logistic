// SLT-208 — la URL base de producción del canal por API key, la única que se publica.
//
// La comparten el contrato OpenAPI (`servers`, lo que Swagger UI propone y lo que toma un generador de
// clientes), la guía de integración y la colección de Postman, que la escriben literal porque son
// documentos. La guardia `tests/unit/guards/api-artefactos-url-y-simbolos.guardia.test.ts` comprueba
// que los tres dicen esta misma URL y ninguna otra.
export const URL_PRODUCCION_API = "https://www.servilogistic.co";
