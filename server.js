const express = require('express');
const mysql = require('mysql2/promise');
const nodemailer = require('nodemailer');
const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const ollamaHost = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const ollamaModel = process.env.OLLAMA_MODEL || 'mistral:latest';
const submissionsDir = path.join(__dirname, 'data');
const submissionsFile = path.join(submissionsDir, 'submissions.json');
const defaultSeatCapacity = Number(process.env.SEAT_CAPACITY) || 40;
const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'avaro',
};

let dbPool = null;

async function initializeDatabase() {
  try {
    const adminConnection = await mysql.createConnection({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
      multipleStatements: true,
    });

    await adminConnection.execute(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\``);
    await adminConnection.end();

    dbPool = mysql.createPool({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });

    await dbPool.execute(`
      CREATE TABLE IF NOT EXISTS contact_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'new',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await dbPool.execute(`
      CREATE TABLE IF NOT EXISTS bookings (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        date DATE NOT NULL,
        time TIME NOT NULL,
        guests INT NOT NULL,
        notes TEXT,
        seats JSON,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    console.log('MySQL database ready for Avaro bookings.');
    return true;
  } catch (error) {
    console.warn('MySQL not available; falling back to local JSON storage.', error.message);
    dbPool = null;
    return false;
  }
}

function ensureSubmissionStore() {
  if (!fs.existsSync(submissionsDir)) {
    fs.mkdirSync(submissionsDir, { recursive: true });
  }

  if (!fs.existsSync(submissionsFile)) {
    fs.writeFileSync(submissionsFile, JSON.stringify({ contactMessages: [], bookings: [] }, null, 2));
  }
}

function readSubmissionStore() {
  ensureSubmissionStore();

  try {
    const raw = fs.readFileSync(submissionsFile, 'utf8');
    const parsed = JSON.parse(raw || '{"contactMessages":[],"bookings":[]}');
    return {
      contactMessages: Array.isArray(parsed.contactMessages) ? parsed.contactMessages : [],
      bookings: Array.isArray(parsed.bookings) ? parsed.bookings : [],
    };
  } catch (error) {
    console.error('Unable to read submission store:', error);
    return { contactMessages: [], bookings: [] };
  }
}

function saveSubmission(collectionName, payload) {
  ensureSubmissionStore();

  const db = readSubmissionStore();
  const key = collectionName === 'bookings' ? 'bookings' : 'contactMessages';

  db[key] = db[key] || [];
  db[key].push({
    ...payload,
    createdAt: new Date().toISOString(),
  });

  fs.writeFileSync(submissionsFile, JSON.stringify(db, null, 2));
  return true;
}

async function saveSubmissionToDatabase(collectionName, payload) {
  if (!dbPool) return false;

  if (collectionName === 'bookings') {
    const booking = payload;
    await dbPool.execute(
      `INSERT INTO bookings (id, name, email, phone, date, time, guests, notes, seats, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        booking.id,
        booking.name,
        booking.email,
        booking.phone,
        booking.date,
        booking.time,
        Number(booking.guests),
        booking.notes || '',
        JSON.stringify(booking.seats || []),
        booking.status || 'pending',
      ]
    );
    return true;
  }

  await dbPool.execute(
    `INSERT INTO contact_messages (name, email, phone, message, status)
     VALUES (?, ?, ?, ?, ?)`,
    [payload.name, payload.email, payload.phone, payload.message, payload.status || 'new']
  );
  return true;
}

async function readBookingsFromDatabase() {
  if (!dbPool) return [];

  const [rows] = await dbPool.query(`SELECT * FROM bookings ORDER BY date ASC, time ASC`);
  return rows.map((row) => ({
    ...row,
    guests: String(row.guests),
    seats: JSON.parse(row.seats || '[]'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

async function updateBookingStatusInDatabase(id, status) {
  if (!dbPool) return null;

  await dbPool.execute(`UPDATE bookings SET status = ? WHERE id = ?`, [status, id]);
  const [rows] = await dbPool.query(`SELECT * FROM bookings WHERE id = ?`, [id]);
  return rows[0] || null;
}

function buildReservationEmailContent(booking, status = 'pending') {
  const confirmed = String(status).toLowerCase() === 'confirmed';
  const heading = confirmed ? 'Reservation Confirmed' : 'Reservation Request Received';
  const message = confirmed
    ? 'Your table reservation has been confirmed and is ready for your visit.'
    : 'Your table request has been received and our team will confirm availability shortly.';

  const seatText = Array.isArray(booking.seats) && booking.seats.length ? booking.seats.join(', ') : 'To be assigned';

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; max-width: 640px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #f59e0b, #d97706); padding: 24px; color: white; border-radius: 12px 12px 0 0;">
        <h2 style="margin: 0; font-size: 28px;">Avaro — ${heading}</h2>
      </div>
      <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px; background: #fffdf8;">
        <p>Hi ${booking.name || 'Guest'},</p>
        <p>${message}</p>
        <p><strong>Date:</strong> ${booking.date}</p>
        <p><strong>Time:</strong> ${booking.time}</p>
        <p><strong>Guests:</strong> ${booking.guests}</p>
        <p><strong>Assigned Seats:</strong> ${seatText}</p>
        <p><strong>Status:</strong> ${status}</p>
        <p>We look forward to welcoming you to Avaro.</p>
        <p>Warm regards,<br/>Avaro Team</p>
      </div>
    </div>
  `;
}

async function sendReservationEmail(booking, status = 'pending') {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return false;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: booking.email,
    subject: status === 'confirmed' ? 'Your Avaro reservation has been confirmed' : 'Your Avaro reservation request is received',
    html: buildReservationEmailContent(booking, status),
  });

  if (process.env.SMTP_TO || process.env.SMTP_USER) {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: process.env.SMTP_TO || process.env.SMTP_USER,
      subject: `Avaro ${status === 'confirmed' ? 'reservation confirmed' : 'booking request'} for ${booking.name}`,
      html: buildReservationEmailContent(booking, status),
    });
  }

  return true;
}

