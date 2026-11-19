# Review SLT-208 «Manual, Postman y Swagger de la API: revisión completa para que un integrador se conecte»

Vuelta 1, review completa (lo pidió el leader: es un contrato externo). Rama
`feature/SLT-208-manual-api-conectable`, HEAD 8a178b6c, diff `origin/dev...HEAD`. El MCP del grafo no
tiene indexado este worktree, así que la revisión se hizo con Grep y Read.

## Checklist

| # | Punto | Estado |
|---|---|---|
| Ruta | Suelo de `docs/specs.md > Tres rutas` | **NO**: ruta directa con `complexity: medium` y sobre el contrato externo (H1) |
| 1 | Las 20 correcciones coinciden con el código (archivo:línea abiertos) | Sí en las 20; queda un hueco nuevo (H2) |
| 1b | Ningún cambio en `app/`; en `lib/` solo la spec | Sí: `lib/api/openapi-spec.ts` y la constante nueva `lib/api/url-produccion.ts`, que solo usan la spec y la guardia |
| 2 | URL `https://www.servilogistic.co` en los tres artefactos, sin example.com ni localhost, `servers` en OpenAPI | Sí (guía, Postman `baseUrl`, `servers` en el `.ts` y en el `.yaml`; E2E caso 6 contra el build) |
| 3 | El E2E ejecuta los curl y las peticiones de Postman leídos del `.md` y del `.json` | Sí (lo comprobé con dos mutaciones, abajo) |
| 3b | Dos empresas y firma del webhook | Sí |
| 4 | Ningún símbolo vetado en la guía, Postman ni OpenAPI servido | Sí. Quedan `§` y `⚠` solo en comentarios del `.yaml` y del `.ts` (menor, H8) |
| 5 | La sección 3.7 cuadra con `ApiKeyAuthService` y `conEmpresaDeLaKey` | Sí |
| 6 | La guía, leída por un integrador que no conoce el sistema | Se conecta, con huecos (H2, H4 a H7) |
| 7 | Tamaño | 11/40 archivos, 863/1000 líneas de producción, 849/3000 de tests. En el aviso del 80 %, justificado |
| Reglas del perfil | Literal de país o moneda en código nuevo | **NO**: «colones» nuevo en `lib/api/openapi-spec.ts` (H3) |
| Calidad | typecheck, lint | `pnpm run typecheck` EXIT 0; eslint sobre los 5 archivos de código tocados EXIT 0 |
| Gate | `./init.sh` | Rojo solo por el cupo frontend del board (SLT-202, SLT-206, SLT-209), no por esta rama. No lo repetí; corrí las mismas piezas a mano |
| Dependencias | Ninguna nueva | Sí |
| Seguridad | Sin secretos en el diff | Sí: la clave del E2E se genera en cada corrida; el secreto de webhook de la guía es inventado (`svl_whsec_EJEMPLO_no_es_un_secreto_real`) |

## Lo que corrí (base `servi_slt208_desechable`, árbol restaurado con `git checkout --` tras cada mutación)

```
E2E sin mutación (build existente, 3208/54308, --project aislamiento --no-deps): 6 passed, E2E_EXIT=0
M1 guía l.399, curl de carga: "destinatario" -> "destinatari"
   -> 1 failed «línea 393: POST /api/ordenes/api-key/carga: la respuesta no tiene la forma documentada»
M2 guía l.403, fila REM-0002 sin la clave "telefono" (ausente en vez de vacía)
   -> 1 failed: esperado ["telefono es obligatorio"], llega ["Este campo es obligatorio"]   (ver H2)
Guardia: la guía con «§5.7» y Postman con «→»
   -> 2 failed (regla 2 en los dos artefactos); sin mutación 20 passed
vitest (guardia nueva, docs-marca-heredada, tests/unit/api, openapi-canal-rutas-reales): 40 archivos, 538 passed
pnpm run typecheck: 0 · eslint (archivos tocados): 0 · node scripts/tamano-pr.mjs: aviso del 80 %, sin pasarse
```

