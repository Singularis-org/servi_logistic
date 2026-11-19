# impl SLT-80 «Guía de integración por API en la ayuda»

## Tanda 1 (T1, T2, T9, T10) — backend_dev, 2026-11-18

### Archivos

- Creado `docs/ayuda/oficina/guia-integracion-api.md` (conversión mecánica del HTML de SLT-201, con
  un script jsdom de un solo uso fuera del repo). Frontmatter: `titulo`, `modulo: configuracion`,
  `roles: [maestro, admin]`, `actualizado: 2026-11-18`, `fuentes` (la lista «Qué actualizar» del
  README viejo). Sin `pantalla` (D7).
- Borrados `docs/api/guia-integracion/guia-integracion.html` y `generar-pdf.py`.
- Reescrito `docs/api/guia-integracion/README.md` (fuente única, descarga desde la app, qué
  actualizar).
- Creado `tests/unit/guards/guia-api-fuente-unica.guardia.test.ts`.
- Modificados: `tests/unit/api/openapi-466-descripciones.test.ts`,
  `tests/unit/guards/docs-marca-heredada.guardia.test.ts` (rutas al `.md`, frases del marcado
  retiradas, suelo anti-vacuidad 50→46 con motivo), `tests/components/AyudaLayout.test.tsx`,
  `tests/unit/ayuda/acotamiento-por-rol.test.ts`, `tests/unit/asistente/acotamiento-por-rol.test.ts`
  (también la carpeta de oficina 22→23), `tests/unit/asistente/contexto-documental.test.ts`.

### Decisiones de formato en la conversión

- Orden: título `#` de la guía, la portada como párrafo («Documentación técnica…», «Versión del
  documento…»), la intro y el aviso, después `# Contenido` y el resto en el orden del HTML.
- `# Contenido`: lista plana; las entradas de primer nivel en negrita (sin listas anidadas).
- Insignias → `**POST** \`/api/...\``; etiquetas RUPTURA/YA VIGENTE → `**RUPTURA**`.
- `<div class="warn">` → cita `>`. `<pre>` → bloques `json` (los que `generar-pdf.py` validaba como
  JSON), `bash` (curl) y `text` (`Authorization:`).
- Tres retoques forzados por el renderizador, sin cambiar el contenido técnico: dos celdas con `|`
  dentro de código (`{ id, nombre } | null` → «`{ id, nombre }` o `null`»; `mensajero | tienda |
  api` → «`mensajero`, `tienda` o `api`»), porque la tabla se parte por `|`; y `«*<resultado> ·
  pendiente de confirmación*»` → «`<resultado>` · *pendiente de confirmación*» (marcador angular
  dentro de código).

### Tamaño del cuerpo (dato para P1)

74.275 bytes UTF-8 · 73.012 caracteres · 925 líneas (cuerpo sin frontmatter).

### Mapa R → test (esta tanda)

| R | Test |
|---|---|
| R1300 | `guia-api-fuente-unica.guardia.test.ts` > R1300 (3 casos) |
| R1301 (lectura por `leerDocumentoAyuda`) | la guardia lee el cuerpo por `leerDocumentoAyuda` |
| R1302 | guardia > R1302 (no-vacuidad ≥10 bloques, todos parsean, MUTACION) |
| R1303, R1316 | guardia > R1303 / R1316 (ida, vuelta, control de extracción, MUTACION) |
| R1304 | guardia > R1304 |
| R1305 | guardia > R1305 — **ROJO**, ver Bloqueos |
| R1312 (sin otra copia) | guardia > R1312 |
| R1317 | `tests/unit/asistente/acotamiento-por-rol.test.ts` (38/38/10/8/7) + `contexto-documental.test.ts` (38) |

### Mutaciones (T10)

Antes: `git add -A docs tests specs` para que `git checkout --` restaure desde el índice.

(a) Path ficticio en `openApiSpec.paths` (`lib/api/openapi-spec.ts`, script
`mutar80.cjs spec` que inserta `"/api/ordenes/api-key/mutacion-slt80": { get: … }`):

```
node con-desechable.cjs <wt> servi_slt80_desechable -- pnpm exec vitest run tests/unit/guards/guia-api-fuente-unica.guardia.test.ts -t R1303
exit=1
     × cada operación de `openApiSpec.paths` sale con su método y su ruta exactos 25ms
     × MUTACION: una operación ficticia añadida a una copia de la spec pone rojo el caso de R1303 4ms
      Tests  2 failed | 3 passed | 11 skipped (16)
+   "**GET** `/api/ordenes/api-key/mutacion-slt80`",
```