function getLocalAssistantReply(prompt) {
  const message = (prompt || '').toLowerCase();

  const guestMatch = message.match(/(\d+)\s*(guest|people|persons?)/);
  const timeMatch = message.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b|\b(\d{1,2}:\d{2})\b/);
  const dateMatch = message.match(/\b(tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{4}-\d{2}-\d{2})\b/);

  if (/(book|booking|reserve|reservation|table|seat|guests|party)/.test(message)) {
    const guestText = guestMatch ? `${guestMatch[1]} guests` : 'your group';
    const dateText = dateMatch ? `for ${dateMatch[0]}` : 'for your preferred date';
    const timeText = timeMatch ? `at ${timeMatch[0]}` : 'at your preferred time';
    return `Absolutely. Please use the booking form to reserve a table for ${guestText} ${dateText} ${timeText}. We will confirm availability and seat allocation quickly.`;
  }

  if (/(menu|dish|food|starter|main|dessert|recommend)/.test(message)) {
    return 'For a family dinner, I recommend our chef special platter, saffron biryani, and house-made dessert. If you want, I can suggest dishes based on your taste.';
  }

  if (/(hour|time|open|close|timing|when)/.test(message)) {
    return 'Avaro is open daily from 12:00 PM to 11:00 PM. We recommend booking ahead for dinner and weekend slots.';
  }

  if (/(contact|call|phone|location|address|where|visit|directions)/.test(message)) {
    return 'You can contact Avaro at +91 98765 43210 or visit us in Connaught Place, New Delhi.';
  }

  if (/(hello|hi|hey|good morning|good evening)/.test(message)) {
    return 'Hello! I can help with menu suggestions, reservations, timings, and contact details.';
  }

  return 'I can help with reservations, menu suggestions, timings, and contact information. Ask me to book a table or recommend a dish.';
}

function readBookings() {
  return readSubmissionStore().bookings;
}

