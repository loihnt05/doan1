---
sidebar_position: 4
---
# Built-in Web APIs

## WebSocket Stable API

Native WebSocket support (Node.js v21+):

```javascript
const { WebSocket } = require('ws'); // or built-in

const ws = new WebSocket('wss://example.com/socket');

ws.on('open', () => {
  console.log('Connected');
  ws.send('Hello Server');
});

ws.on('message', (data) => {
  console.log('Received:', data);
});

ws.on('error', (error) => {
  console.error('Error:', error);
});

ws.on('close', () => {
  console.log('Connection closed');
});
```

## URL Pattern API

Advanced URL matching and routing:

```javascript
const pattern = new URLPattern({
  pathname: '/users/:id',
  search: '*',
  hash: '*'
});

// Match URLs
const result = pattern.exec('https://example.com/users/123?page=1');
console.log(result.pathname.groups.id); // '123'

// Express-style routing
const apiPattern = new URLPattern({ pathname: '/api/:version/:resource' });
const match = apiPattern.exec('/api/v1/users');
// match.pathname.groups => { version: 'v1', resource: 'users' }
```

## Web Streams

Standard streams API:

```javascript
// ReadableStream
const readable = new ReadableStream({
  start(controller) {
    controller.enqueue('chunk 1');
    controller.enqueue('chunk 2');
    controller.close();
  }
});

// Transform data
const transformStream = new TransformStream({
  transform(chunk, controller) {
    controller.enqueue(chunk.toUpperCase());
  }
});

// Pipe through transform
const transformed = readable.pipeThrough(transformStream);

// Consume stream
const reader = transformed.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  console.log(value);
}
```

## Fetch API (Native)

Built-in HTTP client:

```javascript
// Simple GET
const response = await fetch('https://api.example.com/data');
const data = await response.json();

// POST with JSON
const result = await fetch('https://api.example.com/users', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ name: 'John' })
});

// Streaming response
const response = await fetch('https://example.com/large-file');
const reader = response.body.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  // Process chunk
}

// AbortController for cancellation
const controller = new AbortController();
setTimeout(() => controller.abort(), 5000);

try {
  const response = await fetch('https://api.example.com/data', {
    signal: controller.signal
  });
} catch (err) {
  if (err.name === 'AbortError') {
    console.log('Request cancelled');
  }
}
```

## Scheduler API

Task scheduling with priorities:

```javascript
// High priority task
scheduler.postTask(() => {
  console.log('High priority task');
}, { priority: 'user-blocking' });

// Normal priority
scheduler.postTask(() => {
  console.log('Normal task');
}, { priority: 'user-visible' });

// Low priority (background)
scheduler.postTask(() => {
  console.log('Background task');
}, { priority: 'background' });

// Delay task
scheduler.postTask(() => {
  console.log('Delayed task');
}, { delay: 1000 });
```
