const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const session = require('express-session');
const db = require('./db');
const PDFDocument = require('pdfkit');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const app = express();
app.locals.formatDate = function(dateValue) {
    if (!dateValue) return '';
    const d = new Date(dateValue);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    secret: 'hospitalSecretKey',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});
function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
}
function requireAdmin(req, res, next) {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.send('Access denied. Admins only. <a href="/">Back to Home</a>');
    }
    next();
}
app.get('/', (req, res) => {
    db.query('SELECT * FROM patients', (err, patients) => {
        if (err) throw err;
        db.query('SELECT * FROM hospitals', (err, hospitals) => {
            if (err) throw err;
            db.query(
                `SELECT doctors.*, hospitals.name AS hospital_name 
                 FROM doctors 
                 LEFT JOIN hospitals ON doctors.hospital_id = hospitals.id`,
                (err, doctors) => {
                    if (err) throw err;
                    res.render('index', { patients, hospitals, doctors });
                });
        });
    });
});

app.post('/addPatient', requireLogin, (req, res) => {
    const { name, age, disease } = req.body;
    db.query('INSERT INTO patients (name, age, disease) VALUES (?, ?, ?)',
        [name, age, disease],
        (err) => {
            if (err) throw err;
            res.redirect('/');
        });
});

app.post('/addHospital', requireAdmin, (req, res) => {
    const { name, address, phone } = req.body;
    db.query('INSERT INTO hospitals (name, address, phone) VALUES (?, ?, ?)',
        [name, address, phone],
        (err) => {
            if (err) throw err;
            res.redirect('/');
        });
});

app.post('/addDoctor', requireAdmin, (req, res) => {
    const { name, specialization, hospital_id } = req.body;
    db.query('INSERT INTO doctors (name, specialization, hospital_id) VALUES (?, ?, ?)',
        [name, specialization, hospital_id],
        (err) => {
            if (err) throw err;
            res.redirect('/');
        });
});

app.get('/signup', (req, res) => {
    res.render('signup');
});
app.get('/doctorRegister', (req, res) => {
    db.query('SELECT * FROM hospitals', (err, hospitals) => {
        if (err) throw err;
        res.render('doctorRegister', { hospitals });
    });
});

app.post('/doctorRegister', (req, res) => {
    const { name, email, phone, password, specialization, qualification, experience, consultation_fee, available_days, available_timing, hospital_id } = req.body;
    const daysString = Array.isArray(available_days) ? available_days.join(',') : (available_days || '');

    bcrypt.hash(password, 10, (err, hashedPassword) => {
        if (err) throw err;
        db.query('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
            [name, email, hashedPassword, 'doctor'],
            (err, result) => {
                if (err) throw err;
                const newUserId = result.insertId;
                db.query(
                    `INSERT INTO doctors 
                     (name, specialization, hospital_id, email, phone, qualification, experience, consultation_fee, available_days, available_timing, user_id)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [name, specialization, hospital_id, email, phone, qualification, experience, consultation_fee, daysString, available_timing, newUserId],
                    (err) => {
                        if (err) throw err;
                        res.redirect('/login');
                    });
            });
    });
});
app.post('/signup', (req, res) => {
    const { name, email, password, role, age, gender, blood_group, phone, address, emergency_contact, medical_history } = req.body;
    bcrypt.hash(password, 10, (err, hashedPassword) => {
        if (err) throw err;
        db.query('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
            [name, email, hashedPassword, role],
            (err, result) => {
                if (err) throw err;
                const newUserId = result.insertId;
                if (role === 'patient') {
                    db.query(
                        `INSERT INTO patients 
                         (name, age, disease, user_id, gender, blood_group, phone, address, emergency_contact, medical_history) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [name, age || 0, '', newUserId, gender, blood_group, phone, address, emergency_contact, medical_history],
                        (err) => {
                            if (err) throw err;
                            res.redirect('/login');
                        });
                } else {
                    res.redirect('/login');
                }
            });
    });
});

app.get('/login', (req, res) => {
    res.render('login');
});
app.get('/forgotPassword', (req, res) => {
    res.render('forgotPassword', { message: null });
});

app.post('/forgotPassword', (req, res) => {
    const { email, newPassword } = req.body;
    db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
        if (err) throw err;
        if (results.length === 0) {
            return res.render('forgotPassword', { message: 'No account found with that email.' });
        }
        bcrypt.hash(newPassword, 10, (err, hashedPassword) => {
            if (err) throw err;
            db.query('UPDATE users SET password = ? WHERE email = ?', [hashedPassword, email], (err) => {
                if (err) throw err;
                res.render('forgotPassword', { message: 'Password updated successfully! You can now log in.' });
            });
        });
    });
});