El E2E no copia nada a mano. `ejemplosDeLaGuia` parsea cada bloque `bash` que empieza por `curl` y
toma como respuesta el `json` que viene debajo, sin cruzar un título. `parsearCurl` lo tokeniza:
cualquier opción desconocida lanza error. La forma se compara en los dos sentidos: una clave
documentada que no llega y una clave que llega sin estar documentada dan rojo. El mensaje de error de
fila se compara literal. Los dos contadores de control (10 curl, 10 peticiones) impiden que un
ejemplo deje de verse sin que el test lo note. Las peticiones de Postman se arman desde el JSON
(variables, query activa, cuerpo, `auth` de la colección) y corren sus propios scripts `pm.test`. Un
`pm`/chai mínimo lanza ante cualquier aserción que no conoce.

Límites del comparador (no son defectos, pero hay que saberlos): un `null` en cualquiera de los dos
lados no se compara, y de los arrays solo se compara el primer elemento.

## Hallazgos

### H1 · BLOQUEANTE · La ruta está por debajo del suelo
`progress/features/SLT-208.md` y `feature_list.json` dicen ruta `directa` con `complexity: medium`.
`docs/specs.md > Tres rutas` dice: «La ruta directa solo vale con `complexity: low`, sin
comportamiento nuevo y sin tocar un flujo crítico». Además, el diff cambia lo que sirve
`/api/docs/openapi` (vuelve el bloque `servers`, y con él cambia a dónde apunta «Try it out» de
Swagger en cualquier entorno). También reescribe el contrato publicado de la integración externa
(autenticación, webhooks y firma). Según `CHECKPOINTS.md > Ruta`, ese caso exige la ruta completa. El
gate no lo detecta, porque `validate-features` solo mira `rutas.completa_si_toca`.
**Qué falta:** que el humano suba la ficha de ruta (label `ruta:completa`, o como mínimo
`ruta:ligera`, si el humano acepta por escrito que el diff no toca el código de autenticación ni de
webhooks) y que exista el spec de esa ruta. Sale barato: el «Mapa ficha -> test» de
`progress/impl_SLT-208.md` ya tiene los 8 puntos con su test; basta con pasarlos a `R1..R8` en EARS. La
otra salida es una decisión humana explícita, anotada en `## Decisiones`, que acepte la directa con
`medium`. El reviewer no puede darla por buena.

### H2 · BLOQUEANTE · La carga documenta un mensaje de error que el código no da cuando falta la clave
Guía, sección 5.1, tabla nueva: «Error de fila **si falta o viene vacío**: `telefono es obligatorio`»,
y lo mismo para `num_remision`, `destinatario` y `producto`. La descripción de `CargaRow` en
`lib/api/openapi-spec.ts:1873` (y en el `.yaml`, l.1739) dice lo mismo.
- Vacío (`"telefono": ""`): `telefono es obligatorio`. Es correcto: lo da `requiredNonEmpty` en
  `lib/types/carga-masiva.ts:107`.
- Ausente (sin la clave): `Este campo es obligatorio`. Medido con M2 contra la app real.
  `filaCargaSchema` usa `z.string()` sin default para esos cuatro campos, y el mapa de errores global
  traduce el `undefined`.

Esta ficha existe para que la guía diga exactamente lo que hace el código, y esta tabla es nueva en el
PR. El integrador que construye la fila sin la clave verá un mensaje que la guía no menciona.
**Qué falta:** documentar los dos mensajes (vacío y ausente) en la guía y en `CargaRow` (`.ts` y
`.yaml`), y cubrir el caso ausente en el E2E. Por ejemplo, una tercera fila sin la clave en el curl
de la sección 5.1, o una aserción aparte. La salida contraria, tocar el schema para unificar el
mensaje, cambia el código y queda fuera de esta ficha.

### H3 · BLOQUEANTE · Literal de moneda nuevo en código (`docs/perfil-agentes.md > reviewer`)
`lib/api/openapi-spec.ts`, descripción de `monto_cobrar` en `CargaRow`: «Monto contra entrega **en
colones**…». Es nuevo en este diff (`git diff` lo muestra como `+`; en dev solo existía «redondeado al
colón» en la cotización). El perfil marca como bloqueante cualquier literal de país o moneda
(«Costa Rica, colones») en código nuevo, y `docs/checkpoints-proyecto.md` pide que la moneda salga de
configuración. Además contradice la corrección 10 de este mismo PR, que cambió «hora CR» por «zona
horaria del país de la empresa».
**Qué falta:** «en la moneda de la empresa» o algo equivalente, en el `.ts` y en el `.yaml`.
Mismo criterio, como menor y solo en docs: la tabla 5.1 de la guía («en colones»), «se redondea al
colón más cercano» (l.368), y el ejemplo de analítica de la sección 5.8, que añade «hora de Costa Rica»
(l.695).

