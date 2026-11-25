# novaVet · Veterinaria San Francisco de Asís

Sistema web interno (*back-office*) desarrollado para la gestión operativa de la **Clínica Veterinaria San Francisco de Asís**, estructurado en archivos modulares sin dependencias externas complejas y con control de acceso segmentado por rol y contraseña.

> *“Cuidado y bienestar para tu mascota”*

## Características principales

* **Autenticación por rol y contraseña:** Acceso privado sin registro público, con secciones diferenciadas para **Dirección / Administrador**, **Médico Veterinario** y **Recepción y Admisiones**.
* **Aislamiento de vistas y permisos:** Cada perfil accede únicamente a los módulos y acciones correspondientes a su función operativa.
* **Gestión de recepción y agenda:** Registro de propietarios y pacientes, programación de citas médicas, validación anti-traslape de horarios, reprogramación y cancelación de turnos.
* **Atención clínica e historias clínicas:** Consulta de agenda médica, registro de evoluciones clínicas y prescripciones, y revisión del historial por paciente.
* **Control de inventario y alertas:** Gestión de medicamentos, biológicos e insumos con indicadores de stock mínimo y alertas de reabastecimiento.
* **Persistencia y respaldos:** Almacenamiento en `localStorage` con exportación e importación de copias de seguridad en formato `.json`.

## Estructura del proyecto

```text
novavet/
├── index.html   # Estructura de la interfaz de acceso por rol y contenedor de la aplicación
├── styles.css   # Estilos corporativos, diseño responsivo y tarjetas de perfil
├── app.js       # Lógica de negocio, autenticación por rol, persistencia y vistas
└── README.md    # Documentación del proyecto
