# SLT-62 «Mostrar el % de efectividad aunque haya pocas órdenes» — design

## Lo que ya existe

**Términos buscados:** `MINIMO_BASE_PORCENTAJE`, `base_insuficiente`, `MAXIMO_SALTO_POR_ORDEN`,
`efectividad-cohorte`, `evaluarMadurezDeCohorte`, `fraseSobreCerradas`, `titularDelHeroe`,
«baile solo», «muy pocas para un porcentaje», «base chica», «suelo», «efectividad». Se buscó en
`feature_list.json` (por title y name), en `specs/` y en el código con Grep. El MCP del grafo no se
consultó: Grep cubrió todos los símbolos, y son pocos y con nombres únicos.

**Board.** Solo aparece esta ficha (SLT-62). Ninguna otra trata del porcentaje con base chica.

**Specs.** Ningún spec escrito define el suelo de 20.
- `specs/411-analitica-cohorte-de-carga/requirements.md` R33 pide que todo porcentaje de cohorte
  lleve su base y que el denominador sean las cargadas. Esta feature lo cumple igual y no lo toca.
- La ficha 441, que introdujo el suelo, no tiene carpeta en `specs/`. Su regla vive solo en el
  código y en sus cabeceras: `lib/config/efectividad-cohorte.ts` y `lib/analytics/madurez-cohorte.ts`.
  **Esta feature anula la parte «base demasiado chica» de la ficha 441**, por decisión del humano
  del 2026-10-30.
- La ficha 455 (`specs/455-un-nombre-por-estado`) solo fija los nombres de estado («Entregado»).
  Se conserva.

**Código: quién usa el suelo de 20.** El censo está completo.

| Símbolo | Quién lo usa | Qué pasa con él |
|---|---|---|
| `efectividadCohorteConfig` / `MAXIMO_SALTO_POR_ORDEN` (`lib/config/efectividad-cohorte.ts`) | `lib/analytics/madurez-cohorte.ts:56,66`, `app/(app)/analitica/_components/entregas/madurez-textos.ts:39,82`, `tests/unit/analytics/madurez-cohorte.test.ts:7` | Se borra el archivo |
| `MINIMO_BASE_PORCENTAJE` | `madurez-cohorte.ts:66,137`, `madurez-textos.ts:35,83`, `tests/unit/analytics/madurez-cohorte.test.ts`, allowlist nominal de `tests/unit/analytics/tablero-operativo-frontera.guardia.test.ts:387` | Se borra |
| motivo `base_insuficiente` | `madurez-cohorte.ts:73,137`, `madurez-textos.ts:132-139,165-179`, tests | Se borra |
| Textos «hacen falta 20…», «baile solo», «Son muy pocas…» | `madurez-textos.ts:137-138,171-178`; tests `tests/components/EfectividadHeroe.test.tsx:169,179,190,202` | Se borran |

**Consumidores que NO cambian (comprobado):**
- `KpisEfectividad.tsx:159` y `AvisoPeriodoEnCurso.tsx:70` llaman a `evaluarMadurezDeCohorte`.
  El primero pasa la madurez al héroe; el segundo solo lee `enCurso`. La firma no cambia, así que
  ninguno de los dos se edita.
- `CohorteCargaTabla`, `CicloVidaKpi` y «Detalle gestión» no importan ni el suelo ni la regla: no
  tienen umbral propio (Grep de `minimo|suelo|umbral|pocas` en sus archivos: nada). No cambian.
- `tests/integration/db/efectividad-por-rol.int.test.ts:254-273` solo afirma el caso
  `sin_cerradas` (Puntarenas), que no cambia. No se edita.
- `tests/unit/components/textos-455-recorrido.test.ts:44` llama a `fraseSobreCerradas` con un valor
  no nulo. Sigue valiendo y no se edita.
- `tests/unit/guards/estado-con-info.guardia.test.ts:220` clasifica `madurez-textos.ts` por ruta.
  El archivo sigue existiendo, así que la fila no cambia.

**Qué se reutiliza:** todo el pipeline (`calcularEfectividad`, `evaluarMadurezDeCohorte`,
`titularDelHeroe`, `fraseSobreCerradas`, `EfectividadHeroe`). Solo se quita una rama.