### H4 · menor · La colección de Postman se contradice sobre el borrado
La descripción de la variable `numRemisionDesechable` dice «ese borrado es definitivo». La corrección
18 de este PR cambió la descripción de la petición «10. Eliminar» a borrado lógico, pero no tocó la de
la variable.

### H5 · menor · Postman: «3. Listar» y «9. Cancelar» con una tienda con fulfillment
Con fulfillment, la carga deja `numGuia` en `''`. Entonces «3. Listar» manda `num_guia=`, que según la
sección 5.3 de la guía responde `422`, y «9. Cancelar» llama a `/api/ordenes/api-key//cancelar`. La
sección 4.8 dice «ejecute las peticiones en el orden en que vienen», y para esas tiendas dos de ellas
fallan. Además, «3. Listar» combina `estado=en_reparto`, agosto de 2026 y la guía recién creada, así
que en una cuenta real siempre devuelve una página vacía. Pasa su test, pero el integrador no ve nada.
El E2E no lo ve porque su empresa no tiene fulfillment. Sugerencia: desactivar por defecto
(`disabled: true`) `num_guia`, `estado`, `desde` y `hasta` en «3. Listar», y avisar en 4.8 de que la
cancelación necesita guía.

### H6 · menor · La guía remite a archivos del repositorio que el integrador no tiene
La guía cita `docs/api/CHANGELOG.md` (l.31, bloque C) y `docs/api/api-key-openapi.yaml` (l.31) como
si fueran accesibles. El integrador recibe el PDF, la colección y Swagger en `/api-docs`; el
changelog y el `.yaml` no se sirven en ninguna ruta. Habría que decir dónde los consigue (o que los
pida a la empresa), o quitar la remisión.

### H7 · menor · Huecos para un integrador que empieza de cero
Contestando al punto 6: con la guía, Postman y Swagger, un integrador se conecta. Las secciones 3.1
(cómo se obtiene la clave), 3.2 (formato exacto), 4.4 (401 frente a 403) y 4.8 (Postman y Swagger)
cubren el camino. Lo que falta o confunde:
- No hay «primera petición». Sugerencia: un párrafo de primeros pasos con
  `curl https://www.servilogistic.co/api/ordenes/api-key?limit=1` y la respuesta esperada (`200` con
  `items` y `pagination`) para comprobar la clave antes de cargar nada.
- Límites: no hay límite de tasa en el código (no encontré ninguno), y la guía no lo dice. La carga
  y la cotización tienen `maxDuration = 60` s (`app/api/ordenes/api-key/carga/route.ts:79`) y la
  guía no lo menciona. Un lote de 5000 filas que pase de ese tiempo llega como error de la plataforma,
  no como el error uniforme de la sección 4.3.
- La tabla 8.1 (fila `403`) no menciona el módulo de Analítica apagado. Las secciones 4.4 y 5.8 sí
  (corrección 12): queda incoherente.
- El curl de habilitar (sección 5.10, l.762) perdió las barras de continuación y quedó en una sola
  línea con espacios. Funciona, pero desentona con el resto y se lee peor.
- La descripción general del OpenAPI sigue diciendo «La key identifica a un usuario dedicado que es el
  **dueño**»; con tienda destino, el dueño es la tienda (la sección 3.3 de la guía sí lo dice bien).

### H8 · menor · Símbolos vetados en comentarios
`docs/api/api-key-openapi.yaml:821` (`§`) y `:1525` (`⚠️`) son comentarios `#`, y la guardia los
excluye a propósito. El `.yaml` no se entrega al integrador, así que no es lo que pidió Carlos, pero
quien abra ese archivo los ve. Se pueden quitar sin coste. En `openapi-spec.ts` solo quedan en
comentarios de código, que no se sirven.

### H9 · menor · `servers` fijo en producción en todos los entornos
Desde Preview o desde local, «Try it out» de Swagger manda la petición a producción. La clave de
Preview recibe `401`, y el navegador probablemente lo bloquea antes por CORS. Desde el apex sin `www`
pasaría lo mismo si no hay redirección. Es una decisión registrada en `## Decisiones`, y el
documento publicado tiene que decir producción. Aun así, choca con `CHECKPOINTS.md > Configuracion`
(«Nada que cambie entre entornos (URLs…) quedó hardcodeado»). Alternativa sin coste: un segundo
servidor relativo (`{ url: "/", description: "Este entorno" }`) detrás del de producción.

