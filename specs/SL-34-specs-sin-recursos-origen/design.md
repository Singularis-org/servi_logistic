# SL-34 — Diseño

> Ningún valor de los que se buscan aparece en este archivo: se nombran por su clase, y el
> inventario los ubica por archivo y línea.

## Lo que ya existe

Busqué en el board (`feature_list.json`, todos los estados), en `specs/` y en el código. El MCP del
grafo no estaba entre mis herramientas, así que el código lo busqué con Grep. Términos buscados:
- los dos ids de Supabase de la app de origen;
- el nombre de su proyecto GCP;
- su cuenta de GitHub;
- `vercel.app`, `supabase.co`, `gserviceaccount`;
- emails y su dominio;
- rutas locales;
- formas de secreto, `gitleaks` y `createHash`.

| Dónde | Qué apareció | Relación con SL-34 |
|---|---|---|
| Board | **SL-27**, retirar los `specs/` heredados | Complementaria: SL-27 retira los specs, SL-34 solo edita líneas antes del push. La guardia seguirá sirviendo después. |
| Board | **SL-14** y su guardia `tests/unit/guards/dominio-ordenex-fuera.guardia.test.ts` | Ya vigila el dominio en todo el árbol salvo `progress/`, con excepciones temporales: 6 sobre `specs/` (SL-27) y el resto atadas a SL-8 y SL-16. SL-34 poda las 6 de `specs/` (R19). Además **reutiliza** dos cosas de esa guardia: su detector `lineasConDominio` y su lista `EXCEPCIONES_DOMINIO`, que se importa y no se copia (R16). |
| Board | **SL-13** y su guardia `sin-integrador-de-ordenex.guardia.test.ts` | Excluye `specs/` y no busca recursos. Sirven de molde su universo (`git ls-files --cached --others --exclude-standard`), su criterio de binarios y su atajo de una pasada por archivo. |
| Specs `SL-11` y `SL-13` | Escriben los ids de Supabase como regla de seguridad, y `SL-13` escribe la cuenta de GitHub | Entran. |
| Código | No hay ningún escáner de secretos. `createHash("sha256")` ya se usa para las API keys | La guardia es nueva y usa `node:crypto`. |

## Inventario (medido el 2026-10-22, worktree en `55f18ac`)

### En `specs/`

| Clase | Archivo:línea | Marcador |
|---|---|---|
| Id Supabase de producción | `172-liquidacion/tasks.md:102`, `215-reintento-en-cierre/{tasks.md:54, design.md:621, requirements.md:444}`, `484-puntero-gestion-colgado/tasks.md:79` | «base de producción de la app de origen» |
| Ids de producción y de preview | `SL-11-fuera-zonas-y-seeds-ordenex/design.md:267`, `SL-13-fuera-nuform/design.md:350` | la regla de R12 |
| Nombre del proyecto Supabase | `160-badge-intentos-entrega/{requirements.md:31, design.md:421}` | «el proyecto Supabase de producción de la app de origen» |
| GCP: id y service account | `92-optimizacion-ruta-mensajero/credenciales-google.md:16, 53, 54, 85, 100, 121` | `<GCP_PROJECT_ID>` y `<SA_EMAIL>`. El documento ya usa `<SA_EMAIL>` en las l. 92, 101 y 119. |
| GitHub en una URL de PR | `235-ayuda-tienda-estatus/tasks.md:389` | «PR #402 del repositorio de origen», sin URL |
| GitHub en texto | `SL-13-fuera-nuform/{requirements.md:171, design.md:116}` | «la cuenta de GitHub de la app de origen» |
| URL de despliegue | `284-pwa-correcta/requirements.md:47` | «el despliegue de producción de la app de origen» |
| Dominio en una URL | `406-enlace-evidencias-webhook-identificador/{tasks.md:122, design.md:280, 293}`, `404-mensajero-en-webhook-y-api/design.md:222`, `288-variables-plantilla-desde-catalogo/design.md:138`, `426-api-401-json/requirements.md:6` | `app.example.com` o `example.com`, conservando la ruta |
| Dominio en prosa | `86-landing-publica/requirements.md:25, 58, 157` | «el sitio público de la app de origen» |
| Ruta local con el nombre de una persona | `44-wallet-pago-mensajeros/tasks.md:6`, `57-logout/design.md:4` | `<worktree-local>/<carpeta-de-la-feature>/` |

### Fuera de `specs/`

