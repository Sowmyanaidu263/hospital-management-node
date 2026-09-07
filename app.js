const express = require('express');
const bodyParser = require('body-parser');
const db = require('./db');

const app = express();
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    db.query('SELECT * FROM patients', (err, patients) => {
        if (err) throw err;
        db.query('SELECT * FROM doctors', (err, doctors) => {
            if (err) throw err;
            res.render('index', { patients, doctors });
        });
    });
});

app.post('/addPatient', (req, res) => {
    const { name, age, disease } = req.body;
    db.query('INSERT INTO patients (name, age, disease) VALUES (?, ?, ?)',
        [name, age, disease],
        (err) => {
            if (err) throw err;
            res.redirect('/');
        });
});

app.post('/addDoctor', (req, res) => {
    const { name, specialization } = req.body;
    db.query('INSERT INTO doctors (name, specialization) VALUES (?, ?)',
        [name, specialization],
        (err) => {
            if (err) throw err;
            res.redirect('/');
        });
});

app.listen(3000, () => {
    console.log('Server running at http://localhost:3000');
});