## Modelo de datos

No hay cambios: ni tablas, ni RLS, ni migraciones, ni consultas. El cambio es de presentación,
sobre conteos que ya llegan al navegador. `organizacion_id` y la autorización siguen igual que hoy,
en la Server Action de Analítica, que no se toca. No depende del país: el porcentaje se formatea con
el `formatearValor(_, "porcentaje")` de siempre.

## Cambios

### 1. `lib/analytics/madurez-cohorte.ts`: la regla

- Se borran `MINIMO_BASE_PORCENTAJE` y el import de `efectividadCohorteConfig`.
- `MotivoSinPorcentaje` queda con un solo valor, `"sin_cerradas"`. El tipo se mantiene como unión
  de un literal: el contrato «nunca un `null` mudo» sigue igual y los consumidores siguen
  comparando contra `"sin_cerradas"`.
- `porcentaje(numerador, base, motivoComun)` pierde la línea `if (base < MINIMO_BASE_PORCENTAJE)`.
  Con la base en cero, `motivoComun` ya vale `"sin_cerradas"`, porque cerradas = 0 implica que no
  hay ninguna orden con desenlace. Por eso no hay división por cero que cubrir.
- Las cabeceras se reescriben así: se borra el punto 2 («BASE DEMASIADO CHICA») y se deja una línea
  de historia, «el suelo de 20 se quitó en SLT-62 por decisión del humano (2026-10-30): el
  porcentaje se escribe siempre que haya al menos un desenlace». La tabla medida del 2026-09-17 se
  conserva: explica `enCurso` y la segunda cifra, no el suelo.

Contrato resultante (sin cambios de forma):

```ts
type MotivoSinPorcentaje = "sin_cerradas";
interface PorcentajeDeEntrega { valor: number | null; base: number; motivo: MotivoSinPorcentaje | null }
// valor === null  <=>  cerradas === 0
```

### 2. `lib/config/efectividad-cohorte.ts`: se borra

Su único fin era la tolerancia que derivaba el suelo. Si se deja, queda configuración muerta que
alguien leería como vigente.

### 3. `app/(app)/analitica/_components/entregas/madurez-textos.ts`: los textos

- `titularDelHeroe`: se borra la rama final (`base_insuficiente`). Los casos que quedan son tres,
  en este orden: `cargadas === 0` → «No entró ninguna orden»; `valor !== null` → la cifra;
  `sin_cerradas` → «Ninguna ha terminado todavía». Tras `valor !== null`, el único motivo posible
  es `sin_cerradas`. La última rama pasa a ser el `return` final, sin `if`, y TypeScript lo
  estrecha.
- `fraseSobreCerradas`: se borran las dos frases «hacen falta…» y la rama `base === cargadas`. Queda
  `valor !== null` → la frase con porcentaje; si no, `null`.
- Se borran las constantes `TOLERANCIA` y `SUELO` y los imports de `MINIMO_BASE_PORCENTAJE` y
  `efectividadCohorteConfig`. También se borra el punto 2 de la cabecera.
- El parámetro `cargadas` de `fraseSobreCerradas` deja de usarse. **Se conserva la firma**
  (`_cargadas` o se documenta), para no tocar `EfectividadHeroe.tsx` ni
  `textos-455-recorrido.test.ts`. Si el lint marca el parámetro sin uso, se quita y se ajustan los
  dos llamadores; los dos están en `## Archivos esperados` como posibles.

### 4. `EfectividadHeroe.tsx`

No cambia de lógica: pinta lo que devuelve `titularDelHeroe`. Solo se edita si se quita el
parámetro `cargadas` (ver arriba).

### 5. Guardia de frontera

En `tests/unit/analytics/tablero-operativo-frontera.guardia.test.ts`, la entrada de la feature 441
pierde `"MINIMO_BASE_PORCENTAJE"` en `nombres`. Su `motivo` deja de citar «base por debajo del
suelo» y `lib/config/efectividad-cohorte`. Así la allowlist no autoriza un nombre que ya no existe.
El `toEqual` de módulos no cambia.

## Tests

Se reescriben los que afirmaban el suelo. Ninguno puede quedar verde sin querer: cada caso nuevo
afirma un literal o un cálculo hecho a mano, no la salida de la función que prueba.