app.post('/login', (req, res) => {
    const { email, password, rememberMe } = req.body;
    db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
        if (err) throw err;
        if (results.length === 0) return res.send('User not found. <a href="/login">Try again</a>');
        const user = results[0];
        bcrypt.compare(password, user.password, (err, match) => {
            if (match) {
                req.session.user = user;
                if (rememberMe) {
                    req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
                }
                res.redirect('/dashboard');
            } else {
                res.send('Incorrect password. <a href="/login">Try again</a>');
            }
        });
    });
});
app.get('/book', requireLogin, (req, res) => {
    const loggedInUserId = req.session.user.id;
    db.query(
        `SELECT doctors.*, hospitals.name AS hospital_name 
         FROM doctors 
         LEFT JOIN hospitals ON doctors.hospital_id = hospitals.id`,
        (err, doctors) => {
            if (err) throw err;
            db.query('SELECT * FROM patients WHERE user_id = ?', [loggedInUserId], (err, patients) => {
                if (err) throw err;
                res.render('book', { doctors, patients });
            });
        });
});

app.post('/book', requireLogin, (req, res) => {
    const { patient_id, doctor_id, appointment_date, appointment_time } = req.body;
    db.query(
        'INSERT INTO appointments (patient_id, doctor_id, appointment_date, appointment_time, status) VALUES (?, ?, ?, ?, ?)',
        [patient_id, doctor_id, appointment_date, appointment_time, 'booked'],
        (err) => {
            if (err) throw err;
            res.redirect('/appointments');
        });
});

app.get('/appointments', requireLogin, (req, res) => {
    const loggedInUserId = req.session.user.id;
    db.query(
        `SELECT appointments.*, patients.name AS patient_name, doctors.name AS doctor_name, doctors.specialization
         FROM appointments
         LEFT JOIN patients ON appointments.patient_id = patients.id
         LEFT JOIN doctors ON appointments.doctor_id = doctors.id
         WHERE patients.user_id = ?
         ORDER BY appointment_date, appointment_time`,
        [loggedInUserId],
        (err, appointments) => {
            if (err) throw err;
            res.render('appointments', { appointments });
        });
});
app.post('/markPaid/:id', requireLogin, (req, res) => {
    const appointmentId = req.params.id;
    const { payment_method } = req.body;
    db.query(
        'UPDATE appointments SET payment_status = ?, payment_method = ? WHERE id = ?',
        ['paid', payment_method, appointmentId],
        (err) => {
            if (err) throw err;
            res.redirect('/appointments');
        });
});
app.get('/search', requireLogin, (req, res) => {
    res.render('search', { results: null, searched: false });
});

app.post('/search', requireLogin, (req, res) => {
    const { disease } = req.body;
    db.query('SELECT specialization FROM diseases WHERE disease_name = ?', [disease], (err, diseaseResults) => {
        if (err) throw err;
        if (diseaseResults.length === 0) {
            return res.render('search', { results: [], searched: true });
        }
        const specialization = diseaseResults[0].specialization;
        db.query(
            `SELECT doctors.*, hospitals.name AS hospital_name, hospitals.address, hospitals.phone
             FROM doctors
             LEFT JOIN hospitals ON doctors.hospital_id = hospitals.id
             WHERE doctors.specialization = ?`,
            [specialization],
            (err, doctorResults) => {
                if (err) throw err;
                res.render('search', { results: doctorResults, searched: true });
            });
    });
});
app.get('/dashboard', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    res.render('dashboard');
});
app.get('/billing', requireAdmin, (req, res) => {
    db.query('SELECT * FROM patients', (err, patients) => {
        if (err) throw err;
        res.render('billing', { patients });
    });
});
app.get('/admin/users', requireAdmin, (req, res) => {
    db.query('SELECT id, name, email, role FROM users ORDER BY role, name', (err, users) => {
        if (err) throw err;
        res.render('adminUsers', { users });
    });
});
app.post('/admin/changeRole/:id', requireAdmin, (req, res) => {
    const { role } = req.body;
    db.query('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id], (err) => {
        if (err) throw err;
        res.redirect('/admin/users');
    });
});
app.post('/billing', requireAdmin, (req, res) => {
    const { patient_id, consultation_charges, medicine_name, medicine_quantity, medicine_charges, discount, payment_method } = req.body;
    const total = (parseFloat(consultation_charges) || 0) + (parseFloat(medicine_charges) || 0) - (parseFloat(discount) || 0);

    db.query(
        `INSERT INTO bills (patient_id, consultation_charges, medicine_name, medicine_quantity, medicine_charges, discount, total_amount, payment_method, payment_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [patient_id, consultation_charges, medicine_name, medicine_quantity, medicine_charges, discount, total, payment_method],
        (err) => {
            if (err) throw err;
            res.redirect('/bills');
        });
});
app.get('/invoice/:id', requireLogin, (req, res) => {
    const billId = req.params.id;
    db.query(
        `SELECT bills.*, patients.name AS patient_name, patients.phone, patients.address
         FROM bills
         LEFT JOIN patients ON bills.patient_id = patients.id
         WHERE bills.id = ?`,
        [billId],
        (err, results) => {
            if (err) throw err;
            if (results.length === 0) return res.send('Bill not found.');
            const bill = results[0];

            const doc = new PDFDocument();
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=invoice_${billId}.pdf`);
            doc.pipe(res);

            doc.fontSize(20).text('Hospital Management System', { align: 'center' });
            doc.fontSize(14).text('Invoice', { align: 'center' });
            doc.moveDown();

            doc.fontSize(12).text(`Invoice ID: ${bill.id}`);
            doc.text(`Patient Name: ${bill.patient_name}`);
            doc.text(`Phone: ${bill.phone || 'N/A'}`);
            doc.text(`Address: ${bill.address || 'N/A'}`);
            doc.moveDown();

            doc.text(`Consultation Charges: ₹${bill.consultation_charges}`);
            doc.text(`Medicine: ${bill.medicine_name || 'N/A'} (Qty: ${bill.medicine_quantity || 0})`);
            doc.text(`Medicine Charges: ₹${bill.medicine_charges}`);
            doc.text(`Discount: ₹${bill.discount}`);
            doc.moveDown();

            doc.fontSize(14).text(`Total Amount: ₹${bill.total_amount}`, { underline: true });
            doc.fontSize(12).text(`Payment Status: ${bill.payment_status}`);
            doc.text(`Payment Method: ${bill.payment_method || 'N/A'}`);

            doc.end();
        });
});
app.get('/bills', requireAdmin, (req, res) => {
    db.query(
        `SELECT bills.*, patients.name AS patient_name
         FROM bills
         LEFT JOIN patients ON bills.patient_id = patients.id
         ORDER BY bills.created_at DESC`,
        (err, bills) => {
            if (err) throw err;
            res.render('bills', { bills });
        });
});

