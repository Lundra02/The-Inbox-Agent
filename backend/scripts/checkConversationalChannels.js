// Signed webhook -> isolated MongoDB -> live FastAPI/Groq -> captured send adapter.
// No external customer message is sent; synthetic test records stay in a separate DB.
import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { createMessengerRouter } from '../src/routes/messengerWebhook.js';
import { createInstagramRouter } from '../src/routes/instagramWebhook.js';
import MessengerEvent from '../src/models/MessengerEvent.js';
import InstagramEvent from '../src/models/InstagramEvent.js';
import InboxCase from '../src/models/InboxCase.js';
import InboxConversation from '../src/models/InboxConversation.js';
import { processEvent } from '../src/services/messengerWorker.js';
import { sendReply } from '../src/services/messengerService.js';
import { sendInstagramReply } from '../src/services/instagramService.js';

const dbName = `inbox_activation_check_${Date.now()}`;
const config = { pageId: '123', token: 'synthetic-token', secret: 'synthetic-secret', verifyToken: 'synthetic-verify', version: 'v25.0' };
let server;
const report = { dbName, externalDelivery: 'captured, not sent to Meta', channels: [] };
try {
  await mongoose.connect(process.env.MONGO_URI, { dbName });
  await Promise.all([MessengerEvent.init(), InstagramEvent.init(), InboxCase.init(), InboxConversation.init()]);
  const app = express();
  app.use('/messenger', createMessengerRouter({ config }));
  app.use('/instagram', createInstagramRouter({ config }));
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  for (const channel of ['messenger', 'instagram']) {
    const events = channel === 'messenger' ? MessengerEvent : InstagramEvent;
    const sender = channel === 'messenger' ? sendReply : sendInstagramReply;
    const row = { channel, turns: [] };
    for (const [index, message] of ['A ki laptop', 'sa kushton kjo', 'Is it available?'].entries()) {
      const body = JSON.stringify({ object: channel === 'messenger' ? 'page' : 'instagram', entry: [{ id: '123', messaging: [{ sender: { id: '456' }, recipient: { id: '123' }, timestamp: Date.now(), message: { mid: `synthetic-${index}`, text: message } }] }] });
      const headers = { 'Content-Type': 'application/json', 'X-Hub-Signature-256': 'sha256=' + createHmac('sha256', config.secret).update(body).digest('hex') };
      const url = `http://127.0.0.1:${server.address().port}/${channel}`;
      assert.equal((await fetch(url, { method: 'POST', headers, body })).status, 200);
      assert.equal((await fetch(url, { method: 'POST', headers, body })).status, 200);
      const event = await events.findOne({ status: 'pending' });
      assert.ok(event);
      const sent = [];
      await processEvent(event, { channel, send: (id, reply) => sender(id, reply, config, { post: async (target, data) => { sent.push({ target, data }); return { data: { message_id: 'captured' } }; } }) });
      assert.equal(event.status, 'sent');
      const item = await InboxCase.findOne({ sourceEventId: event.eventId });
      assert.equal(item.language, index === 2 ? 'en' : 'sq');
      assert.equal(item.replyEngine, 'generated');
      assert.equal(item.conversationKey, `${channel}:123:456`);
      assert.equal(sent.map(call => call.data.message.text).join(''), item.customerReply);
      assert.ok(sent[0].target.startsWith(channel === 'messenger' ? 'https://graph.facebook.com/' : 'https://graph.instagram.com/'));
      row.turns.push({ message, reply: item.customerReply, language: item.language, replyEngine: item.replyEngine });
    }
    assert.equal(await events.countDocuments(), 3);
    report.channels.push(row);
    console.log(JSON.stringify(row));
  }
  assert.equal(await InboxConversation.countDocuments(), 2);
  report.passed = true;
} finally {
  if (server) { server.closeAllConnections(); server.close(); }
  await mongoose.disconnect();
  await writeFile('conversational_channel_checks.json', JSON.stringify(report, null, 2));
}
