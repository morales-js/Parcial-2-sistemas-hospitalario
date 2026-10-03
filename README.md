# -*- coding: utf-8 -*-
from pathlib import Path

README = """# Parcial 2 - Sistema Hospitalario

Este proyecto es una demo rápida de un sistema hospitalario para la entrega del parcial 2. Incluye módulos de pacientes, médicos, citas, facturación e inventario con datos de ejemplo para mostrar la funcionalidad de una clínica moderna.

## Funcionalidades principales

- Gestión de pacientes
- Gestión de médicos
- Control de citas médicas
- Vista de facturación
- Inventario y stock hospitalario
- Dashboard con estadísticas generales

## Tecnologías

- Python 3
- Flask
- Jinja2

## Ejecución rápida

1. Crear entorno virtual:
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # Linux/macOS
   .venv\\Scripts\\activate     # Windows
   ```

2. Instalar dependencias:
   ```bash
   pip install -r requirements.txt
   ```

3. Ejecutar la aplicación:
   ```bash
   python app.py
   ```

4. Abrir en el navegador:
   ```text
   http://localhost:5000
   ```

## Estructura

- app.py -> aplicación principal
- hospital_data.py -> base de datos mock y datos de ejemplo
- templates/ -> vistas HTML
- static/ -> estilos CSS

## Nota del parcial

La aplicación está construida con enfoque académico y funcional, priorizando rapidez y presentación visual sobre complejidad de infraestructura.
"""

Path('README.md').write_text(README, encoding='utf-8')
