from datetime import datetime, timedelta

# Datos base del sistema hospitalario
patients = [
    {"id": 1, "name": "María Fernanda Torres", "document": "1023456789", "age": 34, "gender": "Femenino", "insurance": "EPS Sanitas", "phone": "3001234567", "status": "Estable", "room": "A-101"},
    {"id": 2, "name": "Carlos Andrés Gómez", "document": "1122334455", "age": 52, "gender": "Masculino", "insurance": "Nueva EPS", "phone": "3019876543", "status": "Observación", "room": "B-204"},
    {"id": 3, "name": "Valentina Rojas", "document": "1234567890", "age": 28, "gender": "Femenino", "insurance": "Compensar", "phone": "3024567890", "status": "Estable", "room": "A-115"},
    {"id": 4, "name": "Felipe Morales", "document": "1345678901", "age": 67, "gender": "Masculino", "insurance": "Sura", "phone": "3105647382", "status": "Crítico", "room": "UCI-01"},
    {"id": 5, "name": "Sofía Montenegro", "document": "1456789012", "age": 41, "gender": "Femenino", "insurance": "EPS Sanitas", "phone": "3112345678", "status": "Estable", "room": "A-120"},
    {"id": 6, "name": "Daniel Pérez", "document": "1567890123", "age": 37, "gender": "Masculino", "insurance": "Famisanar", "phone": "3123456789", "status": "Control", "room": "B-312"},
    {"id": 7, "name": "Andrea Cárdenas", "document": "1678901234", "age": 29, "gender": "Femenino", "insurance": "Sanitas", "phone": "3134567890", "status": "Estable", "room": "A-132"},
    {"id": 8, "name": "Javier López", "document": "1789012345", "age": 58, "gender": "Masculino", "insurance": "EPS Sanitas", "phone": "3145678901", "status": "Observación", "room": "C-221"},
    {"id": 9, "name": "Camila Restrepo", "document": "1890123456", "age": 45, "gender": "Femenino", "insurance": "Compensar", "phone": "3156789012", "status": "Estable", "room": "A-201"},
    {"id": 10, "name": "Miguel Ángel Ruiz", "document": "1901234567", "age": 62, "gender": "Masculino", "insurance": "Nueva EPS", "phone": "3167890123", "status": "Control", "room": "B-118"},
    {"id": 11, "name": "Laura Jiménez", "document": "2012345678", "age": 31, "gender": "Femenino", "insurance": "EPS Sanitas", "phone": "3178901234", "status": "Estable", "room": "A-210"},
    {"id": 12, "name": "Mateo Díaz", "document": "2123456789", "age": 49, "gender": "Masculino", "insurance": "Sura", "phone": "3189012345", "status": "Observación", "room": "B-405"},
    {"id": 13, "name": "Natalia Salazar", "document": "2234567890", "age": 26, "gender": "Femenino", "insurance": "Sanitas", "phone": "3190123456", "status": "Estable", "room": "A-240"},
    {"id": 14, "name": "Sebastián Vega", "document": "2345678901", "age": 71, "gender": "Masculino", "insurance": "Famisanar", "phone": "3201234567", "status": "Crítico", "room": "UCI-02"},
    {"id": 15, "name": "Diana Arango", "document": "2456789012", "age": 39, "gender": "Femenino", "insurance": "EPS Sanitas", "phone": "3212345678", "status": "Estable", "room": "A-150"}
]

doctors = [
    {"id": 1, "name": "Dr. Álvaro Medina", "specialty": "Cardiología", "schedule": "Lun - Vie / 7:00 - 13:00", "clinic": "Consultorio 1", "status": "Disponible"},
    {"id": 2, "name": "Dra. Patricia Silva", "specialty": "Neurología", "schedule": "Lun - Sáb / 8:00 - 15:00", "clinic": "Consultorio 2", "status": "Disponible"},
    {"id": 3, "name": "Dr. Hugo Romero", "specialty": "Pediatría", "schedule": "Lun - Vie / 9:00 - 17:00", "clinic": "Pediatría", "status": "Ocupado"},
    {"id": 4, "name": "Dra. Lucía Espinosa", "specialty": "Ginecología", "schedule": "Mar - Dom / 7:30 - 14:30", "clinic": "Consultorio 4", "status": "Disponible"},
    {"id": 5, "name": "Dr. Esteban Díaz", "specialty": "Traumatología", "schedule": "Lun - Vie / 6:00 - 12:00", "clinic": "Consultorio 5", "status": "Disponible"},
    {"id": 6, "name": "Dra. Mónica Torres", "specialty": "Dermatología", "schedule": "Mié - Dom / 9:00 - 16:00", "clinic": "Consultorio 6", "status": "Ocupado"},
    {"id": 7, "name": "Dr. Rafael Castaño", "specialty": "Urología", "schedule": "Lun - Vie / 8:00 - 14:00", "clinic": "Consultorio 7", "status": "Disponible"},
    {"id": 8, "name": "Dra. Ximena Ríos", "specialty": "Oncología", "schedule": "Lun - Sáb / 10:00 - 18:00", "clinic": "Oncología", "status": "Disponible"}
]