| Clase | Archivo:línea | Marcador |
|---|---|---|
| Ids Supabase en reglas de seguridad | `docs/perfil-agentes.md:10`, `docs/verification.md:36`, `docs/plan-saas.md:44` | la regla de R12, adaptada a la frase de cada doc |
| Ids Supabase en el inventario | `docs/limpieza-ordenex.md` §5 (l. 740, el comando `git grep` y su título) | «`git grep` con los dos ids de la app de origen (memoria local del leader)» |
| Ids Supabase en bitácoras | `progress/impl_SL-11.md:13`, `progress/impl_SL-13.md:169` | «los ids de proyecto Supabase de la app de origen» |
| Dominio y email de soporte | `progress/review_SL-10.md:103, 123, 124`, `progress/impl_SL-14.md:1`, `progress/review_SL-14.md:1` | «el dominio de origen» / «el email de soporte de origen». La guardia de SL-14 no recorre `progress/`, y la nueva sí. |
| URL de despliegue en un comentario | `tests/unit/guards/pwa-servida-sin-sesion.guardia.test.ts:10` | «el despliegue de producción de la app de origen» |

Son unas 45 apariciones en unos 27 archivos. T1 vuelve a medir, porque la rama puede haber
avanzado.

### Lo que no se marca

- **Dominio con excepción vigente de SL-14:** `app/_landing/*`, `app/page.tsx`, `app/globals.css`,
  `docs/api/**` y `openapi-406-evidencias-url.test.ts`.
- **Valores inventados, no recursos:**
  - el id GCP inventado de `google-route-optimization.test.ts`, que es de SL-15;
  - los emails de QA en el TLD `.test`;
  - los hosts `x.supabase.co`, `proyecto.supabase.co`, `pooler.supabase.co` y similares de los
    tests, que no tienen la forma de 20 letras;
  - los PEM y las claves falsas de `tests/unit/auth/*`, `route-optimization-config.test.ts` y
    `geocode-salud-service.test.ts`, que no tienen cuerpo de 40 caracteres o no tienen la forma
    exacta. T1 lo confirma: si alguno casa, se reescribe con un valor que no case.
- **`.mcp.json`:** usa `${SUPABASE_PROJECT_REF}`.

## Marcadores

| Clase | Marcador | Por qué no dispara la guardia |
|---|---|---|
| Supabase (ids y nombre) | prosa: «base/proyecto de producción de la app de origen» | No coincide con ningún hash. |
| GCP | `<GCP_PROJECT_ID>`, `<SA_EMAIL>` | `<` y `>` cortan el token, y no hay `@…iam`. |
| GitHub | prosa, sin URL | No hay `github.com/`. |
| Despliegue | prosa | No hay host. |
| Dominio | `example.com` / `app.example.com` | Es un dominio reservado. Es también lo que pide la guardia de SL-14. |
| Email | `<usuario>@example.com` o prosa | Dominio reservado. |
| Ruta local | `<worktree-local>/…` | No coincide con ningún hash. |

**La regla de seguridad (R12).** Cada uno de los 4 docs conserva su sentido con su propia frase. Por
ejemplo, en `docs/perfil-agentes.md`: «Nunca uses recursos de Ordenex: los proyectos Supabase de la
app de origen —sus ids están en la memoria local del leader, fuera del repo—. Si un `.env`, un MCP o
una variable apunta a uno de ellos, PARA y avisa». El marcador `<!-- perfil: revisado=… -->` no
cambia. `scripts/check-perfil.mjs` solo mira la fecha.

## Formas de secreto (R8)

Con un ancla de palabra y longitud mínima:

| Forma | Patrón |
|---|---|
| JWT, incluidas las claves `anon` / `service_role` de Supabase | `eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}` |
| Token de Supabase | `sbp_[a-f0-9]{40}` |
| GitHub | `gh[pousr]_[A-Za-z0-9]{36}` |
| Google API key | `AIza[0-9A-Za-z_-]{35}` |
| OpenAI / Anthropic | `sk-(ant-)?[A-Za-z0-9_-]{20,}` |
| Stripe | `[sr]k_live_[A-Za-z0-9]{20,}` |
| Secreto de webhook | `whsec_[A-Za-z0-9]{24,}` |
| Resend | `re_[A-Za-z0-9]{20,}_[A-Za-z0-9]{10,}` |
| Slack | `xox[abprs]-[A-Za-z0-9-]{10,}` |
| Clave privada PEM | `-----BEGIN [A-Z ]*PRIVATE KEY-----` seguido de al menos 40 caracteres base64 antes de `-----END` |
| URL de base con contraseña | `postgres(ql)?://[^:\s]+:[^@\s<>]{6,}@` cuya contraseña no sea un marcador (`<…>`, `${…}`, `password`, `postgres`) |

Una forma nueva entra con su contraprueba sintética.

## La guardia

`tests/unit/guards/recursos-origen-fuera.guardia.test.ts`. Es una lectura estática, y
`pnpm exec vitest run guard` la selecciona por su ruta.

