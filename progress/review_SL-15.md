# Review — SL-15 «Nombre «Ordenex» en código y UI» (`nombre-ordenex-codigo`)

> Reviewer, vuelta 1. Revisé el diff `dev...HEAD`, con HEAD en `69e30e4` y `dev` en `35f88b1`, ya
> mergeado en la rama: 665 archivos. Para no repetir el término, en este informe lo llamo «la palabra
> heredada». El MCP del grafo no se usó: el código se recorrió con `git`, Grep y un análisis de AST
> propio (ver 1).

## Veredicto: OK (0 bloqueantes)

T11.3, la comprobación visual, queda **pendiente para el humano** por decisión del leader, y no la
cuento como bloqueante.

## Lo que pidió mirar el leader

### 1. La wallet, los cierres y el dinero no cambian de comportamiento
Para cada archivo de producción del diff (243, entre `app/`, `lib/`, `components/`, `hooks/`,
`public/*.js`, `scripts/` y `middleware.ts`) comparé su esqueleto de código entre el merge-base y
HEAD. Usé el parser de TypeScript del repo, y el esqueleto excluye cinco cosas:
- los comentarios, incluido JSDoc;
- todos los literales de texto: strings, templates y texto JSX;
- los accesos a `EMPRESA.*` y `MARCA.*`;
- los imports;
- el renombre de identificadores del glosario (§3).

Script: `C:/Users/ArqDev/AppData/Local/Temp/claude/R--job-singularis-projects-servi-logistic/c68afbf4-2e7b-4cf8-895a-a06ecd3a8118/scratchpad/normaliza.cjs`.

**Resultado:** 235 de los 243 tienen el esqueleto idéntico. Los 8 que difieren son justo los
cambios que pide el spec:

| Archivo | Qué cambia | R |
|---|---|---|
| `lib/pdf/etiquetas-dibujo.ts`, `app/(app)/ordenes/_components/EtiquetaGuia.tsx` | `ROTULO_GUIA` depende del membrete | R7 |
| `lib/whatsapp-envios/informes/{transito,picking}/pdf.ts` | El encabezado se omite sin membrete | R8 |
| `app/(app)/cierres-admin/_components/cierre-factura.tsx` | El membrete del comprobante solo se pinta si existe | R1/R3 |
| `lib/utils/api-key-generator.ts` | `PREFIX_VISIBLE_CHARS`: de 12 a `API_KEY_PREFIX.length + 7` = 11 | R11 |
| `scripts/contraste-454.ts` | La regex de la base local pasa a `servi_logistic` | R12 |
| `lib/api/openapi-spec.ts` | Más líneas de descripción, que documentan las cabeceras | R10 |

Ningún archivo de cálculo de dinero (servicios y repositorios de wallet y cierres, `ingreso-empresa`,
analítica) cambia de estructura. También comprobé tres cosas más:
- Los valores de unión renombrados (`"concepto_…"`, `"…_debe"`, `"ganancia_…"`, etc.) no aparecen
  en ninguna migración de `dev`.
- No hay alias de SQL crudo con la palabra.
- Las claves de objeto (`liquidado.empresa`, `r.empresa`) cambian a la vez en quien escribe y en
  quien lee. El typecheck pasa.

### 2. Cabeceras `X-Servi-Logistic-*` y prefijo `svl_`: coherentes, sin claves huérfanas
- **Firma:** las cabeceras se definen una sola vez, en `lib/crypto/webhook-firma.ts:11,13`.
  `firmarWebhook` las usa en `:36-37` y `openapi-spec.ts:137-139` las interpola desde esas mismas
  constantes. No queda ninguna otra cabecera de firma propia. Las `X-Hub-Signature-256` son de Meta.
- **API key:** `API_KEY_PREFIX = "svl_"`, y `PREFIX_VISIBLE_CHARS` se deriva del prefijo. La
  verificación compara el hash de la key entera y ningún punto del código verifica el prefijo, así
  que no hay ningún extremo que deba cambiar a la vez. El 401 con el prefijo viejo está probado en
  `api-key-auth-service` «SL-15 R11».
- **Secreto de webhook:** el prefijo `svl_whsec_` se define en un solo sitio.
- **Service worker y página:** `servi-logistic:{relevo-ahora,pagina-lista,push-recibido}` son
  idénticos en `public/sw.js:100-103` y en `lib/pwa/actualizacion.ts:21-43`. El `tag` es
  `servi-logistic:<evento>`. Las claves de almacenamiento y los eventos llevan todos el prefijo
  nuevo, y la cookie es `servi_logistic_tema`.

### 3. Migraciones editadas en sitio
- 20 archivos de `db/migrations/` y `db/schema.prisma`, todos `M`: no se añade, borra ni renombra
  ninguno.
