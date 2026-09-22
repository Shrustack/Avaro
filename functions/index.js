const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const nodemailer = require('nodemailer');

admin.initializeApp();
const firestore = admin.firestore();

const apiApp = express();
apiApp.use(express.json());

function allocateSeats(bookings, guests) {
  const occupied = new Set();
  bookings.forEach((booking) => {
    if (booking.status === 'cancelled') return;
    (booking.seats || []).forEach((seat) => occupied.add(Number(seat)));
  });

  const seats = [];
  for (let seat = 1; seat <= 40 && seats.length < guests; seat += 1) {
    if (!occupied.has(seat)) seats.push(seat);
  }
  return seats.length === guests ? seats : null;
}

async function getBookings() {
  const snapshot = await firestore.collection('bookings').get();
  return snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
}

apiApp.post('/contact', async (req, res) => {
  const { name, email, phone, message } = req.body || {};
  if (!name || !email || !phone || !message) {
    return res.status(400).json({ success: false, message: 'All fields are required.' });
  }

  try {
    await firestore.collection('contactMessages').add({
      name, email, phone, message, status: 'new', createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return res.json({ success: true, message: 'Thanks! We will get back to you shortly.' });
  } catch (error) {
    console.error('Contact submission failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to send message.' });
  }
});

apiApp.post('/booking', async (req, res) => {
  const { name, email, phone, date, time, guests, notes } = req.body || {};
  if (!name || !email || !phone || !date || !time || !guests) {
    return res.status(400).json({ success: false, message: 'Please complete all booking details.' });
  }

  try {
    const guestCount = Number(guests) || 1;
    const existingBookings = (await getBookings()).filter((booking) => booking.date === date && booking.time === time);
    const seats = allocateSeats(existingBookings, guestCount);
    if (!seats) {
      return res.status(409).json({ success: false, message: `No available seats remain for ${date} at ${time}. Please choose another time or fewer guests.` });
    }

    const reference = `AV-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const booking = {
      id: reference, name, email, phone, date, time, guests: guestCount, notes: notes || '', seats,
      status: 'pending', createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await firestore.collection('bookings').doc(reference).set(booking);
    return res.json({ success: true, message: 'Booking request submitted successfully. We will confirm it soon.', booking: { ...booking, createdAt: new Date().toISOString() } });
  } catch (error) {
    console.error('Booking submission failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to process booking request.' });
  }
});

apiApp.get('/admin/bookings', async (req, res) => {
  try {
    const bookings = await getBookings();
    const summary = ['pending', 'confirmed', 'arrived', 'cancelled'].reduce((result, status) => {
      result[status] = bookings.filter((booking) => booking.status === status).length;
      return result;
    }, { total: bookings.length });
    return res.json({ success: true, summary, bookings });
  } catch (error) {
    console.error('Booking lookup failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to load bookings.' });
  }
});

apiApp.patch('/admin/booking/:id', async (req, res) => {
  const allowedStatuses = ['pending', 'confirmed', 'arrived', 'cancelled', 'completed'];
  const status = allowedStatuses.includes(req.body?.status) ? req.body.status : 'pending';
  try {
    const reference = firestore.collection('bookings').doc(req.params.id);
    const existing = await reference.get();
    if (!existing.exists) return res.status(404).json({ success: false, message: 'Booking not found.' });
    await reference.update({ status, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return res.json({ success: true, booking: { id: existing.id, ...existing.data(), status } });
  } catch (error) {
    console.error('Booking update failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to update booking.' });
  }
});

apiApp.post('/assistant', (req, res) => {
  const prompt = String(req.body?.prompt || '').trim();
  if (!prompt) return res.status(400).json({ success: false, message: 'Prompt is required.' });
  const bookingRequest = /(book|booking|reserve|reservation|table|seat|guests|party)/i.test(prompt);
  const assistant = bookingRequest
    ? 'I can help you reserve a table. Please complete the booking form.'
    : 'Avaro serves a premium dining experience in Delhi. Ask me about reservations, menu highlights, or opening times.';
  return res.json({ success: true, assistant });
});

apiApp.get('/health', (req, res) => res.json({ success: true, message: 'Avaro Firebase API is running.' }));

exports.api = functions.https.onRequest(apiApp);

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

exports.sendBookingConfirmation = functions.firestore
  .document('bookings/{bookingId}')
  .onCreate(async (snap) => {
    const booking = snap.data();
    const email = booking.email;
    const name = booking.name;
    const date = booking.date;
    const time = booking.time;
    const guests = booking.guests;

    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: email,
        subject: 'Your Avaro table booking request has been received',
        html: `
          <h2>Reservation Request Received</h2>
          <p>Hi ${name},</p>
          <p>Your booking request for ${date} at ${time} for ${guests} guest(s) has been received.</p>
          <p>Our team will confirm your table shortly.</p>
          <p>Warm regards,<br/>Avaro Team</p>
        `,
      });
    } catch (error) {
      console.error('Email send failed', error);
    }
  });

exports.sendContactConfirmation = functions.firestore
  .document('contactMessages/{messageId}')
  .onCreate(async (snap) => {
    const message = snap.data();
    const email = message.email;
    const name = message.name;

    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: email,
        subject: 'We received your message at Avaro',
        html: `
          <h2>Thank you for contacting Avaro</h2>
          <p>Hi ${name},</p>
          <p>We have received your message and will get back to you shortly.</p>
          <p>Warm regards,<br/>Avaro Team</p>
        `,
      });
    } catch (error) {
      console.error('Contact email send failed', error);
    }
  });
