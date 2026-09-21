# Idempotencia y transacciones con PostgreSQL

Segunda muestra del ERP: cómo conservar una única recepción ante reintentos concurrentes, rechazar una clave reutilizada con otro contenido y revertir escrituras parciales.

## Procedencia

`src/purchaseReceipts.js`, `src/apiPrimitives.js` y `test/purchaseReceiptValidation.test.js` son extractos sin modificaciones de la versión privada revisada del ERP del 21/09/2026. Sus hashes Git se contrastaron con esa versión antes de seleccionarlos. Se revisó su contenido completo para publicación; no se copió historial, configuración ni datos operativos.

El esquema SQL, los datos ficticios, las pruebas de concurrencia y la automatización de este directorio fueron creados para esta muestra. **El esquema no es una copia de las migraciones del ERP.** Incluye solo las tablas y restricciones necesarias para ejecutar este módulo. No demuestra las demás reglas de inventario del sistema.

## Ejecutar las pruebas

Node.js 24. Las seis pruebas unitarias no necesitan servicios ni dependencias instaladas:

```sh
cd idempotency
npm test
```

Para integración, instalar el cliente PostgreSQL con el lockfile:

```sh
npm ci --ignore-scripts
```

Crear una base **desechable** con Docker, enlazada únicamente a localhost:

```sh
docker run --rm -d --name erp-sample-postgres \
  -p 127.0.0.1:55432:5432 \
  -e POSTGRES_USER=sample \
  -e POSTGRES_PASSWORD=disposable-sample-only \
  -e POSTGRES_DB=erp_sample postgres:16
```

Esperar hasta que `docker exec erp-sample-postgres pg_isready -U sample -d erp_sample` indique que acepta conexiones. En una terminal POSIX:

```sh
SAMPLE_DATABASE_URL='postgres://sample:disposable-sample-only@127.0.0.1:55432/erp_sample' npm run test:integration
```

La contraseña anterior es pública, ficticia y exclusiva del contenedor desechable. No corresponde a ningún acceso de la empresa. Las pruebas solo aceptan localhost y el nombre `erp_sample`, crean un esquema aleatorio y lo eliminan al terminar. No apuntar a una instancia con datos que se quieran conservar.

Al finalizar:

```sh
docker stop erp-sample-postgres
```

## Qué comprueban las pruebas de integración

| Escenario | Aserción observable |
|---|---|
| Ocho solicitudes concurrentes con igual actor, clave y contenido | Una creación, siete reutilizaciones, una recepción, una línea y un movimiento de 500 unidades |
| Misma clave con cantidad diferente | Conflicto 409; ninguna fila adicional |
| Misma clave desde otro actor | Operación independiente: la unicidad incluye actor y clave |
| Error SQL inyectado después de insertar una línea | Rollback sin recepción ni línea residual; reintento posterior exitoso |
| Material inexistente | Rechazo y reversión de la cabecera provisional |

Se comprueban tablas reales de PostgreSQL, no un simulador en memoria. El error SQL inyectado es exclusivo del adaptador de prueba, sin cambios en el módulo publicado.

## Lectura del código

1. Normalizar el contenido antes de calcular su huella: el orden de líneas no cambia la intención.
2. Insertar con una restricción única por actor y clave; `ON CONFLICT` coordina solicitudes simultáneas.
3. En un reintento, recuperar el registro y comparar su huella: una clave no permite cambiar silenciosamente la operación.
4. Escribir recepción, líneas y movimientos en una transacción. Ante error, solicitar rollback y liberar la conexión.

## Límites y decisiones para discutir

- Este módulo presupone autenticación y autorización anteriores. `actorSubject` debe provenir de una identidad confiable; no de un campo controlado por el cliente.
- La huella es SHA-256 del contenido normalizado. No es firma, secreto ni prueba de autoría.
- El alcance es actor + clave: dos actores pueden registrar intenciones iguales con esa clave. Evitar duplicados de negocio entre actores necesita otra regla.
- Los casos de concurrencia usan PostgreSQL con su aislamiento predeterminado READ COMMITTED. Otro aislamiento requiere revisar reintentos ante conflictos.
- No se demuestra entrega exactamente una vez, tolerancia a todas las caídas, comportamiento bajo carga ni integración con sistemas externos.
- El módulo conserva ramas opcionales de precios y proveedores; estos cinco escenarios de integración se centran en recepciones sin precios. No se declara cobertura completa del módulo.
- La prueba de rollback introduce un error antes del movimiento; no ensaya un corte de red durante COMMIT.
- Un escaneo por patrones comunes y una revisión manual acotada no certifican todo el ERP.

## Resultados

Las seis pruebas unitarias se ejecutaron localmente y pasaron. La integración PostgreSQL se ejecuta en el workflow [Public code samples](https://github.com/Dante2617012022/camdis-erp-case-study/actions/workflows/samples.yml); consultar allí el resultado del commit evaluado. La suite anterior de permisos conserva sus 19 pruebas. Estos resultados son independientes de las 393 pruebas históricas del ERP completo.

[Volver al caso de estudio](../README.md)