**Universo (R13).** `git ls-files -z --cached --others --exclude-standard`, que nunca devuelve
`.git`. Se quitan los binarios con el criterio de `sin-integrador-de-ordenex`: un `\0` en los
primeros 8 KB. A diferencia de SL-14, `progress/` sí entra.

**Hashes (R1–R4, R9, R14).**

```ts
import { createHash } from "node:crypto";

interface Vigilado {
  clase: "supabase-ref" | "supabase-nombre" | "gcp" | "github" | "persona" | "estacion";
  largo: number;
  sha256: string; // hex del token en minúsculas; nunca el valor
}

/** Las 8 entradas se calculan en T1 con un script de un solo uso fuera del repo:
 *  ref de prod, ref de preview, nombre Supabase, id GCP, nombre corto GCP, cuenta de GitHub,
 *  nombre de la persona y nombre de la estación de trabajo. */
const VIGILADOS: readonly Vigilado[] = [ /* … */ ];

/** Tramos de [a-z0-9_-] en minúsculas, cortados en `.`, `@`, `/`, `\`, espacios y signos. */
export function tokens(texto: string): { token: string; linea: number }[];
```

- **Coste.** Solo se hashean los tokens cuyo largo coincide con el de algún vigilado; el largo es un
  dato inocuo. Además, cada archivo pasa primero por una prueba rápida y solo si da positivo se
  recorre línea a línea, como en `sin-integrador-de-ordenex`. T7 mide el tiempo de la guardia sobre
  todo el árbol y lo deja escrito. Si pasa de 20 s, se cachean los hashes por token.
- **Fuerza del hash.** Los dos ids de Supabase tienen 20 letras al azar (unos 94 bits) y no se
  pueden sacar del hash. El nombre GCP, el de Supabase, la cuenta de GitHub, el nombre de la persona
  y el de la estación son palabras: quien ya sospeche el valor puede confirmarlo con un diccionario.
  Aun así es mucho mejor que publicar el literal, y es lo que pidió el humano. Queda escrito para
  que nadie lo tome por cifrado.
- **Reporte (R15).** `ruta:línea · clase`. Nunca el token ni el texto de la línea.

**Forma (R5–R8).**
- vercel: `[a-z0-9-]+\.vercel\.app`;
- supabase: `\b[a-z]{20}\.supabase\.(co|com)\b` y `postgres\.[a-z]{20}\b`, el usuario del pooler;
- GitHub: `github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/(pull|issues|commit|tree|blob)\b`;
- service account: `@[a-z][a-z0-9-]{4,}\.iam\.gserviceaccount\.com`, salvo los marcadores de test
  `@proyecto.` y `@mi-proyecto.`;
- email: con un dominio no reservado;
- dominio: `lineasConDominio`, importado de la guardia de SL-14;
- secretos: las formas de la tabla anterior.

**Excepciones (R16).**
- Para la clase dominio, una ruta está exceptuada si y solo si la cubre una entrada de
  `EXCEPCIONES_DOMINIO`, importada de SL-14. La caducidad la exige la propia guardia de SL-14.
- Las demás clases no tienen excepciones. La lista propia (`{ ruta, clase, ficha, motivo }`) nace
  vacía y caduca igual que la de SL-14.
- El email de un test que ya use un dominio reservado no necesita excepción.

**Autoprueba sin valores (R14, R17).**
- El propio archivo de la guardia pasa por el detector y da cero.
- Cada `sha256` es hex de 64 caracteres y cada `largo` es mayor que 0.
- El suelo de archivos se firma con el número medido y su motivo, como `MINIMO_RUTAS` en
  `openapi-canal-rutas-reales.guardia.test.ts`.
- Contrapruebas sintéticas, con un vigilado falso hecho de un token inventado y su hash calculado en
  el test:

  | Texto | Resultado |
  |---|---|
  | el token suelto, en una URL, tras `@` y dentro de una ruta `R:/…/<token>/…` | 1 cada uno |
  | el token con una letra cambiada | 0 |
  | un subdominio inventado de vercel.app, armado en el test | 1 |
  | `<host>.vercel.app` | 0 |
  | 20 minúsculas inventadas + `.supabase.co` | 1 |
  | `proyecto.supabase.co` | 0 |
  | una URL de PR inventada | 1 |
  | `a@b.example.com` | 0 |
  | un email inventado en un dominio no reservado, armado en el test | 1 |
  | un JWT inventado | 1 |
  | `-----BEGIN PRIVATE KEY-----\n...` | 0 |
  | el dominio en una ruta con excepción de SL-14 | 0 |
  | el dominio en otra ruta | 1 |
  | cada marcador de la tabla de Marcadores | 0 |

**Verificación local (R18).** `RECURSOS_ORIGEN_REF` apunta a un archivo fuera del repo, con un
`clase=valor` por línea. Si existe, se afirma que cada valor da un `sha256` de `VIGILADOS` con su
clase y su largo. En CI no existe, y el caso aparece como `it.skip` con el nombre «R18 omitido: sin
RECURSOS_ORIGEN_REF».

