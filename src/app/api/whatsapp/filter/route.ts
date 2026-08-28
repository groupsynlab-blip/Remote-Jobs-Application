import { NextRequest } from 'next/server';

let activeClient: any = null;
let isChecking = false;
let pauseRequested = false;
let resumeResolve: (() => void) | null = null;
const BATCH_SIZE = 50;
const MIN_DELAY = 5000; // 5 seconds
const MAX_DELAY = 10000; // 10 seconds

// POST — Start filter session or resume from batch pause
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, numbers } = body;

  // Resume from batch pause
  if (action === 'resume') {
    if (!pauseRequested || !resumeResolve) {
      return new Response(JSON.stringify({ error: 'No paused filter session to resume' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    resumeResolve();
    return new Response(JSON.stringify({ success: true, message: 'Resumed' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Start new filter session
  if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {
    return new Response(JSON.stringify({ error: 'Provide an array of phone numbers' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (isChecking) {
    return new Response(JSON.stringify({ error: 'A filter session is already running' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true, total: numbers.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// GET — SSE endpoint for real-time results
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const numbersParam = searchParams.get('numbers');

  if (!numbersParam) {
    return new Response(JSON.stringify({ error: 'Provide numbers as comma-separated query param' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const numbers = numbersParam.split(',').map(n => n.trim()).filter(n => n.length > 0);
  if (numbers.length === 0) {
    return new Response(JSON.stringify({ error: 'No valid numbers' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  isChecking = true;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, any>) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch {}
      };

      try {
        const { Client, LocalAuth } = await import('whatsapp-web.js');
        const qrcode = (await import('qrcode')).default;

        send({ type: 'status', message: 'Initializing WhatsApp client...' });

        if (activeClient) {
          try { await activeClient.destroy(); } catch {}
          activeClient = null;
        }

        const client = new Client({
          authStrategy: new LocalAuth({ dataPath: './whatsapp-session' }),
          puppeteer: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
          },
        });

        activeClient = client;

        client.on('qr', async (qr: string) => {
          try {
            const qrDataUrl = await qrcode.toDataURL(qr, { width: 300 });
            send({ type: 'qr', url: qrDataUrl });
          } catch {
            send({ type: 'qr', url: '' });
          }
        });

        client.on('ready', async () => {
          send({ type: 'status', message: 'Connected! Starting number check...' });

          let onWhatsApp = 0;
          let notOnWhatsApp = 0;
          let invalid = 0;
          const results: any[] = [];

          for (let i = 0; i < numbers.length; i++) {
            const rawNumber = numbers[i];
            const cleaned = rawNumber.replace(/[^0-9]/g, '');

            if (cleaned.length < 7) {
              invalid++;
              results.push({ number: rawNumber, status: 'invalid', reason: 'Number too short' });
              send({ type: 'progress', current: i + 1, total: numbers.length, number: rawNumber, status: 'invalid', reason: 'Number too short', onWhatsApp, notOnWhatsApp, invalid });
              continue;
            }

            try {
              const isRegistered = await client.isRegisteredUser(`${cleaned}@c.us`);
              if (isRegistered) {
                onWhatsApp++;
                results.push({ number: rawNumber, status: 'on_whatsapp' });
              } else {
                notOnWhatsApp++;
                results.push({ number: rawNumber, status: 'not_on_whatsapp' });
              }
              send({ type: 'progress', current: i + 1, total: numbers.length, number: rawNumber, status: isRegistered ? 'on_whatsapp' : 'not_on_whatsapp', onWhatsApp, notOnWhatsApp, invalid });
            } catch (checkError: any) {
              invalid++;
              results.push({ number: rawNumber, status: 'error', reason: checkError.message });
              send({ type: 'progress', current: i + 1, total: numbers.length, number: rawNumber, status: 'error', reason: checkError.message, onWhatsApp, notOnWhatsApp, invalid });
            }

            // 5-10s delay between checks (safety)
            await new Promise(resolve => setTimeout(resolve, MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY)));

            // Safety limiter: pause every BATCH_SIZE numbers
            if ((i + 1) % BATCH_SIZE === 0 && i + 1 < numbers.length) {
              const batchNum = Math.floor((i + 1) / BATCH_SIZE);
              send({
                type: 'batch_pause',
                message: `Batch ${batchNum} complete (${i + 1}/${numbers.length}). Pausing for safety.`,
                current: i + 1,
                total: numbers.length,
                onWhatsApp,
                notOnWhatsApp,
                invalid,
              });

              // Wait for resume signal
              await new Promise<void>(resolve => {
                resumeResolve = resolve;
                pauseRequested = true;
              });
              pauseRequested = false;
              resumeResolve = null;

              send({ type: 'status', message: `Resuming... (${i + 1}/${numbers.length} checked)` });
            }

            if ((i + 1) % 10 === 0) {
              send({ type: 'heartbeat', current: i + 1, total: numbers.length, onWhatsApp, notOnWhatsApp, invalid });
            }
          }

          send({ type: 'done', total: numbers.length, onWhatsApp, notOnWhatsApp, invalid, results });
          isChecking = false;
          controller.close();
        });

        client.on('authenticated', () => {
          send({ type: 'status', message: 'Authenticated! Waiting for WhatsApp...' });
        });

        client.on('auth_failure', (msg: string) => {
          send({ type: 'error', message: `Auth failed: ${msg}` });
          isChecking = false;
          controller.close();
        });

        client.on('disconnected', (reason: string) => {
          send({ type: 'error', message: `Disconnected: ${reason}` });
          isChecking = false;
          try { controller.close(); } catch {}
        });

        send({ type: 'status', message: 'Starting WhatsApp client. Scan the QR code...' });
        await client.initialize();

      } catch (error: any) {
        send({ type: 'error', message: error.message || 'Unknown error' });
        isChecking = false;
        try { controller.close(); } catch {}
      }
    },
    cancel() {
      isChecking = false;
      if (activeClient) { try { activeClient.destroy(); } catch {} activeClient = null; }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' },
  });
}

// DELETE — Stop active session
export async function DELETE() {
  if (activeClient) {
    try { await activeClient.destroy(); } catch {}
    activeClient = null;
    isChecking = false;
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ success: true, message: 'No active session' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