app.post('/markBillPaid/:id', requireAdmin, (req, res) => {
    db.query('UPDATE bills SET payment_status = ? WHERE id = ?', ['paid', req.params.id], (err) => {
        if (err) throw err;
        res.redirect('/bills');
    });
});
app.get('/uploadDocument', requireLogin, (req, res) => {
    if (req.session.user.role !== 'patient') {
        return res.send('Access denied. Patients only. <a href="/">Back to Home</a>');
    }
    res.render('uploadDocument', { message: null });
});

app.post('/uploadDocument', requireLogin, upload.single('document'), (req, res) => {
    const loggedInUserId = req.session.user.id;
    const filePath = req.file ? req.file.path : null;

    db.query('UPDATE patients SET document_path = ? WHERE user_id = ?', [filePath, loggedInUserId], (err) => {
        if (err) throw err;
        res.render('uploadDocument', { message: 'Document uploaded successfully!' });
    });
});
app.get('/patientProfile', requireLogin, (req, res) => {
    if (req.session.user.role !== 'patient') {
        return res.send('Access denied. Patients only. <a href="/">Back to Home</a>');
    }
    const loggedInUserId = req.session.user.id;
    db.query('SELECT * FROM patients WHERE user_id = ?', [loggedInUserId], (err, patientResults) => {
        if (err) throw err;
        if (patientResults.length === 0) {
            return res.send('No patient profile found. <a href="/">Back to Home</a>');
        }
        db.query(
            `SELECT appointments.*, doctors.name AS doctor_name, doctors.specialization
             FROM appointments
             LEFT JOIN doctors ON appointments.doctor_id = doctors.id
             WHERE appointments.patient_id = ?
             ORDER BY appointment_date DESC`,
            [patientResults[0].id],
            (err, appointments) => {
                if (err) throw err;
                res.render('patientProfile', { patient: patientResults[0], appointments });
            });
    });
});
app.get('/doctorDashboard', requireLogin, (req, res) => {
    if (req.session.user.role !== 'doctor') {
        return res.send('Access denied. Doctors only. <a href="/">Back to Home</a>');
    }
    const loggedInUserId = req.session.user.id;
    db.query('SELECT * FROM doctors WHERE user_id = ?', [loggedInUserId], (err, doctorResults) => {
        if (err) throw err;
        if (doctorResults.length === 0) {
            return res.send('No doctor profile found. <a href="/">Back to Home</a>');
        }
        const doctorId = doctorResults[0].id;
        db.query(
            `SELECT appointments.*, patients.name AS patient_name
             FROM appointments
             LEFT JOIN patients ON appointments.patient_id = patients.id
             WHERE appointments.doctor_id = ?
             ORDER BY appointment_date, appointment_time`,
            [doctorId],
            (err, appointments) => {
                if (err) throw err;
                const patientCount = new Set(appointments.map(a => a.patient_id)).size;
                res.render('doctorDashboard', { doctor: doctorResults[0], appointments, patientCount });
            });
    });
});
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error(err);
            return res.redirect('/dashboard');
        }
        res.redirect('/login');
    });
});
app.listen(3000, () => {
    console.log('Server running at http://localhost:3000');
});