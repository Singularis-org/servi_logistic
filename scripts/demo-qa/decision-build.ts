// SL-43 (design §10.1; R29, R30) — si el paso de demo del build corre o se omite. Pura, con la forma de
// `decidirMigracion` (`scripts/migrate-deploy-guardas.ts`): sin env, ni proceso, ni red.
//
// Omitir no abre ninguna conexión: un despliegue de producción, o el preview de otra rama, no cambia en
// nada. Cuando corre, siguen las tres capas de `guardia-entorno.ts`: esta decisión no las sustituye.

/** Lo que mira la decisión. Acepta `process.env` tal cual. */
export type EnvDecisionDemo = Readonly<{
  VERCEL_ENV?: string;
  MIGRATE_ON_PREVIEW?: string;
  DEMO_ON_PREVIEW?: string;
}>;

export type DecisionDemo = { correr: true } | { correr: false; motivo: string };

export function decidirDemo(env: EnvDecisionDemo): DecisionDemo {
  const { VERCEL_ENV: vercelEnv, MIGRATE_ON_PREVIEW: migrar, DEMO_ON_PREVIEW: demo } = env;

  if (vercelEnv === "production") {
    // La variable es solo de Preview para `dev`. Puesta en producción no hace nada, pero alguien se
    // equivocó de ámbito en Vercel y conviene que lo lea.
    const aviso = demo !== undefined && demo !== "" ? " (DEMO_ON_PREVIEW está puesta en producción: quítala)" : "";
    return { correr: false, motivo: `producción nunca recrea la demo${aviso}` };
  }

  if (vercelEnv === "preview") {
    // Primero las migraciones: la demo escribe con el esquema de esta rama, y sin migrar la columna
    // `es_demo` o las tablas de la receta podrían no existir. Es además la declaración que ya existe de
    // que la base de este preview es de pruebas.
    if (migrar !== "true") {
      return {
        correr: false,
        motivo: "sin migraciones en este preview (MIGRATE_ON_PREVIEW distinto de true): el esquema podría no ser el de esta rama",
      };
    }
    // Valor exacto, como `MIGRATE_ON_PREVIEW`: un «TRUE» o un «1» no encienden un paso que borra datos.
    if (demo !== "true") {
      return { correr: false, motivo: "preview sin DEMO_ON_PREVIEW=true" };
    }
    return { correr: true };
  }

  if (vercelEnv === undefined || vercelEnv === "") {
    return { correr: false, motivo: "build local (sin VERCEL_ENV): usa `pnpm demo:qa`" };
  }

  return { correr: false, motivo: `entorno '${vercelEnv}': la demo solo corre en los previews de QA` };
}