async function fetchOllamaAssistant(prompt, model) {
  const attempts = [
    {
      url: `${ollamaHost}/api/generate`,
      payload: {
        model: model || ollamaModel,
        prompt: `You are Avaro's restaurant concierge. Keep every reply under 2 short sentences. Focus only on reservations, menu suggestions, timings, or contact info. If the user wants to book, tell them to use the booking form and mention date, time, and guest count. Do not give long generic explanations. User request: ${prompt}`,
        stream: false,
      },
      extractor: (body) => body?.response,
    },
    {
      url: `${ollamaHost}/v1/chat/completions`,
      payload: {
        model: model || ollamaModel,
        messages: [{
          role: 'system',
          content: 'You are Avaro restaurant concierge. Keep answers under 2 short sentences. Focus on reservations, menu suggestions, hours, and contact details. If the user wants a booking, point them to the booking form and mention date, time, and guest count. No long rambling text.',
        }, { role: 'user', content: prompt }],
        temperature: 0.3,
      },
      extractor: (body) => body?.choices?.[0]?.message?.content,
    },
    {
      url: `${ollamaHost}/v1/completions`,
      payload: {
        model: model || ollamaModel,
        prompt: `You are Avaro restaurant concierge. Answer in 1-2 short sentences. Stay practical and reservation-focused. Mention the booking form if they want to reserve. User request: ${prompt}`,
        max_tokens: 120,
        temperature: 0.2,
      },
      extractor: (body) => body?.choices?.[0]?.text,
    },
  ];

  let lastError = null;

  for (const attempt of attempts) {
    try {
      const response = await postJson(attempt.url, attempt.payload);
      const answer = attempt.extractor(response);
      if (answer && String(answer).trim()) {
        return String(answer).trim();
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Ollama assistant is unavailable.');
}

function allocateSeats(date, time, guestsCount) {
  const totalGuests = Number(guestsCount) || 1;
  const booked = readBookings().filter((booking) => {
    return booking.date === date && booking.time === time && ['pending', 'confirmed', 'arrived'].includes(booking.status || 'pending');
  });

  const occupiedSeats = new Set();
  booked.forEach((booking) => {
    const seats = Array.isArray(booking.seats) ? booking.seats : [];
    seats.forEach((seat) => occupiedSeats.add(Number(seat)));
  });

  const seats = [];
  let nextSeat = 1;

  while (seats.length < totalGuests) {
    if (!occupiedSeats.has(nextSeat) && nextSeat <= defaultSeatCapacity) {
      seats.push(nextSeat);
    }
    nextSeat += 1;

    if (nextSeat > defaultSeatCapacity + 50) {
      break;
    }
  }

  const usedSeats = booked.reduce((sum, booking) => sum + (Number(booking.guests) || 1), 0);
  const totalUsed = usedSeats + totalGuests;

  if (seats.length !== totalGuests || totalUsed > defaultSeatCapacity) {
    return null;
  }

  return seats;
}

function getBookingSummary() {
  const bookings = readBookings();
  const summary = {
    total: bookings.length,
    pending: bookings.filter((booking) => booking.status === 'pending').length,
    confirmed: bookings.filter((booking) => booking.status === 'confirmed').length,
    arrived: bookings.filter((booking) => booking.status === 'arrived').length,
    cancelled: bookings.filter((booking) => booking.status === 'cancelled').length,
  };

  return summary;
}

function createApp() {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname)));

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  app.post('/api/contact', async (req, res) => {
    try {
      const { name, email, phone, message } = req.body;

      if (!name || !email || !phone || !message) {
        return res.status(400).json({ success: false, message: 'All fields are required.' });
      }

      const databaseSaved = await saveSubmissionToDatabase('contactMessages', { name, email, phone, message, status: 'new' });
      if (!databaseSaved) {
        saveSubmission('contactMessages', { name, email, phone, message, status: 'new' });
      }

      if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        return res.json({
          success: true,
          message: 'Your message was saved successfully. Add SMTP credentials to enable email delivery.',
        });
      }

      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: process.env.SMTP_TO || process.env.SMTP_USER,
        subject: `New contact request from ${name}`,
        html: `
          <h3>New Contact Message</h3>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Phone:</strong> ${phone}</p>
          <p><strong>Message:</strong> ${message}</p>
        `,
      });

      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: email,
        subject: 'We received your message at Avaro',
        html: `
          <h2>Thank you for reaching out to Avaro</h2>
          <p>Hi ${name},</p>
          <p>We have received your message and will get back to you shortly.</p>
          <p>Warm regards,<br/>Avaro Team</p>
        `,
      });

      res.json({ success: true, message: 'Message sent successfully.' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, message: 'Failed to send message.' });
    }
  });

  app.post('/api/booking', async (req, res) => {
    try {
      const { name, email, phone, date, time, guests, notes } = req.body;

      if (!name || !email || !phone || !date || !time || !guests) {
        return res.status(400).json({ success: false, message: 'Please complete all booking details.' });
      }

      const guestCount = Number(guests) || 1;
      const allocatedSeats = allocateSeats(date, time, guestCount);

      if (!allocatedSeats) {
        return res.status(409).json({
          success: false,
          message: `No available seats remain for ${date} at ${time}. Please choose another time or fewer guests.`,
        });
      }

      const booking = {
        id: `AV-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        email,
        phone,
        date,
        time,
        guests: guestCount,
        notes: notes || '',
        seats: allocatedSeats,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      const databaseSaved = await saveSubmissionToDatabase('bookings', booking);
      if (!databaseSaved) {
        saveSubmission('bookings', booking);
      }

      const emailSent = await sendReservationEmail({
        ...booking,
        seats: allocatedSeats,
      }, 'pending');

      if (!emailSent) {
        return res.json({
          success: true,
          message: 'Your booking request was saved successfully. Add SMTP credentials to enable email notifications.',
          booking,
        });
      }

      res.json({ success: true, message: 'Booking request submitted successfully. We will confirm it soon.', booking });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, message: 'Failed to process booking request.' });
    }
  });

  app.get('/api/admin/bookings', async (req, res) => {
    let bookings = [];

    if (dbPool) {
      bookings = await readBookingsFromDatabase();
    } else {
      bookings = readBookings().sort((a, b) => new Date(a.date + 'T' + a.time) - new Date(b.date + 'T' + b.time));
    }

    const summary = dbPool
      ? {
          total: bookings.length,
          pending: bookings.filter((booking) => booking.status === 'pending').length,
          confirmed: bookings.filter((booking) => booking.status === 'confirmed').length,
          arrived: bookings.filter((booking) => booking.status === 'arrived').length,
          cancelled: bookings.filter((booking) => booking.status === 'cancelled').length,
        }
      : getBookingSummary();

    res.json({ success: true, summary, bookings });
  });

  app.patch('/api/admin/booking/:id', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    const normalizedStatus = ['pending', 'confirmed', 'arrived', 'cancelled', 'completed'].includes(status) ? status : 'pending';

    if (dbPool) {
      const updated = await updateBookingStatusInDatabase(id, normalizedStatus);
      if (!updated) {
        return res.status(404).json({ success: false, message: 'Booking not found.' });
      }

      if (normalizedStatus === 'confirmed') {
        await sendReservationEmail(updated, 'confirmed');
      }

      return res.json({ success: true, booking: updated });
    }

    const bookings = readBookings();
    const index = bookings.findIndex((booking) => booking.id === id);

    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    bookings[index].status = normalizedStatus;
    bookings[index].updatedAt = new Date().toISOString();

    if (normalizedStatus === 'confirmed') {
      await sendReservationEmail(bookings[index], 'confirmed');
    }

    const db = readSubmissionStore();
    db.bookings = bookings;
    fs.writeFileSync(submissionsFile, JSON.stringify(db, null, 2));

    res.json({ success: true, booking: bookings[index] });
  });

  app.post('/api/assistant', async (req, res) => {
    try {
      const { prompt, model } = req.body;

      if (!prompt || !prompt.trim()) {
        return res.status(400).json({ success: false, message: 'Prompt is required.' });
      }

      const normalizedPrompt = String(prompt).trim();
      const isBookingRequest = /(book|booking|reserve|reservation|table|seat|guests|party)/i.test(normalizedPrompt);

      let assistantText = getLocalAssistantReply(normalizedPrompt);

      if (!isBookingRequest) {
        try {
          const ollamaText = await fetchOllamaAssistant(normalizedPrompt, model);
          if (ollamaText && ollamaText.trim()) {
            assistantText = String(ollamaText).trim();
          }
        } catch (error) {
          console.warn('Ollama unavailable. Using built-in local restaurant assistant response.', error.message);
        }
      }

      const finalText = assistantText.replace(/\s+/g, ' ').trim();
      res.json({ success: true, assistant: finalText || getLocalAssistantReply(normalizedPrompt) });
    } catch (error) {
      console.error('Assistant error:', error);
      res.status(500).json({ success: false, message: 'Unable to respond right now. Please try again.' });
    }
  });

  app.get('/api/health', (req, res) => {
    res.json({ success: true, message: 'Avaro backend is running.' });
  });

  app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
  });

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
  });

  return app;
}

function postJson(url, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 80,
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(body || '{}');
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject(new Error(json.error || `Ollama request failed with status ${res.statusCode}`));
          }
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function choosePort(preferredPort = Number(process.env.PORT) || 3000) {
  let candidate = Number.isFinite(preferredPort) ? preferredPort : 3000;

  return new Promise((resolve, reject) => {
    const tryPort = () => {
      const tester = net.createServer();

      tester.once('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          candidate += 1;
          tryPort();
          return;
        }

        reject(error);
      });

      tester.once('listening', () => {
        tester.close(() => resolve(candidate));
      });

      tester.listen(candidate, '0.0.0.0');
    };

    tryPort();
  });
}

async function startServer() {
  await initializeDatabase();
  const app = createApp();
  const port = await choosePort(Number(process.env.PORT) || 3000);
  const server = app.listen(port, () => {
    console.log(`Avaro backend running on http://localhost:${port}`);
  });

  return { app, server, port };
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

module.exports = {
  createApp,
  choosePort,
  startServer,
  getLocalAssistantReply,
  buildReservationEmailContent,
};