base_date = datetime(2026, 10, 3)

appointments = [
    {"id": 1, "patient_id": 1, "patient_name": "María Fernanda Torres", "doctor_id": 1, "doctor_name": "Dr. Álvaro Medina", "date": (base_date + timedelta(days=1)).strftime('%Y-%m-%d'), "time": "08:30", "service": "Cardiología", "status": "Confirmada", "type": "Consulta"},
    {"id": 2, "patient_id": 2, "patient_name": "Carlos Andrés Gómez", "doctor_id": 2, "doctor_name": "Dra. Patricia Silva", "date": (base_date + timedelta(days=2)).strftime('%Y-%m-%d'), "time": "09:15", "service": "Neurología", "status": "Pendiente", "type": "Control"},
    {"id": 3, "patient_id": 3, "patient_name": "Valentina Rojas", "doctor_id": 3, "doctor_name": "Dr. Hugo Romero", "date": (base_date + timedelta(days=0)).strftime('%Y-%m-%d'), "time": "10:00", "service": "Pediatría", "status": "Atendida", "type": "Consulta"},
    {"id": 4, "patient_id": 4, "patient_name": "Felipe Morales", "doctor_id": 8, "doctor_name": "Dra. Ximena Ríos", "date": (base_date + timedelta(days=3)).strftime('%Y-%m-%d'), "time": "11:30", "service": "Oncología", "status": "Confirmada", "type": "Seguimiento"},
    {"id": 5, "patient_id": 5, "patient_name": "Sofía Montenegro", "doctor_id": 4, "doctor_name": "Dra. Lucía Espinosa", "date": (base_date + timedelta(days=5)).strftime('%Y-%m-%d'), "time": "12:00", "service": "Ginecología", "status": "Pendiente", "type": "Consulta"},
    {"id": 6, "patient_id": 6, "patient_name": "Daniel Pérez", "doctor_id": 5, "doctor_name": "Dr. Esteban Díaz", "date": (base_date + timedelta(days=1)).strftime('%Y-%m-%d'), "time": "14:00", "service": "Traumatología", "status": "Confirmada", "type": "Revisión"},
    {"id": 7, "patient_id": 7, "patient_name": "Andrea Cárdenas", "doctor_id": 6, "doctor_name": "Dra. Mónica Torres", "date": (base_date + timedelta(days=6)).strftime('%Y-%m-%d'), "time": "15:15", "service": "Dermatología", "status": "Pendiente", "type": "Consulta"},
    {"id": 8, "patient_id": 8, "patient_name": "Javier López", "doctor_id": 7, "doctor_name": "Dr. Rafael Castaño", "date": (base_date + timedelta(days=7)).strftime('%Y-%m-%d'), "time": "16:30", "service": "Urología", "status": "Confirmada", "type": "Examen"},
    {"id": 9, "patient_id": 9, "patient_name": "Camila Restrepo", "doctor_id": 1, "doctor_name": "Dr. Álvaro Medina", "date": (base_date + timedelta(days=2)).strftime('%Y-%m-%d'), "time": "08:00", "service": "Cardiología", "status": "Atendida", "type": "Control"},
    {"id": 10, "patient_id": 10, "patient_name": "Miguel Ángel Ruiz", "doctor_id": 2, "doctor_name": "Dra. Patricia Silva", "date": (base_date + timedelta(days=4)).strftime('%Y-%m-%d'), "time": "13:45", "service": "Neurología", "status": "Confirmada", "type": "Consulta"},
    {"id": 11, "patient_id": 11, "patient_name": "Laura Jiménez", "doctor_id": 3, "doctor_name": "Dr. Hugo Romero", "date": (base_date + timedelta(days=3)).strftime('%Y-%m-%d'), "time": "09:30", "service": "Pediatría", "status": "Atendida", "type": "Consulta"},
    {"id": 12, "patient_id": 12, "patient_name": "Mateo Díaz", "doctor_id": 5, "doctor_name": "Dr. Esteban Díaz", "date": (base_date + timedelta(days=8)).strftime('%Y-%m-%d'), "time": "10:45", "service": "Traumatología", "status": "Pendiente", "type": "Revisión"},
    {"id": 13, "patient_id": 13, "patient_name": "Natalia Salazar", "doctor_id": 4, "doctor_name": "Dra. Lucía Espinosa", "date": (base_date + timedelta(days=2)).strftime('%Y-%m-%d'), "time": "11:00", "service": "Ginecología", "status": "Confirmada", "type": "Consulta"},
    {"id": 14, "patient_id": 14, "patient_name": "Sebastián Vega", "doctor_id": 8, "doctor_name": "Dra. Ximena Ríos", "date": (base_date + timedelta(days=1)).strftime('%Y-%m-%d'), "time": "07:30", "service": "Oncología", "status": "Urgente", "type": "Seguimiento"},
    {"id": 15, "patient_id": 15, "patient_name": "Diana Arango", "doctor_id": 6, "doctor_name": "Dra. Mónica Torres", "date": (base_date + timedelta(days=9)).strftime('%Y-%m-%d'), "time": "17:00", "service": "Dermatología", "status": "Confirmada", "type": "Consulta"},
    {"id": 16, "patient_id": 1, "patient_name": "María Fernanda Torres", "doctor_id": 4, "doctor_name": "Dra. Lucía Espinosa", "date": (base_date + timedelta(days=11)).strftime('%Y-%m-%d'), "time": "09:00", "service": "Ginecología", "status": "Pendiente", "type": "Control"},
    {"id": 17, "patient_id": 2, "patient_name": "Carlos Andrés Gómez", "doctor_id": 5, "doctor_name": "Dr. Esteban Díaz", "date": (base_date + timedelta(days=12)).strftime('%Y-%m-%d'), "time": "13:00", "service": "Traumatología", "status": "Confirmada", "type": "Consulta"},
    {"id": 18, "patient_id": 15, "patient_name": "Diana Arango", "doctor_id": 7, "doctor_name": "Dr. Rafael Castaño", "date": (base_date + timedelta(days=13)).strftime('%Y-%m-%d'), "time": "08:45", "service": "Urología", "status": "Pendiente", "type": "Examen"}
]