## Las 20 correcciones contra el código

Las abrí todas en el archivo:línea que cita la tabla. Todas coinciden:
- 1 a 3: URL (guardia, E2E caso 6).
- 4: `page.tsx:20` (solo `maestro`), `menu-visibility.ts:589` (Configuración, opción API),
  `ApiKeysModule.tsx:203` («Generar API key»). La clave es `svl_` más 43 caracteres: 32 bytes en
  base64url, `lib/utils/api-key-generator.ts:30`.
- 5: `ApiKeyService.rotar`.
- 6 a 8: `filaCargaSchema` y `BulkOrdenService.ts:896` (`peso: null`).
- 9: `carga-masiva.ts:107`. Correcto para el campo vacío; H2 para el ausente.
- 10: `zonaDelIntegrador`.
- 11: los cuatro `throw new ConflictError()` genéricos.
- 12: `exigirModuloActivo("analitica")` en `analitica/route.ts:144` y `ModuloInactivoError`.
- 13: `extraerBearer`, que con `split(" ")` da un token vacío cuando hay dos espacios.
- 14: `ApiKeyAuthService.ts:83`.
- 15 y 16: tests de Postman ejecutados en el E2E.
- 17: `ESTADOS_CANCELABLES_API` en `OrdenRepository.ts:296`.
- 18: los 7 estados de `ESTADOS_ELIMINABLES`.
- 19: coherencia interna de los ejemplos, que comprueba el E2E.
- 20: guardia.

## Sección 3.7 (empresas y claves) contra el código

Es correcta:
- `buildAutenticar` (`lib/api/api-key-request.ts:47`) resuelve la clave por el hash con
  `comoPlataforma` y lee `organizacionId` de la fila `api_key`. Una clave sin empresa da `401`.
- Cada ruta corre su cuerpo dentro de `conEmpresaDeLaKey` (l.74), que fija la empresa de la clave.
  Ningún dato de la petición la elige.
- `ApiKeyAuthService.autenticar` resuelve el dueño (cuenta dedicada o tienda destino) con
  `resolverOwnerApiKey`, y da `forbidden` con la clave desactivada, la cuenta inactiva o la tienda
  dada de baja (esto respalda las secciones 3.5 y 4.4).
- El E2E «dos empresas, una URL» lo prueba contra la app real con controles positivos: B recibe 404 en
  las 6 rutas, con el cuerpo literal `NOT_FOUND`; el listado y los filtros dan página vacía; habilitar
  da `no_encontrada`; la analítica de B no cambia y la de A sube; A sí cancela.

Respuesta a la pregunta de Carlos: varias empresas con la misma URL no se mezclan. Cada clave lleva su
empresa, y una orden ajena responde igual que una inexistente.

## Tamaño (punto 7)

De las 863 líneas de producción, unas 770 son documentación: guía 459, Postman 205, `.yaml` 71,
CHANGELOG 38. El código es `openapi-spec.ts` (81), `url-produccion.ts` (7) y `playwright.config.ts`
(2). Es una sola pieza coherente (los tres artefactos tienen que cambiar a la vez para no
contradecirse) y está por debajo del máximo. Justificado. Los arreglos de H2 a H7 suman pocas líneas
y no deberían pasarlo.

## Veredicto

**RECHAZADO**. Tres bloqueantes:
- H1: la ruta, que tiene que corregir el humano o el leader.
- H2: el mensaje de error de una clave ausente, en la guía, el contrato y el E2E.
- H3: «colones» en `lib/api/openapi-spec.ts` (y en el `.yaml`).

H2 y H3 son arreglos pequeños de documentación más una aserción del E2E. Los menores (H4 a H9)
conviene resolverlos en la misma vuelta, porque son lo que de verdad le estorba a un integrador.

## Vuelta 2 (acotada a b3fb5ded..1c0cdd86)

Revisé solo el diff de los arreglos (13 archivos) contra H1 a H9. Como la ficha subió a ruta completa,
también revisé la trazabilidad R -> test del spec nuevo.

