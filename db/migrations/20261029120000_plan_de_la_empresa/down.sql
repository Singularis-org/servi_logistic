-- SLT-58 — revierte 20261029120000_plan_de_la_empresa. Quita la lectura de «Mi plan»; no hay datos
-- que perder (un DROP FUNCTION no exige DESTRUCTIVA.md). Los topes y el catálogo de SL-24 no cambian.

DROP FUNCTION plan_de_la_empresa(text);
