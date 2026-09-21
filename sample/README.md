# Muestra ejecutable — política de anulación y validaciones

Extracto adaptado de dos módulos del ERP Camdis. Permite revisar código real y ejecutar pruebas sin acceder a la empresa, instalar dependencias ni configurar servicios.

## Ejecutar

Con Node.js 22 o posterior, desde este repositorio:

```sh
cd sample
npm test
```

No hace falta `npm install`. Se utilizan exclusivamente módulos incluidos en Node.js. La ejecución no abre puertos ni conecta a bases de datos.

## Recorrido de revisión (5 minutos)

1. Leer `src/productionVoidPolicy.js`: autor de la operación, ventana temporal, permisos especiales y restricciones que prevalecen incluso ante privilegios.
2. Leer `test/productionVoidPolicy.test.js`: casos permitidos, rechazos y límite exacto de la ventana temporal.
3. Leer `test/securityBoundaries.test.js`: pruebas adicionales sobre identidades inválidas, separación de actores y restricciones.
4. Revisar `src/productionCorrectionPrimitives.js` y sus tests: enteros seguros, identificadores, claves de idempotencia y huellas SHA-256.

## Procedencia y adaptación

Los dos módulos y sus pruebas originales se extrajeron de la revisión de mantenimiento del ERP del 21/09/2026, comprobando sus hashes Git contra la versión privada consultada. No se copió el historial del repositorio privado.

Se conservaron las funciones y su lógica. Los nombres de roles se sustituyeron por `SAMPLE_OPERATOR`, `SAMPLE_ADMIN` y `SAMPLE_SUPERVISOR`; las identidades de prueba son ficticias. Los nombres de roles y valores de esta muestra no deben interpretarse como configuración de la empresa. Se agregaron cinco pruebas de límites de seguridad, este paquete independiente y la documentación para su revisión pública. No se incluye la integración HTTP, identidad, persistencia, despliegue ni el resto del dominio.

## Contrato y límites importantes

- **Es una política de dominio, no autenticación ni un middleware de autorización.** El servidor que la utiliza debe autenticar al actor, autorizar el acceso a la operación y obtener los roles de una fuente confiable. Nunca se deben tomar `actorRoles` o `actorSubject` del cuerpo enviado por un cliente.
- La propiedad de una operación puede permitir anularla aunque no exista un rol privilegiado: se presupone que el permiso general de acceso ya se comprobó antes. Un resultado `canVoid` no basta para autorizar una ruta.
- Las fechas provienen de registros normalizados y de un reloj del servidor. El conversor utiliza `Date` de JavaScript: no es un validador estricto de entradas HTTP (por ejemplo, `null` se convierte en época Unix). Tampoco rechaza fechas futuras. La capa de entrada y las reglas temporales deben validarlas antes.
- La muestra evalúa una decisión; no modifica inventario, persiste auditoría ni ejecuta transacciones. Entre evaluar y escribir, el sistema real debe mantener consistencia ante concurrencia.
- Validar una clave y calcular un hash **no implementa idempotencia**: faltan normalización del contenido, unicidad, persistencia y manejo de reintentos.
- SHA-256 se usa como huella del contenido, no como firma, autenticación o algoritmo de almacenamiento de contraseñas.
- Los tests reproducen únicamente estos módulos. No equivalen a las 393 pruebas históricas del ERP ni a una auditoría independiente.

## Revisión de publicación

Se revisó el conjunto seleccionado antes de publicarlo: código, tests, documentación y metadatos del paquete. Se comprobaron patrones comunes de credenciales, claves privadas, conexiones e IP privadas. No se incluyeron datos del negocio, archivos de entorno, registros, copias de base de datos ni infraestructura. Esta revisión acotada no certifica todo el repositorio privado ni garantiza ausencia de cualquier información sensible.

[Volver al caso de estudio](../README.md)