| Archivo | Qué se quita | Qué se añade |
|---|---|---|
| `tests/unit/analytics/madurez-cohorte.test.ts` | `describe` R3 «BASE DEMASIADO CHICA» y R4 «el suelo se DERIVA», más los imports de `MINIMO_BASE_PORCENTAJE` y `efectividadCohorteConfig` | R1 y R2 con base chica (12/11/1 → 11/12; 1/1/0 → 1; 64/2/61 → sobre las que tienen desenlace 2/3; 8/6/0 → 6/8). R3 con un barrido de todos los repartos válidos con `cargadas ∈ [0,25]`: `valor === null` ⇔ `cerradas === 0`, y `motivo ∈ {null, "sin_cerradas"}` |
| `tests/components/EfectividadHeroe.test.tsx` | el bloque «Zona El Coco» (líneas 162-205: «se calla», «hacen falta 20», «8 de 8 … hacen falta 20», «Son muy pocas») | R4: `madurez(12, 11, 1)` pinta el literal `91,7 %` (normalizado), «Entregado: 11» y «de las 12 órdenes que entraron». R5: con 64/2/61, «66,7 % de las 3 órdenes con desenlace terminaron en Entregado»; con 8/6/0, «75,0 % de las 8 …». R6: `queryByText(/hacen falta|baile solo|muy pocas|movería/)` nulo en esos casos |
| `tests/unit/components/madurez-textos.test.ts` (nuevo) | — | R6: barrido de `titularDelHeroe` y `fraseSobreCerradas` sobre los repartos con `cargadas ∈ [1,25]` y `cerradas ≥ 1`. Ninguna salida casa con `/hacen falta|baile|muy pocas|mover[íi]a|\d+ de \d+ órdenes$/`, y `porcentaje !== null` |

Las cifras literales (`91,7 %`, `66,7 %`, `75,0 %`) **son el contrato**: el caso real pide «91,7 %».
Se comparan con el espacio normalizado (`norm`), como ya hace el archivo.

Mutaciones que deben salir rojas (el implementer las ejecuta y anota el resultado):

| Mutación | La mata |
|---|---|
| Reponer `if (base < 20) return { valor: null, … }` en `porcentaje` | R1, R2, R3 (unidad) y R4, R5 (componente) |
| Reponer el suelo solo para `sobreCerradas` | R2, R3, R5 |
| Reponer cualquier frase «hacen falta…» en `fraseSobreCerradas` con base < 20 | R6 (unidad y componente) |
| Quitar el guardia `sin_cerradas` | R7, con el test existente «CERO CERRADAS» (`sobreCargadas.valor` deja de ser `null`) |

En el test existente de «CERO CERRADAS» (`madurez-cohorte.test.ts:76-81`) hay que actualizar el
comentario. Ya no hay suelo que tape `sobreCerradas` «de rebote»: sin el guardia, la cifra saldría
`0/0 = NaN`. La aserción no cambia.

## Alternativas descartadas

1. **Bajar la tolerancia a 1 (`MAXIMO_SALTO_POR_ORDEN = 1`, suelo = 1) y dejar el resto.** Es un
   cambio de una línea, pero deja vivos el motivo `base_insuficiente` y los textos «hacen
   falta…». Esas ramas pasarían a ser inalcanzables y seguirían en el código, con tests que las
   afirman, y la cabecera seguiría prometiendo «que la cifra no baile sola». El humano pidió quitar
   el aviso, no esconderlo detrás de un número. Descartada.
2. **Dejar la regla como está y que la pantalla ignore `base_insuficiente` (calcular el % en
   `madurez-textos.ts`).** Pondría dos reglas sobre el mismo reparto: la del módulo puro diría
   «no hay cifra» y la del texto la calcularía igual. Es el defecto que la ficha 441 vino a
   impedir: la regla tiene que vivir en un solo sitio. Descartada.
3. **Mostrar el % con una marca discreta de base chica (asterisco o tooltip).** El humano lo
   descartó de forma expresa: el porcentaje va «limpio, sin aviso de base pequeña». No se reabre.

## Integraciones

Ninguna. No entran librerías nuevas.