### Checklist
- [x] `git pull`: la rama está al día con `origin/feature/SLT-208-manual-api-conectable` (HEAD 1c0cdd86).
- [x] Spec completo:
  - `requirements.md`: R1 a R12 en EARS y cita la decisión de Carlos del 2026-11-18.
  - `design.md`: D1 a D5, cada una con su alternativa descartada.
  - `tasks.md`: T1 a T11, todas `[x]`.
- [ ] `design.md` abre con `## Lo que ya existe`: **falta** (V2-1).
- [ ] Trazabilidad: R8 no tiene test (V2-2). Las demás R apuntan a tests que existen y que comprueban lo
      que el requisito dice.
- [x] Tamaño: `node scripts/tamano-pr.mjs` da 12/40 archivos, 977/1000 líneas de producción y 1016/3000
      de tests. Solo es un AVISO.
- [x] `eslint` sobre los 4 `.ts` tocados: sin problemas. `tsc --noEmit`: sin errores.
- [x] vitest con la base desechable: la guardia, el test del PDF, `docs-marca-heredada` y
      `openapi-406-evidencias-url` dan 4 archivos y 79 tests en verde.
- [x] Mutaciones repetidas y restauradas con `git checkout --`:
  - «# monto en colones» en un comentario del `.yaml`: la regla 4 da rojo (1 failed).
  - «se redondea al colón» en `CargaRow.monto_cobrar` de `openapi-spec.ts`: la regla 4 da rojo (1 failed).
- [ ] E2E: no lo corrí (necesita `next build`; lo corre el CI). Leí el código: la variante con fulfillment
      se ejecuta de verdad (ver H5). Según el implementer, 8 passed.

### Hallazgos de la vuelta 1
- **H1 · la ruta queda resuelta.** El spec existe y el label quedó en `ruta:completa`. La decisión está
  en `progress/features/SLT-208.md > Decisiones`, y la de Carlos se cita en el «Origen» de
  `requirements.md`. El spec nuevo deja dos huecos (V2-1 y V2-2).
- **H2 · resuelto.**
  - La sección 5.1 trae un párrafo «Atención» con los dos mensajes: si la clave viene vacía,
    `<campo> es obligatorio`; si no viene, `Este campo es obligatorio`. La columna de la tabla pasó a
    decir «si viene vacío».
  - `CargaRow` lo dice en el `.ts` y en el `.yaml`, y el CHANGELOG también.
  - El E2E nuevo manda una fila sin `telefono` y otra con `telefono: ""`, y compara literalmente con
    `[[1,{telefono:["Este campo es obligatorio"]}],[2,{telefono:["telefono es obligatorio"]}]]`.
  - La guía dice que en `provincia`, `canton` y `distrito` una clave ausente da lo mismo que una vacía.
    Cuadra con `filaCargaSchema`, que usa `optional().default("")`.
- **H3 · resuelto.**
  - Ni `colones`, ni `colón`, ni `Costa Rica` en la guía, en `openapi-spec.ts` (tampoco en sus
    comentarios), en el `.yaml` ni en la colección. Solo queda la fila de historial del 2026-11-05 de la
    guía, que es la excepción prevista.
  - La regla 4 de la guardia lo prohíbe, y en el `.yaml` mira también los comentarios. Las dos
    mutaciones la ponen en rojo.
  - En `requirements.md`, R7 solo nombra las palabras vetadas. Eso es correcto.
- **H4 · resuelto.** La variable `numRemisionDesechable` y el comentario de la carga hablan de borrado
  lógico.
- **H5 · resuelto en la colección; en la guía, a medias (V2-3).**
  - «3. Listar» deja activos solo `limit`, `offset` y `num_remision={{numRemision}}`, y su test exige
    que venga la orden creada.
  - «6» y «7» aceptan `409` si no hay guía.
  - «9. Cancelar» lleva un script previo con `pm.execution.skipRequest()`.
  - El E2E corre la colección dos veces, sin fulfillment y con él. La tienda «c» tiene
    `seRecogeEnTienda: false`, y tras la carga el test exige `numGuia === ""`: eso prueba que la variante
    con fulfillment está activa. El único item que puede omitirse es `con fulfillment: 9. Cancelar una
    orden`; sin fulfillment, «Cancelar» tiene que dar `200`.
  - Omitir la cancelación está justificado (design D3): sin guía no hay cancelación posible, y leer antes
    el detalle no la daría. Está documentado en la descripción de la colección y en la de `numGuia`.
