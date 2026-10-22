---
description: Monta el arnes en un proyecto nuevo (cuestionario → perfil) o revisa el perfil de uno existente
argument-hint: [revisar]  (sin argumento: detecta si es proyecto nuevo o existente)
---

Vas a dejar el **perfil del proyecto** al día. El perfil es todo lo que cambia de un proyecto a
otro: `arnes.config.json` y los docs que lista su `perfil.docs`. El arnés (lo que lista
`arnes.manifest`) **no se toca aquí**.

Modo pedido: **$ARGUMENTS**

## 0. Detecta el modo

- **Montaje:** no existe `arnes.config.json`, o `perfil.docs` apunta a plantillas sin rellenar
  (contienen `<!-- PLANTILLA -->`).
- **Revisión:** ya existe un perfil. Ocurre cuando el gate avisó de un doc vencido o cuando el
  humano lo pide.

Dilo en una línea y sigue.

## 1. Mira antes de preguntar

No preguntes lo que el repo ya responde. Lee e inventaria, sin pegar nada en el chat:
- `package.json`: framework y versión, ORM, librería de tests, scripts `typecheck`/`lint`/`test*`,
  dependencias.
- El árbol de carpetas del código (2 niveles) y la configuración de tests (`vitest.config.*`,
  `jest.config.*`, `playwright.config.*`).
- El esquema de datos (`prisma/schema.prisma`, `db/schema.prisma`, migraciones) y `.env.example`
  (solo los nombres de variables).
- Las ramas remotas (`git branch -r`).
- En modo revisión: los docs actuales del perfil, y además `_trabajo/perfil-desactualizado.md` o
  los avisos del gate si existen.

## 2. Cuestionario

Pregunta **solo** lo que el paso 1 no resolvió o dejó ambiguo. Usa `AskUserQuestion`, como
máximo 4 preguntas por tanda, y pon siempre como primera opción lo que el repo sugiere. Los ejes:

1. **Producto y dominio:** qué hace el sistema y para quién. ¿Es multi-empresa o multi-tenant?
   ¿Qué datos son sensibles?
2. **Arquitectura:**
   - capas o módulos y sus reglas de dependencia;
   - dónde vive la lógica de negocio;
   - cómo se accede a datos;
   - dónde se valida la autorización.
3. **Stack de UI:** librería de componentes, estilos, data fetching. ¿Hay requisitos de
   plataforma (móvil, iOS)?
4. **Verificación:**
   - comandos de typecheck, lint y tests;
   - qué tests recorren el árbol de archivos en vez de importar lo que vigilan (contratos, alcance):
     sus patrones van a `gate.siempre` para que el gate rápido los corra (mide el tiempo que suman);
   - cómo se aíslan los tests de integración (base propia, contenedores, dobles);
   - qué flujos son críticos y exigen E2E;
   - qué servicios externos se doblan en tests.
5. **Dependencias:** ¿las actuales están aprobadas? ¿Quién aprueba las nuevas?
6. **Equipo y board:**
   - sitio y proyecto de Jira;
   - estados del board: el nombre de cada uno en Jira y a qué estado del arnés traduce
     (`pending`, `spec_ready`, `in_progress`, `done`, `cancelled`). Se leen del board, no se
     suponen (`docs/jira.md > Los estados del board`);
   - ramas de integración y producción: pregúntalas **siempre**, una por una, con las ramas de
     `git branch -r` como opciones. Nunca supongas `main`, `master` ni `dev`;
   - cupo por persona y zona (por defecto 2/3/3).
7. **CI:** ¿GitHub Actions disponible? ¿Plan gratuito (minutos limitados, sin protección de
   ramas en repos privados)? ¿Qué variables necesita la suite en una máquina limpia?

En modo revisión, por cada doc del perfil:
- muestra en 3–6 líneas lo que hoy afirma lo esencial;
- pregunta "¿sigue siendo cierto? ¿qué cambió?";
- contrasta con lo que viste en el paso 1. Si el doc dice X y el código dice Y, pregúntalo así,
  con las dos versiones.

## 3. Escribe

- **`arnes.config.json`:** `arnes_version` (la de `arnes.config.example.json` si existe),
  `jira` (`site`, `project`, `estados`), `ramas`, `cupos_por_persona`, `gate` (`siempre`, con `"guard"` como mínimo) y `perfil` (`max_dias_sin_revisar`, `docs`).
- **`.github/workflows/gate.yml`:** pon las dos `ramas` en `on.pull_request.branches` y la de
  producción en el `github.base_ref == '<rama>'` del job E2E. GitHub no lee el JSON;
  `scripts/check-perfil.mjs` hace fallar `./init.sh` si difieren.
- **Los docs del perfil:** en montaje, desde las plantillas `docs/*.md` que traen
  `<!-- PLANTILLA -->`. En revisión, edita solo lo que cambió.
  - La primera línea de cada doc es `<!-- perfil: revisado=<hoy AAAA-MM-DD> por=<nombre de
    .arnes.local.json> -->`.
  - Formato: la regla arriba, en imperativo; el porqué en `### Por qué` al final de cada
    sección (`docs/lectura.md`).
  - **No inventes** (CLAUDE.md regla 6): lo que no se respondió queda como
    `> ABIERTO: <pregunta>`.
- **`docs/dependencias.md`:** una fila por cada dependencia de `package.json`. Las que no tengan
  aprobación conocida van con estado `pendiente-de-aprobar`, y se avisa al humano.
- **CI:** si el proyecto no tiene `.github/workflows/gate.yml`, copia el ejemplo `plantillas/github/gate.yml` de la plantilla (o el de este repo) y propón cómo adaptarlo
  (servicios, variables, versión de Node). No escribas secretos.

## 4. Verifica y entrega

1. Si falta `.arnes.local.json`, corre `/jira-connect`.
2. `./init.sh`: debe salir en verde, y el perfil en `N/N docs revisados`.
3. Muestra al humano el diff del perfil (`git diff --stat` y lo esencial de cada doc). **No
   hagas commit sin su visto bueno.**
4. Devuelve: los archivos tocados, las preguntas que quedaron `ABIERTO` y el siguiente paso.
