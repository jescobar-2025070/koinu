# Guía de usuario

Guía de uso de la interfaz web. Al acceder a `http://localhost:4200` se redirige a la página de inicio de sesión.

## Autenticación

| Página | Ruta | Uso |
| --- | --- | --- |
| Inicio de sesión | `/login` | Acceso con email y contraseña (o Google si Auth0 está configurado). |
| Registro | `/register` | Crear una cuenta (rol `USR`). |
| Recuperar contraseña | `/forgot-password` | Solicitar un token de reseteo (en desarrollo se muestra el token). |
| Nueva contraseña | `/reset-password` | Fijar la nueva contraseña con el token. |

La sesión se cierra desde el botón de salir de la barra superior. Tras un período de inactividad la sesión expira (`SESIÓN EXPIRADA`) y hay que iniciar sesión de nuevo.

## Navegación

La topbar muestra las secciones **INICIO**, **PERÍODOS**, **MOVIMIENTOS**, **OBJETIVOS** y **ADMIN** (este último solo visible para el rol `ADMIN`). La **sidebar** cambia de contenido según la sección activa y permite acceder a las subpáginas.

## Dashboard

Muestra la información del período activo en una cuadrícula: presupuesto total (ingresos netos), disponible (ingresos − gastos), progreso del primer objetivo activo y fecha de fin del período. Desde ahí se accede a:

- **Últimos movimientos / ingresos / gastos**: tablas con los movimientos recientes.
- **Informes**: resumen, desglose por categoría con desviación frente al presupuesto, objetivos, recomendaciones, movimientos con su historial de auditoría (creado/modificado/eliminado con el detalle de los cambios) y **exportación CSV**.

## Períodos

Un período define un rango de fechas (`start_date` a `end_date`) durante el cual se registran movimientos.

- **Nuevo período**: nombre y fechas. Se crea **directamente activo**; si existía otro período activo, este se finaliza automáticamente con su snapshot.
- **Modificar período actual**: solo se permiten cambios sobre períodos en el estado borrador (en la interfaz los períodos no suelen estar en este estado).
- **Finalizar período actual**: muestra el resumen del período activo para confirmación; al finalizar (→ `FINISHED`) se genera el snapshot del informe final.
- **Historial**: tabla de todos los períodos con su estado.
- **Cancelar**: un período `DRAFT` o `ACTIVE` puede cancelarse (→ `CANCELLED`).

> Solo puede existir **un período activo** por usuario y solo en un período activo se pueden registrar/editar/eliminar movimientos.

## Movimientos

- **Ingresos** (`/movements/income`): formulario con categoría, clasificación (`Regular`/`Ocasional`), monto bruto, retención (opcional) y tratamiento fiscal; el neto se calcula automáticamente. Puede vincularse a un objetivo para aportar automáticamente.
- **Gastos** (`/movements/expenses`): formulario con categoría y tipo (`Fijo`/`Variable`). El gasto no puede superar el disponible del período ni el remanente de la asignación de su categoría.
- **Historiales** (`/movements/history/income` y `/expenses`): listado con edición y eliminación. Solo se pueden editar/eliminar movimientos del período activo (los aportes/retiros de objetivos no son editables).

## Objetivos y presupuesto

- **Objetivos** (`/objectives`): crea metas con monto objetivo, fecha límite, prioridad y período opcional. Cada objetivo muestra su progreso y permite **aportes** y **retiros** (almacenados como movimientos internos). Desde el listado se pueden completar o cancelar.
- **Presupuesto** (`/objectives/budget`): el **total se calcula automáticamente** como los ingresos netos del período y no es editable; se gestionan **asignaciones por categoría de gasto**, consultando el total asignado y lo restante.

## Administración (solo ADMIN)

- **Usuarios**: listar, crear, editar email, activar/desactivar cuenta, asignar roles (mínimo uno, `ADMIN`/`USR`), restablecer contraseña y eliminar. La cuenta propia no puede desactivarse.
- **Salud del sistema**: estado de la API y de la base de datos.

## Exportación

La página de informes permite exportar los movimientos del período **a CSV** (codificación UTF-8 con BOM, compatible con Excel), con columnas de fecha, tipo, categoría, clasificación, descripción y monto.