- **H6 · resuelto.** La guía ya no remite a `docs/api/*`. Solo queda una mención, en la l.108, dentro
  del ejemplo literal del `422` que da `lib/types/order-status.ts:248`, y por R2 la guía tiene que
  copiarlo tal cual. Que el mensaje de la API mande a un archivo del repo es una deuda del código, fuera
  de esta ficha.
- **H7 · resuelto.**
  - La sección 2.1 «Primera petición» es nueva y el E2E la ejecuta (ahora son 11 curl).
  - El límite de 60 s está en 5.1 y en 5.2.
  - La tabla 8.1 trae el `403` por el módulo de Analítica.
  - El curl de habilitar tiene sus `\`.
  - La descripción general del OpenAPI describe bien al dueño.
  - Queda un detalle menor (V2-4).
- **H8 · resuelto.** El `.yaml` ya no tiene `§` ni `⚠️`, y las reglas 2 y 4 de la guardia miran el
  `.yaml` entero.
- **H9 · resuelto.**
  - `servers` es `["/", "https://www.servilogistic.co"]` en el `.ts` y en el `.yaml`.
  - La guardia lo comprueba en el `.yaml`, con un regex que fija el orden, y el E2E en
    `/api/docs/openapi`.
  - `/api-docs` carga el contrato con `url: "/api/docs/openapi"`, que es relativa. Por eso, con `/`,
    «Try it out» usa el host desde el que se abrió.
  - La guía 4.8 y el CHANGELOG lo explican.

### Hallazgos nuevos

#### V2-1 · BLOQUEANTE · `design.md` no abre con `## Lo que ya existe`
`CHECKPOINTS.md > Ruta > Completa` y `docs/specs.md > Antes de especificar: lo que ya existe` lo exigen
en todo spec escrito desde el 2026-10-06. Este spec es del 2026-11-19. Una sección ausente es
bloqueante.

**Qué falta:** abrir `design.md` con `## Lo que ya existe`, con tres cosas: los términos buscados (en el
board y en el grafo), qué apareció y qué se reutiliza. Lo que se reutiliza en este caso:
- `lib/api/url-produccion.ts`;
- el armado del PDF de la guía;
- `altaDeEmpresa` y el doble de Storage del E2E;
- las guardias `docs-marca-heredada` y `openapi-406-evidencias-url`.

Si una búsqueda no encontró nada, se escribe «Buscado `<términos>`: nada».

#### V2-2 · BLOQUEANTE · R8 no tiene test (regla 4 del arnés)
La tabla de trazabilidad dice, para R8, «sin test automático: es redacción». Pero la regla del arnés
es que cada `R<n>` tiene su test, y si falta uno es bloqueante. Además, R8 sí se puede comprobar. Hoy el
cuerpo de la guía no remite a `docs/`, `lib/` ni `app/`, salvo en dos sitios: el front matter
`fuentes:` y el mensaje literal de la l.108 (ver H6).

**Qué falta.** Una de estas dos salidas:
- Añadir a la guardia una regla que busque en el cuerpo de la guía `docs/`, `lib/`, `app/`, `.yaml` y
  `CHANGELOG.md`, con su mutación. Las dos únicas excepciones son el front matter y el mensaje literal
  que viene de `order-status.ts`.
- O reformular R8 para que no sea un requisito verificable. Por ejemplo, pasarlo a una decisión de
  `design.md`.

#### V2-3 · menor · La guía no dice qué pasa en Postman con fulfillment
El paso 4 de la sección 4.8 dice «Ejecute las peticiones en el orden en que vienen». No dice que, con
fulfillment, «6» y «7» responden `409` y que «9. Cancelar» no se envía. La descripción de la colección sí
lo dice; la guía, no. Era la segunda mitad de la sugerencia de H5.

**Qué falta:** una frase en 4.8, paso 4, como el punto 3 de la descripción de la colección.

#### V2-4 · menor · El curl de la sección 2.1 va en una sola línea con espacios
`curl "https://www.servilogistic.co/api/ordenes/api-key?limit=1"   -H "Authorization: ..."`. Es el
mismo defecto que se corrigió en el curl de habilitar (H7): funciona, pero no se lee como el resto.

