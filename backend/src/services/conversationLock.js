// Serialize messages and staff changes per conversation in this single-instance demo.
const locks = new Map();
export async function withConversationLock(key, work) {
  const previous = locks.get(key) || Promise.resolve();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const chain = previous.catch(() => {}).then(() => gate);
  locks.set(key, chain);
  await previous.catch(() => {});
  try { return await work(); }
  finally { release(); if (locks.get(key) === chain) locks.delete(key); }
}
