# Decisiones de diseño y limitaciones

Documento de referencia con las decisiones de diseño relevantes y las limitaciones conocidas del sistema. Es útil para entender comportamientos que podrían resultar sorprendentes a primera vista.

## Decisiones de dominio

### M1 — Los períodos se crean directamente activos

Aunque el modelo de datos contempla el estado `DRAFT`, la API crea los períodos **directamente en `ACTIVE`**: al crear un nuevo período, el anterior period activo del mismo usuario se finaliza automáticamente (con su snapshot de informe). El endpoint `POST /periods/:id/activate` existe pero queda prácticamente sin uso y el estado `DRAFT` no se gestiona desde la interfaz.

### A4 — El total del presupuesto se calcula automáticamente

El total del presupuesto de un período **no es editable** por el usuario: se sincroniza como el total de ingresos netos del período. El usuario solo define **asignaciones por categoría de gasto** (porciones de ese total). El presupuesto del período se crea automáticamente al primer acceso.

### B1 — Nomenclatura en español y camelCase

La API usa nombres en español y camelCase en los recursos, a diferencia del diseño original en inglés. Mapeos principales:

| Concepto | Nombre en la API |
| --- | --- |
| Objetivos | `/objectives` (no `/goals`) |
| Categorías | `/categories/income` y `/categories/expense` (no `/income-categories` ni `/expense-categories`) |
| Presupuesto | `/periods/:periodId/budget` |
| Respuestas | envueltas en la clave del recurso: `{ usuario }`, `{ movimiento }`, `{ periodo }`, `{ presupuesto }`, `{ dashboard }`, `{ report }`, etc. |

## Comportamientos del dominio

- **Un período activo por usuario**: existe un índice único que garantiza, como máximo, un período `ACTIVE` concurrente por usuario.
- **Sólo períodos activos aceptan operaciones**: no se pueden crear, editar ni eliminar movimientos ni realizar aportes/retiros a objetivos en períodos que no estén `ACTIVE`.
- **Los gastos no pueden superar los fondos**: un gasto se rechaza si supera el disponible del período (ingresos − gastos) o el remanente de la asignación de su categoría cuando existe.
- **Las categorías del sistema no son editables**: las categorías predeterminadas (`isDefault = true`) no admiten modificaciones ni borrado; las personalizadas se pueden renombrar y eliminar (baja lógica, `isActive = false`). El nombre de categoría debe ser único por usuario (sin distinguir mayúsculas).
- **Los aportes y retiros de objetivos son movimientos internos**: un aporte crea un gasto sin categoría (`expense_category_id = NULL`, `objetivo_id` definido) y un retiro crea un ingreso sin categoría. Estos movimientos internos **no se pueden editar** desde la interfaz de movimientos.
- **Vincular un ingreso a un objetivo** aporta automáticamente el neto al objetivo; editar un ingreso vinculado ajusta el objetivo y reasigna aportes si el objetivo cambia.
- **Monto máximo**: un movimiento no puede superar Q 999,999,999,999.99 (`AMOUNT_TOO_LARGE`).

## Seguridad y aislamiento

- **El `ADMIN` no accede a las finanzas**: no existe ningún endpoint para que un administrador consulte datos financieros de los usuarios. La administración gestiona usuarios, períodos globales y salud del sistema.
- **Registro público siempre `USR`**: un usuario que se registra nunca puede asignarse el rol `ADMIN`.
- **Autorización siempre en backend**: la protección de rutas del frontend es sólo complementaria; el backend valida rol y propiedad de recursos.
- **La sesión se expira por inactividad**: además de la duración máxima del refresh token, la sesión deja de renovarse si no hay actividad durante `SESSION_IDLE_TIMEOUT`.

## Limitaciones conocidas y código inerte

- **Presupuesto sin redistribución automática**: este release no incluye endpoints de redistribución de excedentes ni propuestas automáticas (la tabla `excedentes_presupuesto` fue eliminada en la migración 024). El presupuesto se administra únicamente vía asignaciones por categoría.
- **Informe final**: sólo disponible para períodos `FINISHED`; la generación del snapshot ocurre al finalizar el período (no puede generarse después bajo demanda).
- **Login con Google opcional**: sin credenciales Auth0 configuradas, `POST /auth/google` responde `GOOGLE_AUTH_NOT_CONFIGURED`; el resto de la autenticación funciona normalmente.
- **Código no utilizado de etapas anteriores** (identificado durante el mantenimiento): controladores, servicios y validadores del ciclo `DRAFT` de períodos siguen presentes pero sin uso efectivo desde la interfaz; se conservan porque forman parte del contrato de la API.
- **Ejecución de pruebas requiere base de datos local**: sin las bases `finanzas_dev`/`finanzas_test` creadas, los comandos de migración y pruebas fallan. Detalle en [installation.md](installation.md) y [testing.md](testing.md).