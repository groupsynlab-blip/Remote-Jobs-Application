import { NextRequest, NextResponse } from 'next/server';
import {
  getSchedulerStatus,
  pauseScheduler,
  resumeScheduler,
  isSchedulerPaused,
} from '@/lib/scheduler';

// GET /api/scheduler — Get scheduler status
export async function GET() {
  return NextResponse.json(getSchedulerStatus());
}

// POST /api/scheduler — Pause, resume, or toggle scheduler
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body.action || 'toggle';

    if (action === 'pause') {
      pauseScheduler();
      return NextResponse.json({ success: true, paused: true });
    }

    if (action === 'resume') {
      resumeScheduler();
      return NextResponse.json({ success: true, paused: false });
    }

    // toggle
    if (isSchedulerPaused()) {
      resumeScheduler();
      return NextResponse.json({ success: true, paused: false });
    } else {
      pauseScheduler();
      return NextResponse.json({ success: true, paused: true });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
