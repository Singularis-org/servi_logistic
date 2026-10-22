# SL-34 — Quitar del árbol las referencias a recursos reales de la app de origen

> Zona: fullstack · Complejidad: low · depends_on: — · Rama: `feature/SL-34-specs-sin-recursos-origen`
>
> **Alcance.** El repo va a ser **público**. Antes del primer push hay que limpiar **todo el árbol
> versionado**: `specs/` heredados, `docs/` (incluidos los del perfil), `progress/`, código y tests.
> Se tocan **solo las líneas** que nombran un recurso real de la app de origen:
> - los ids y el nombre de sus proyectos Supabase;
> - su proyecto de Google Cloud y su service account;
> - su cuenta de GitHub y las URL a su repositorio;
> - su dominio público y sus URL de despliegue;
> - los emails reales;
> - las rutas locales con el nombre de una persona;
> - cualquier cadena con forma de secreto.
>
> Cada aparición se reescribe con un marcador neutro de su clase. Ningún spec se retira, ninguna
> fila citada se borra y ningún test que lee esos archivos se rompe. Las reglas de seguridad que
> usaban los ids de Supabase se reescriben sin ellos. Una guardia sobre todo el árbol impide que los
> valores vuelvan, sin publicar lo que vigila: compara por hash SHA-256 o por la forma, nunca contra
> el literal.
>
> Ni este spec ni la guardia escriben ninguno de los valores buscados: se nombran por su clase.
>
> **Lo que NO entra.**
> - Retirar los `specs/` heredados: es SL-27.
> - El nombre de la app de origen cuando no es un recurso: es SL-15, SL-16 y SL-27. Esto incluye
>   el id GCP inventado de `tests/unit/clients/google-route-optimization.test.ts` y los emails
>   ficticios en el TLD reservado `.test`.
> - El dominio que siguen teniendo `app/_landing/*`, `app/page.tsx`, `app/globals.css`, `docs/api/**`
>   y `tests/unit/api/openapi-406-evidencias-url.test.ts`. Ya son excepciones temporales de SL-14,
>   y las retiran SL-8 y SL-16.
> - La historia de git: el leader publica una rama huérfana (ver Decisiones cerradas).
> - Cualquier archivo listado en `arnes.manifest`.

## Requisitos (EARS)

### Lo que no puede quedar en el árbol versionado

- **R1.** Ningún archivo versionado DEBE contener el id del proyecto Supabase de producción de la app
  de origen ni el de su proyecto de preview.
- **R2.** Ningún archivo versionado DEBE contener el nombre del proyecto Supabase de la app de origen.
- **R3.** Ningún archivo versionado DEBE contener el id ni el nombre del proyecto de Google Cloud de la
  app de origen, ni una dirección `@<proyecto>.iam.gserviceaccount.com` de un proyecto que no sea
  un marcador.
- **R4.** Ningún archivo versionado DEBE contener la cuenta de GitHub de la app de origen ni una URL
  `github.com/<dueño>/<repo>/(pull|issues|commit|tree|blob)…` al repositorio de origen.
- **R5.** Ningún archivo versionado DEBE contener un host `<algo>.vercel.app` ni un host
  `<ref>.supabase.co`, donde `<ref>` tiene la forma de un id de proyecto: 20 letras minúsculas.
- **R6.** Ningún archivo versionado DEBE contener el dominio público de la app de origen, salvo los que
  cubre una excepción temporal vigente de `tests/unit/guards/dominio-ordenex-fuera.guardia.test.ts`.
- **R7.** Ningún archivo versionado DEBE contener un email cuyo dominio no esté reservado. Los
  reservados son `example.com`, `example.net` y `example.org`, y los TLD `.example`, `.test`,
  `.invalid` y `.localhost` (RFC 2606/6761).
- **R8.** Ningún archivo versionado DEBE contener una cadena con alguna de las formas de secreto de
  `design.md > Formas de secreto`.
- **R9.** Ningún archivo versionado DEBE contener una ruta local que incluya el nombre de una persona
  del equipo de origen ni el nombre de su estación de trabajo.

### Cómo se reescribe

- **R10.** CUANDO se reescribe una aparición, el cambio DEBE quedarse dentro de su línea:
  - ningún archivo se borra;
  - cada archivo tocado conserva su número de líneas;
  - toda cita a un test (`tests/…`, `e2e/…`) y todo `R<n>` de la línea siguen en ella, idénticos.
- **R11.** Cada aparición reescrita DEBE llevar el marcador de su clase (`design.md > Marcadores`), y
  ese marcador NO DEBE cumplir ninguno de los patrones de R1–R9.
- **R12.** Las reglas de seguridad de `docs/perfil-agentes.md`, `docs/verification.md`,
  `docs/plan-saas.md` y `docs/limpieza-ordenex.md` §5 DEBEN seguir diciendo qué hacer y cuándo
  parar, sin los ids: «los proyectos Supabase de la app de origen —sus ids están en la memoria local
  del leader, fuera del repo—; si un `.env` o un MCP apunta a uno de ellos, PARA».

### La guardia

- **R13.** La guardia DEBE recorrer todo lo versionado, más lo no versionado que no está ignorado,
  salvo `.git` y los binarios.
- **R14.** La guardia DEBE detectar R1–R4 y R9 comparando el SHA-256 de cada token del texto contra
  una lista de hashes, y R5–R8 por la forma. NO DEBE contener ninguno de los valores que vigila; se
  comprueba pasando el propio archivo de la guardia por su detector, que da cero.
- **R15.** CUANDO la guardia encuentra una aparición, DEBE fallar nombrando el archivo, la línea y la
  clase, y NO DEBE imprimir el valor encontrado.