Restaurado: `git checkout -- lib/api/openapi-spec.ts` (`git diff --stat` vacío).

(b) `json` roto (coma final en el primer bloque ```json de la guía, `mutar80.cjs json`):

```
node con-desechable.cjs <wt> servi_slt80_desechable -- pnpm exec vitest run tests/unit/guards/guia-api-fuente-unica.guardia.test.ts -t R1302
exit=1
     × todos parsean, sustituidos los marcadores angulares 7ms
      Tests  1 failed | 2 passed | 13 skipped (16)
+   "bloque json #1: Expected double-quoted property name in JSON at position 253 (line 8 column 2) · {
```

Restaurado: `git checkout -- docs/ayuda/oficina/guia-integracion-api.md` (`git diff --stat` vacío).

Además la guardia lleva casos MUTACION permanentes sobre datos inyectados (R1302, R1303, R1305).

### Verificación (base `servi_slt80_desechable`, solo los tests tocados)

```
pnpm exec vitest run <11 archivos: la guardia nueva, los 4 de T9, los 2 de T2,
  ayuda-render-sin-filtracion, nombres-estado-retirados, ayuda-pantalla-ruta-existe, markdown.test>
 Test Files  4 failed | 7 passed (11)
      Tests  5 failed | 157 passed (162)
```

Verdes: guardia nueva salvo R1305, los 4 de T9, `openapi-466-descripciones`, `docs-marca-heredada`,
`ayuda-render-sin-filtracion`. Rojos (los 5, ver Bloqueos):

1. `guia-api-fuente-unica` > R1305.
2. `ayuda-pantalla-ruta-existe` > «ningún documento queda huérfano» (la guía no declara `pantalla`).
3. `markdown.test.tsx` > «el frontmatter NO acaba en el cuerpo» (`actualizado:` en la prosa).
4. y 5. `nombres-estado-retirados` > árbol y contexto del asistente (`B.`, `sin gestionar`, `Asignada`).

typecheck: `pnpm run typecheck` → exit 0. lint: `pnpm run lint` → exit 0, «0 errors, 248 warnings»,
ninguno en los archivos de esta tanda.

### Bloqueos (decisión del leader / Carlos; no se improvisó)

- **R1305 literal choca con la guía de SLT-201.** Las secciones de operación no nombran 401, 403, 422
  ni 500 (que son de todas las operaciones y están en §4.3, §4.4 y §8.1). Fuera de esos cuatro
  quedan dos huecos de contenido: §5.5 no nombra `404` y §5.6 no tiene bloque de código. Opciones:
  (a) los códigos que declaran TODAS las operaciones se exigen en §8.1 «Por código», y los demás en
  la sección; más una línea en §5.5 y un ejemplo en §5.6 (cambio de contenido); (b) reformular R1305.
- **D7 contra `ayuda-pantalla-ruta-existe`.** La guardia exige `pantalla` salvo a las cuatro guías
  enlazadas desde `CATALOGO_INTEGRACIONES` (SL-36). El spec dice que la guardia vigila el `.md` «sin
  cambios», pero no es así. Propuesta: ampliar la exención con la guía de SLT-80, derivada de la
  constante de `lib/ayuda/guia-api.ts` (T6), como SL-36 la deriva del catálogo.
- **`markdown.test.tsx` exige que ningún cuerpo contenga `actualizado:`.** La guía dice «contra el
  contrato actualizado: `…Nombre`, …» (§Cambios, punto 5). T3 pide no tocar ese test. Propuesta:
  «contra el contrato actualizado (`…Nombre`, …)».
- **`nombres-estado-retirados`** (vigila `docs/ayuda/**`; el HTML no se vigilaba):
  - `## **RUPTURA** B. El estado real…` → «B.» seguido de espacio (abreviatura de bodega para la
    guardia). Propuesta: «B · El estado real…» o «Bloque B: …».
  - `El mensajero terminó el día sin gestionar el paquete.` → es `DESCRIPCION_ESTADO.novedad_interna`,
    ya exceptuado en `lib/types/order-status.ts`. La comprobación del contexto del asistente no
    admite excepciones: hay que reformular o ampliar la guardia.
  - `Asignada en el acto` (la guía, no un estado). Propuesta: «Se asigna en el acto».

### Veredicto

T2 y T9 hechos y en verde; T1 y T10 hechos pero no «Hecho»: 5 rojos que piden decisión (arriba).