billing = [
    {"id": "FAC-2026-001", "patient": "María Fernanda Torres", "concept": "Consulta cardiología", "amount": 180000, "status": "Pagado"},
    {"id": "FAC-2026-002", "patient": "Carlos Andrés Gómez", "concept": "Exámenes neurológicos", "amount": 420000, "status": "Pendiente"},
    {"id": "FAC-2026-003", "patient": "Felipe Morales", "concept": "Tratamiento oncológico", "amount": 2600000, "status": "Parcial"},
    {"id": "FAC-2026-004", "patient": "Sofía Montenegro", "concept": "Ultrasonido ginecológico", "amount": 260000, "status": "Pagado"},
    {"id": "FAC-2026-005", "patient": "Daniel Pérez", "concept": "Fisioterapia y revisión", "amount": 390000, "status": "Pendiente"},
    {"id": "FAC-2026-006", "patient": "Camila Restrepo", "concept": "Control cardíaco", "amount": 210000, "status": "Pagado"},
    {"id": "FAC-2026-007", "patient": "Mateo Díaz", "concept": "Radiografía y valoración", "amount": 500000, "status": "Pendiente"},
    {"id": "FAC-2026-008", "patient": "Sebastián Vega", "concept": "Quimioterapia de seguimiento", "amount": 1500000, "status": "Parcial"}
]

inventory = [
    {"item": "Guantes quirúrgicos", "stock": 220, "critical": 50, "category": "Insumos"},
    {"item": "Sueros IV", "stock": 68, "critical": 30, "category": "Medicamentos"},
    {"item": "Jeringas 5 ml", "stock": 540, "critical": 120, "category": "Insumos"},
    {"item": "Antibióticos amoxicilina", "stock": 92, "critical": 25, "category": "Medicamentos"},
    {"item": "Mascarillas N95", "stock": 310, "critical": 80, "category": "Bioseguridad"},
    {"item": "Gasas esterilizadas", "stock": 125, "critical": 40, "category": "Insumos"},
    {"item": "Baterías de monitor", "stock": 18, "critical": 6, "category": "Equipos"},
    {"item": "Paracetamol 500mg", "stock": 210, "critical": 60, "category": "Medicamentos"}
]

stats = {
    "total_patients": len(patients),
    "total_doctors": len(doctors),
    "total_appointments": len(appointments),
    "pending_billing": sum(1 for item in billing if item["status"] != "Pagado"),
    "urgent_cases": sum(1 for item in patients if item["status"] == "Crítico"),
    "low_inventory": sum(1 for item in inventory if item["stock"] <= item["critical"])
}
