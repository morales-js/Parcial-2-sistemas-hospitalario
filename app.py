from flask import Flask, render_template
from hospital_data import patients, doctors, appointments, billing, inventory, stats

app = Flask(__name__)


@app.route('/')
def index():
    return render_template(
        'index.html',
        stats=stats,
        patients=patients[:6],
        doctors=doctors[:5],
        appointments=appointments[:6],
        billing=billing[:5],
        inventory=inventory[:6]
    )


@app.route('/pacientes')
def pacientes():
    return render_template('pacientes.html', pacientes=patients)


@app.route('/doctores')
def doctores():
    return render_template('doctores.html', doctores=doctores)


@app.route('/citas')
def citas():
    return render_template('citas.html', citas=appointments)


@app.route('/facturacion')
def facturacion():
    return render_template('facturacion.html', billing=billing)


@app.route('/inventario')
def inventario():
    return render_template('inventario.html', inventory=inventory)


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