- En `git diff -U0` de las migraciones, la única línea `+`/`-` que no es comentario `--` es el
  mensaje del `RAISE EXCEPTION` de `20260927120100_abono_tienda_457_tablas_y_checks/down.sql`. Solo
  cambia el texto.
- **`db/schema.prisma`:** sin los comentarios `//`, el archivo es idéntico al de `dev` (script
  `schema-code.cjs`, en el mismo scratchpad). Ningún modelo, columna, enum ni `@map` cambia.
- **`migrate diff`:** no lo volví a correr, porque Prisma 7 exige una base sombra configurada. La
  bitácora (T9.2) da `-- This is an empty migration.`, con exit 0, en las dos formas
  (`--from-migrations` y `--from-config-datasource`). Es coherente con lo que medí: si el SQL y el
  esquema no cambian, el diff no puede cambiar.

### 4. Excepciones con `retira: "SL-16"` (el `Bearer` de `evidenciasUrl`)
- Hay dos, acotadas a la línea `Authorization: Bearer <prefijo viejo>` y a su archivo exacto:
  `lib/api/openapi-spec.ts:1131` y `tests/unit/api/openapi-webhook-contrato.test.ts:233`.
- **El spec de SL-16 las cubre**, aunque sin nombrarlas. Lo leí en el worktree
  `SL-16-nombre-ordenex-docs`, commit `66349c9`, sin escribir nada:
  - su alcance incluye `lib/api/openapi-spec.ts` (requirements:17, decisión P3:155);
  - su R16 exige que toda descripción que cambie en `openapi-spec.ts` sea igual en el YAML;
  - su design:117 dice que, si SL-15 ya cambió un identificador, el doc dice lo que dice el código y
    no se escribe la excepción;
  - su T0 exige SL-15 integrado.

  Además, la guardia de SL-15 pone su propia excepción en rojo («ya no cubre nada») en cuanto SL-16
  cambie la línea. Así que el cierre es mecánico.
- Ver m1 (texto desfasado en el spec de SL-16) y m2 (la doc publicada se contradice mientras tanto).

### 5. La guardia `sin-nombre-heredado` muerde
14 casos, todos en verde. Hice estas mutaciones, todas restauradas, con `git status` limpio:

| Mutación | Resultado |
|---|---|
| `lib/zz-mut.ts` sin versionar, con la palabra seguida de « le paga a una tienda» | **rojo** `lib/zz-mut.ts:1` |
| Un comentario con la palabra en `lib/constants/wallet-rotulos.ts` (versionado) | **rojo** |
| `export const VIEJO = "<prefijo viejo>"` en `lib/utils/api-key-generator.ts` | **rojo** |
| `e2e/zz-mut.spec.ts` con la palabra en mayúsculas | **rojo** `e2e/zz-mut.spec.ts:1` |
| R21: `EMPRESA.enFrase` y `EMPRESA.alInicio` valen «Servi Logistic» en `lib/config/marca.ts` | **rojo** en `wallet-page` y `mi-wallet-page`, entre otros: «no dice «Servi Logistic» en ningún texto de dinero» y «dice «la empresa» donde antes iba el nombre» |

El patrón está armado por partes en `tests/fixtures/nombre-heredado.ts` (R17), distingue mayúsculas
y no salta con `OrdenExistente`. No queda ninguna excepción con `retira: "SL-15"`, y el caso «ninguna
excepción sobra» las poda.

### Rojos previos (confirmados con git sobre `dev`)
- **Las 5 de integración remitidas a SL-31** (`orden-traspaso-migration`,
  `premio-ranking-devengo-migration`, `rechazo-tienda-cobro.int`, `caja-invariante-tiendas`,
  `wallet-458-migration`): la precondición de datos que las aborta ya está en `dev`:
  - en `premio-ranking-devengo-migration.test.ts:436`;
  - en `tests/integration/db/_fixtures/caja-459.ts:167`, que comparten `caja-invariante` y
    `wallet-458`;
  - en `orden-traspaso` y en `rechazo-tienda-cobro.int`.

  En esos archivos SL-15 solo cambia comentarios y nombres de paso. `wallet-458-migration` y
  `rechazo-tienda-cobro.int` no cambian. En la review de SL-13, sobre una rama sin SL-15, vi
  abortar `caja-invariante-tiendas` en esa misma precondición.
- **E2E de wallet:** los 4 textos que buscan y no existen tampoco existen en `dev`. Son «Desglose de
  movimientos» y «Filtrar por concepto» (`e2e/mi-wallet.spec.ts`), y «Filtrar por tipo» y «Registrar
  movimiento manual» (`e2e/wallet.spec.ts`): 0 apariciones en `app/ lib/ components/` de `dev`.

## Checklist

### Especificación
- [x] `requirements.md` en EARS (R1–R22, R14b), `design.md` con 6 alternativas descartadas y
      `## Lo que ya existe` con contenido. El diff no re-crea nada: `lib/config/marca.ts` era la
      pieza prevista, y los rótulos siguen en sus diccionarios.