## Ampliación R23: el integrador y sus clientes

- **Detector.** Los términos de SL-13 pueden tener más de una palabra. Se hashean como n-gramas de
  tokens (de 1 a 3 tokens unidos por un espacio, en minúsculas), y solo los n-gramas cuyo largo
  coincide con el de un vigilado. Clases nuevas: `integrador` y `cliente`.
- **Guardia de SL-13.** `TERMINOS_PROHIBIDOS` deja de ser una lista en claro: pasa a
  `{ largo, sha256 }` y su caso R1 usa el detector por hash, importado de la guardia nueva o
  equivalente. Sus casos de SL-13 (R2–R4, R15) siguen con el mismo sentido. Opción mínima: no se
  amplía su universo a `specs/` y `progress/`, porque la guardia nueva ya recorre todo el árbol.
- **Excepción temporal.** El slug de la ficha SL-13 en rutas y ramas. Se anota en la lista propia
  con su ficha y motivo; se retira cuando el leader renombre la ficha.
- **Marcadores.** «el integrador», «cliente A», «cliente B», «cliente C»: el mismo cliente lleva
  la misma letra en todo el árbol.
- **Inventario.** Se mide en T5b igual que en T1; hoy se estiman unos 30 archivos en `specs/`,
  `progress/deudas.md`, `progress/impl_SL-13.md` y `progress/review_SL-13.md`.

## Reglas de edición (R10, R11)

- Se cambia el valor y solo lo necesario para que la frase se entienda. No se añade ni se borra
  ninguna línea.
- La comprobación la hace el reviewer con un script de un solo uso sobre `git diff dev...HEAD`. En
  cada archivo modificado (salvo la guardia nueva y la guardia de SL-14), comprueba dos cosas:
  - `--numstat` da tantas líneas añadidas como quitadas;
  - en cada par `-`/`+`, las rutas `tests/…` / `e2e/…` y los `R<n>` son los mismos.
- En una tabla `R → test`, la fila se conserva con sus columnas.

## Modelo de datos, autorización y país

No aplica:
- no hay tablas, migraciones ni RLS;
- no cambia ninguna autorización;
- ningún dato depende del país.

## Dependencias

Ninguna librería nueva: `node:crypto`, `node:fs`, `node:child_process` y `vitest`.

## Alternativas descartadas

1. **Comparar contra el literal, armado por partes**, como el detector de dominio de SL-14. Unir dos
   mitades en el código publica el valor igual, y el humano lo prohibió. Sirve para el dominio, que
   ya es público, pero no para un id de proyecto.
2. **HMAC con una clave local en vez de SHA-256.** Protegería también los valores de baja entropía,
   pero CI no tiene la clave, así que la guardia no correría allí. Además habría que repartir la
   clave.
3. **Un escáner externo (gitleaks o trufflehog) en CI.** Detecta formas genéricas, pero no los ids
   concretos de la app de origen, que no tienen forma de secreto. Es una dependencia nueva, con
   aprobación y cuatro checks. Puede sumarse más adelante para las formas genéricas.
4. **Borrar las líneas o los specs afectados.** Rompe las tablas `R → test` y las citas que lee
   `test-citado-desaparecido`, y adelanta SL-27.
5. **Limitar la guardia a `specs/`.** Era la propuesta anterior. La descartó el leader: los ids
   también estaban en docs del perfil y en `progress/`, y una guardia parcial deja volver un valor
   por cualquier otro archivo.
6. **Dejar los ids en los docs del perfil porque «los agentes los necesitan».** Publicaría los ids en
   un repo público. La regla de parar se conserva, y el dato que la alimenta vive en la memoria local
   del leader.

## Riesgos

- **Los valores fuera del repo.** Los hashes se calculan desde los valores que hay hoy en el árbol,
  antes de editarlos. El script vive en el scratchpad y no se versiona. Ningún valor va a
  `progress/impl_SL-34.md` ni a un mensaje de commit.
- **La historia de esta rama.** El diff de esta feature muestra los valores en las líneas `-`. No
  importa, porque el leader publica una rama huérfana; pero esta rama no debe empujarse a ningún
  remoto público.
- **Los agentes y la regla de Supabase.** Sin los ids en `docs/`, un agente que no tenga la memoria
  local del leader no puede comprobar un `.env` por sí solo. La regla le dice que pregunte al leader
  antes de usar un `.env` o un MCP de Supabase.
- **Falsos positivos de forma en el árbol completo** (HTML minificado de maquetas o el lockfile). T1
  los mide. Si aparece uno que no sea un recurso, se arregla el texto o se añade una excepción con
  ficha, nunca una excepción permanente.
