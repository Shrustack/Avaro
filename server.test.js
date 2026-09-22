const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp, choosePort, getLocalAssistantReply, buildReservationEmailContent } = require('./server');

test('createApp returns an Express app instance', () => {
  assert.ok(createApp);
  assert.equal(typeof createApp, 'function');
});

test('choosePort resolves a valid local port', async () => {
  const port = await choosePort(3000);
  assert.equal(typeof port, 'number');
  assert.ok(port > 0);
});

test('getLocalAssistantReply returns a helpful restaurant answer', () => {
  const answer = getLocalAssistantReply('Book a table for 4 people');
  assert.match(answer.toLowerCase(), /book|reservation|table|seat/);
  assert.ok(answer.length < 180, 'Booking replies should stay concise and practical.');
});

test('buildReservationEmailContent includes confirmation details for a confirmed reservation', () => {
  const html = buildReservationEmailContent({
    name: 'Guest User',
    date: '2026-09-30',
    time: '20:00:00',
    guests: 3,
    seats: [1, 2, 3],
  }, 'confirmed');

  assert.match(html.toLowerCase(), /reservation confirmed|table confirmed/);
  assert.match(html.toLowerCase(), /2026-09-30/);
  assert.match(html.toLowerCase(), /20:00:00/);
});
