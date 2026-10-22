# servi_logistic — plan del SaaS

> Escrito el 2026-10-21 al crear el repo. Este documento manda sobre cualquier cosa de Ordenex
> que se cuele en el código, los docs o los specs heredados.

## Qué es

Un SaaS multi-empresa de logística de última milla, derivado de **Ordenex**. Es una app nueva, con
otro nombre, logo y colores. Las empresas se dan de alta solas, los módulos se encienden y apagan,
y cada plan tiene límites.

## Origen del código

- Copia del árbol del repo de Ordenex, rama `dev`, en el commit
  `f34f0f6d78fbe8f30eaaa6da8086168b7e77d220` (2026-10-21), **sin** `progress/`.
- `specs/` se copió porque varios tests leen archivos de ahí. Son specs de Ordenex: sirven como
  documentación del comportamiento heredado, no como backlog. Los ids de feature de servi_logistic
  empiezan de cero.
- El arnés es la v2 de `singularis-co/harness_config` (ver `arnes.manifest`). Los docs del perfil
  (`docs/architecture.md`, `docs/conventions.md`, `docs/verification.md`) vienen de Ordenex y hay
  que revisarlos en `/arnes-init`.
- Quedaron fuera de la copia las features 419 y 486 de Ordenex, que seguían en curso ese día.

## Decisiones del humano (Carlos, 2026-10-20/21)

1. **Una sola base compartida**, con los datos separados por `organizacion_id`. No una base por empresa.
2. **Varios países desde el principio.** La geografía, la moneda, los impuestos y los métodos de
   pago son configuración.
3. **Ordenex NO entra.** Son apps distintas, en repos distintos, sin datos compartidos.
4. **Servi Logistic es solo la plataforma** (2026-10-21). Quien cobra, paga, debe o gana es la
   empresa usuaria: esos textos llevan el nombre de la empresa, nunca «Servi Logistic». Lo técnico
   de la plataforma (cabeceras del webhook, prefijos de llaves, claves de storage) sí lleva su nombre.
5. **La app nace limpia y vacía** (2026-10-21). Sin seeds de datos: el único usuario que nace con la
   app es el **superadmin**, y desde él cada rol puebla lo que le toca. Las zonas nacen vacías (las
   crea cada empresa); lo único que se dispone de serie es la geografía del país.
6. **«Ordenex» desaparece del todo** (2026-10-21). Código, UI, tests, migraciones y docs de la app:
   no queda nada; se reemplaza por lo que corresponda (plataforma, empresa o término neutro). Una
   excepción solo puede ser temporal y con la ficha que la retira. `specs/` heredados se retiran
   más adelante, cuando sea seguro.

## Reglas de seguridad

- **Ningún recurso de Ordenex:** ni Supabase, ni Vercel, ni llaves, ni seeds.
  - Los proyectos Supabase de Ordenex (PRODUCCIÓN y preview) tienen sus ids en la memoria local del leader, fuera del repo. Si un
    MCP o un `.env` apunta a cualquiera de los dos, PARA.
  - `.mcp.json` lee `SUPABASE_PROJECT_REF`; antes de escribir, confirma con `get_project_url`.
- El repo de GitHub `singularis-co/servi_logistic` era **PÚBLICO** el 2026-10-21. No se empuja nada
  hasta que el humano lo haga privado.
- Al empezar, trabaja en local: la base de datos en local y nada desplegado.

## Estado del arnés (2026-10-21)

El arnés v2 está **copiado, pero no configurado**. Falta `/arnes-init`, y sin `arnes.config.json`
el `./init.sh` falla a propósito. Para terminarlo hace falta el humano:
- el sitio y el proyecto de Jira, los estados del board y `/jira-connect` (crea `.arnes.local.json`);
- las ramas de integración y de producción (en local existen `dev` y `main`);
- CI: si hay GitHub Actions, adaptar `plantillas/github/gate.yml` a `.github/workflows/gate.yml`;
- la revisión de los docs del perfil heredados de Ordenex (`architecture`, `conventions`,
  `verification`) y rellenar `dependencias`, `perfil-agentes` y `checkpoints-proyecto`.

## Qué es «limpiar Ordenex»

La lista medida, con la regla para decidir, está en `docs/limpieza-ordenex.md`.

## Fases, en orden

1. **Copia limpia.**
   - `pnpm install`, una base Postgres local, `prisma migrate deploy` y el gate en verde.
   - Fuera los datos de negocio de Ordenex:
     - los xlsx de zonas de `public/` y `scripts/seed-zonas.ts`;
     - los seeds de usuarios QA y de maestro (`scripts/seed-maestro.ts`);
     - los integradores;
     - el dominio de Ordenex en la landing, los docs de la API, `lib/config/push.ts` y `lib/utils/linkificar.ts`;
     - los `docs/` propios de las releases de Ordenex.
2. **Varias empresas en la misma app.**
   - Una tabla `organizacion` y `organizacion_id` en todas las tablas de negocio.
   - Aislamiento con RLS más el filtro en cada repositorio.
   - Los únicos y las secuencias, por empresa; por ejemplo `orden_num_guia_seq`, que hoy es global.
   - La cola `jobs` y el storage, también por empresa.
3. **País configurable.** Hoy el código está atado a Costa Rica: unos 160 archivos con provincia,
   cantón y distrito, 95 con SINPE y 85 con colones.
4. **Módulos que se encienden y apagan.** Hay un catálogo de módulos y una tabla con los activos de
   cada empresa. Se comprueba en el menú (`lib/auth/menu-visibility.ts`), en las rutas y, sobre
   todo, en las server actions y los jobs.
5. **Planes y límites.** Se cuentan en el servidor, dentro de la misma transacción del alta.
6. **Registro de empresas y panel de superadmin.**
7. **Marca.** Nombre, logo y colores como tokens. Va al final.

## Lo que falta del humano

- Para la fase 1: nada más que el repo y esta carpeta, en local.
- Para desplegar: dos proyectos Supabase (prod y preview), un MCP propio, un proyecto en Vercel con las
  variables separadas por entorno, el dominio y llaves nuevas de cada servicio externo.
- Para fases posteriores: la marca (logo SVG y paleta), la lista de países, los planes y sus límites,
  el proveedor de cobro y los textos legales.

## Sincronía con Ordenex

Desde el 2026-10-21 son dos códigos separados: un arreglo en Ordenex no llega solo. Al cerrar una
ficha en Ordenex se decide si se porta. Si se porta, se hace así:
1. `git diff --binary <base>..<head de la rama> -- . ':(exclude)progress' ':(exclude)feature_list.json'`;
2. `git apply` aquí, con un commit por feature que nombre el PR de origen.

| Ordenex | PR | Commit aquí |
| --- | --- | --- |
| 486, todas las fotos de evidencia en los cierres | #866 | `92649dc` |
| 419, la central confirma la entrega a la tienda con comprobante | #867 | `c1b051d` |

**Último commit de Ordenex `dev` incluido:** `b333d901` (2026-10-21). Lo siguiente que se porte
parte de ahí.