#### V2-5 · menor · El test del PDF numera distinto que el spec
`tests/unit/ayuda/guia-api-pdf-produccion-slt208.test.ts` titula sus bloques «R6» y «R7»; en el spec
son R10 y R11. La tabla de trazabilidad lo aclara («R6 del archivo»), pero quien busque R10 por número no
lo encuentra.

### Veredicto vuelta 2

**RECHAZADO.** Los hallazgos H1 a H9 están resueltos, salvo la parte de H5 que toca la guía (V2-3,
menor). Quedan dos bloqueantes nuevos, los dos en el spec que exige la ruta completa:
- V2-1: falta `## Lo que ya existe` en `design.md`.
- V2-2: R8 no tiene test.

Los dos se arreglan con documentación y una regla de guardia, sin tocar la API ni los artefactos.
Conviene resolver V2-3 en la misma vuelta.

## Vuelta 3 (acotada a 9dbc6b0a..e010eaa5)

Revisé solo el diff de los arreglos (6 archivos) contra V2-1 a V2-5, y volví a recorrer la trazabilidad
R1..R12.

### Checklist
- [x] `git pull`: la rama está al día (HEAD e010eaa5).
- [x] V2-1: `design.md` abre con `## Lo que ya existe`, en el formato de `docs/specs.md`. Da los términos
      buscados en el board y en el grafo, qué apareció (SLT-80, SLT-201, SLT-203, SLT-45 y símbolos) y
      qué se reutiliza o no, con el porqué. Dice «url de producción: nada en el board».
- [x] V2-2: la regla 5 de la guardia (`referenciasAlRepositorio`) busca `docs/`, `lib/`, `app/`, `.yaml`
      y `CHANGELOG.md` en el cuerpo de la guía. Excluye el front matter y el literal del `422`
      (`Ver docs/api/CHANGELOG.md.`, que aparece 1 vez). Las rutas de URL detrás de `/` no cuentan. R9
      ahora incluye R8, y la tabla de trazabilidad mapea R8 a la regla 5.
- [x] Mutaciones sobre la guía real, restauradas con `git checkout --` (`git status` limpio):
  - «(ver lib/api/openapi-spec.ts)» en 4.8, paso 4: la regla 5 da rojo con `["lib/"]` (1 failed).
  - «(ver CHANGELOG.md)» en 4.8, paso 2: la regla 5 da rojo (1 failed).
  - El bloque MUTACIÓN también prueba la función con el front matter, el 422 y `/api/docs/openapi`.
- [x] V2-3: en 4.8 hay un paso 5 nuevo para fulfillment: «6» y «7» responden `409`, y «9. Cancelar» no se
      envía. Cuadra con la colección.
- [x] V2-4: el curl de 2.1 está partido con `\`, como el resto.
- [x] V2-5: el test del PDF titula «SLT-208 R10» y «SLT-208 R11», y la tabla cita esos nombres.
- [x] Trazabilidad: R1 a R12 tienen cada uno un test (guardia, test del PDF o E2E). Ninguno queda como
      «sin test».
- [x] Tasks: ninguna `[ ]` en `tasks.md`.
- [x] Con la base desechable: la guardia y el test del PDF dan 2 archivos y 30 tests en verde. `eslint`
      no reporta problemas en los dos `.ts`. `tsc --noEmit` sale con 0.
- [x] Tamaño: 12/40 archivos, 979/1000 líneas de producción y 1044/3000 de tests. Solo es un AVISO,
      igual que en la vuelta 2.

### Hallazgos nuevos
- **V3-1 · menor:** la excepción del 422 quita del cuerpo **toda** aparición de `Ver docs/api/CHANGELOG.md.`,
  no solo la del ejemplo del `422`. Si alguien copiara esa frase en otro párrafo, la guardia no lo
  vería. Es un riesgo bajo: la frase es muy concreta. No bloquea.
- **Nota (no es hallazgo):** el tamaño está a 21 líneas de producción del máximo. Si hay otra vuelta,
  cualquier añadido puede pasarlo.

### Veredicto vuelta 3

**OK.** V2-1 y V2-2, los dos bloqueantes, están resueltos, y también los menores V2-3, V2-4 y V2-5. No hay
regresiones en el rango. Queda un menor (V3-1) que no bloquea.