- [~] `tasks.md`: 37 marcadas y solo falta **T11.3**, la comprobación visual, pendiente del humano
      por decisión del leader.

### Trazabilidad
- [x] Mapa `R → test` completo en `progress/impl_SL-15.md > T11.4`. Ejecuté 30 de los archivos
      mapeados, de R1 a R21, sin `DATABASE_URL`: **652 passed**, 0 failed.
  - R14 y R14b: lo comprobé por análisis estático (ver 3).
  - R18: lo comprobé en el diff (ver abajo).
  - R22: el gate de T11 da `INIT_EXIT=0`, según la bitácora. No corrí `./init.sh`.

### Calidad de código
- [x] `pnpm run typecheck`: exit 0.
- [x] `pnpm run lint`: exit 0, con 232 warnings y 0 errores, los mismos que antes.
- [ ] El `gate-completo` de CI llega con el PR.
- [~] Flujos críticos (wallet, cierres, analítica): los E2E no se corrieron porque la receta de
      siembra está ABIERTA y no se podían levantar dev servers (m3).
- [x] Sin dependencias nuevas: `package.json`, `pnpm-lock.yaml` y `docs/dependencias.md` no
      cambian.

### Seguridad, configuración y datos
- [x] No hay secretos ni URLs de base en el diff. No imprimí ni leí `scratchpad/recursos-origen.ref`.
- [x] No hay tablas, queries, RLS ni `organizacion_id` nuevos. El nombre de la empresa sale de
      `lib/config/marca.ts`, neutro hasta SL-17.
- [x] No hay migración nueva, así que no hay `down.sql` que exigir. Las editadas en sitio están
      autorizadas por decisión del humano.

### R18, lo que no se toca
- [x] `specs/` ajenos: 0.
- [x] Archivos de `arnes.manifest` en el diff: 0.
- [x] Login, layout, landing y `Logo.tsx`: 0.
- [x] Roles y permisos: sin cambios de estructura (ver 1).
- [x] Los literales de Costa Rica, SINPE y colones conservan el importe. Las 3 líneas «a revisar» de
      T11.2 son el entrecomillado del concepto (m4).

## Hallazgos

Ningún bloqueante.

- **m1 — menor:** el spec de SL-16 (`requirements.md:22-25` y la decisión P4) sigue diciendo que el
  prefijo y las cabeceras son una excepción de SL-16 «que retira SL-15». Con SL-15 integrado pasa
  al revés: SL-16 recibe las dos líneas del `Bearer` de `evidenciasUrl`. Conviene que el leader
  añada a T1 de SL-16 una línea explícita: «cambiar a `svl_` el `Bearer` de `evidenciasUrl` en
  `openapi-spec.ts:1131`, en `openapi-webhook-contrato.test.ts:233` y en el YAML, y borrar las dos
  excepciones `retira: "SL-16"` de `sin-nombre-heredado`». Que SL-16 lo cubra hoy depende de su R16
  y de design:117, no de una task.
- **m2 — menor:** mientras SL-16 no llegue, `/api-docs` se contradice. La autenticación dice
  `Bearer svl_...` (`openapi-spec.ts:124`) y la descripción de `evidenciasUrl` dice el prefijo
  viejo. No hay integradores ni keys emitidas, así que no afecta a nadie. Es una razón más para
  integrar SL-16 justo después.
- **m3 — menor (pendiente del humano):** la comprobación visual T11.3 y los E2E de los flujos
  críticos no se ejecutaron. La evidencia sustituta son los renders de página de
  `tests/integration/{wallet,mi-wallet}-page.test.tsx` (R21) y los tests de componente que lista la
  bitácora. Queda para el humano antes del PR a producción.
- **m4 — menor:** `PANEL_TEXTO.verNombre` y `verNombreAnulado` ahora entrecomillan el concepto en
  todos los movimientos («Ver «Liquidación» del …»), no solo en los que empiezan por «La empresa».
  Cambia el nombre accesible de todos los botones «Ver». Está documentado en T4 frontend, ningún E2E
  lo usa como selector y los tests lo afirman como literal. Lo anoto porque va más allá de la
  palabra.
- **m5 — menor:** `requirements.md > Preguntas abiertas` conserva la pregunta 1 sin responder
  («La empresa» visto por una tienda en `/mi-wallet`). El spec deja el texto así, y la respuesta es
  del humano.
- **m6 — menor:** las bases locales que ya aplicaron las 20 migraciones guardan checksums viejos y
  hay que rehacerlas con `prisma migrate reset`, que lanza el humano. Ya está en la bitácora. Hay
  que ponerlo en el PR.

## Lo que no corrí
- `./init.sh`, la suite completa y los E2E.
- `prisma migrate diff`: necesita una base sombra. Lo sustituí por la comprobación estática de 3.