- **R16.** Toda excepción DEBE ser temporal y nombrar la ficha que la retira y su motivo. Las únicas
  excepciones son las de la clase dominio que cubre la lista vigente de SL-14, que se importa y no
  se copia. SI una excepción propia ya no cubre ninguna aparición, ENTONCES la guardia DEBE fallar
  pidiendo retirarla.
- **R17.** La guardia DEBE fallar en estos casos:
  - SI recorre menos archivos que el suelo firmado;
  - SI algún hash registrado no tiene 64 caracteres hexadecimales.

  Su detector DEBE probarse con textos sintéticos: uno por clase, cada uno con su resultado
  esperado, más un caso que no debe marcarse por cada marcador de R11.
- **R18.** DONDE exista un archivo de referencia local fuera del repositorio, indicado por la variable
  `RECURSOS_ORIGEN_REF`, la guardia DEBE comprobar que sus valores producen exactamente los hashes
  registrados. SI la variable no está definida, ENTONCES ese caso DEBE omitirse y decirlo en el
  nombre del caso.

### Convivencia con lo que ya existe

- **R19.** CUANDO las líneas con el dominio de origen ya no estén en `specs/`, la lista de excepciones
  de `tests/unit/guards/dominio-ordenex-fuera.guardia.test.ts` NO DEBE conservar las 6 entradas de
  `specs/` que ya no cubren nada, y esa guardia DEBE seguir en verde.
- **R20.** Los tests que leen los archivos editados (`specs/`, `docs/`) DEBEN seguir en verde. Entre
  ellos están `test-citado-desaparecido`, `no-embalaje`, `sin-integrador-de-ordenex` y los que leen
  tablas de spec. Solo se modifica un test cuando la línea editada está en él: el comentario de
  `pwa-servida-sin-sesion.guardia.test.ts`.
- **R21.** El cambio NO DEBE modificar ningún archivo listado en `arnes.manifest`. Fuera de las líneas
  de R1–R9 y de R12, solo puede añadir la guardia nueva, la poda de R19 y `progress/impl_SL-34.md`.
- **R22.** CUANDO se corre `./init.sh` en el worktree de la feature, el gate DEBE terminar con código 0.

### Ampliación: los clientes del integrador de origen

- **R23.** Ningún archivo versionado DEBE contener, sin distinguir mayúsculas, el nombre del
  integrador de origen ni el de ninguno de sus tres clientes reales (los términos que veta
  `tests/unit/guards/sin-integrador-de-ordenex.guardia.test.ts`), ni siquiera esa guardia. Cada
  aparición se reescribe en su línea con las reglas de R10 y un marcador neutro: «el integrador»,
  «cliente A», «cliente B», «cliente C». La única excepción es el slug de la ficha SL-13 en rutas y
  ramas (`specs/SL-13-…/`), que es temporal: renombrarlo cambia la ficha del board y las citas, y
  queda anotado para el leader. La vigilancia es por hash SHA-256, como R14: la guardia nueva
  incorpora los términos como vigilados de las clases `integrador` y `cliente` y recorre todo el
  árbol, y la guardia de SL-13 deja de contener los términos en claro.

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-22 | ¿Se limpia antes del primer push? | Sí, es un requisito del primer push público (humano). → R1–R9, R22 |
| 2026-10-22 | ¿Se retiran los specs heredados? | No: solo se editan líneas; retirarlos es SL-27 (humano). → R10, R20 |
| 2026-10-22 | ¿Se puede romper un test que lee `specs/`? | No: se edita la línea, nunca se borra una fila citada (humano). → R10, R20 |
| 2026-10-22 | ¿Pueden escribirse los valores en el spec o en la guardia? | No: se nombran por su clase, y la guardia compara por hash SHA-256 o por la forma (humano). → R14, R15, R17 |
| 2026-10-22 | ¿Y la historia de git, que conserva los valores? | No es de esta ficha. El leader publica una rama huérfana con un único commit del árbol limpio, y la historia vieja se queda solo en local (leader, por delegación del humano). → fuera de alcance |
| 2026-10-22 | ¿Solo `specs/` o todo el árbol? | Todo el árbol versionado, incluidos `docs/` y `progress/` y el comentario de `pwa-servida-sin-sesion.guardia.test.ts`. La guardia recorre todo salvo `.git` y las excepciones temporales de SL-14 que retiran SL-8 y SL-16 (leader, por delegación). → R1–R9, R13, R16, R21 |
| 2026-10-22 | ¿Las reglas de seguridad con los ids de Supabase? | Se reescriben sin los ids en los 4 docs: los ids pasan a la memoria local del leader, y la regla de parar se conserva. Está permitido tocar docs del perfil (leader, por delegación). → R12 |
| 2026-10-22 | ¿Las rutas locales con el nombre de una persona? | Entran, y se sustituyen por una ruta neutra (leader, por delegación). → R9 |
| 2026-10-22 | ¿El id GCP inventado con el nombre de origen en un test? | Es de SL-15 y no se toca (leader, por delegación). → Lo que NO entra |
| 2026-10-22 | ¿Entran los clientes reales del integrador de origen? | Sí, en todo el árbol, con edición de línea y marcadores neutros (leader, con el mandato del humano). Opción mínima elegida por el implementer: la guardia nueva los vigila por hash y la de SL-13 pasa a hashes, porque una lista en claro los publicaría. → R23 |
| 2026-10-22 | ¿`e2e/marca.spec.ts` y la clave de `google-sa-token.test.ts`? | El id de Supabase de `e2e/marca.spec.ts` entra en el inventario: si es un literal que se compara, pasa a hash o a forma. La clave de `google-sa-token.test.ts` se genera en tiempo de ejecución y no se toca (leader). → R1, R8 |
