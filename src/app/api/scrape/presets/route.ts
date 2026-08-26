import { NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/db';

/**
 * GET /api/scrape/presets — list all presets
 */
export async function GET() {
  try {
    const db = getDb();
    const presets = db.prepare('SELECT * FROM scrape_presets ORDER BY updated_at DESC').all();
    return Response.json({ presets });
  } catch (error: any) {
    console.error('[Scrape Presets API] GET error:', error.message);
    return Response.json({ error: 'Failed to fetch presets' }, { status: 500 });
  }
}

/**
 * POST /api/scrape/presets — create a new preset
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, mode, queries, engines, maxResults, crawlDepth, country, fileType } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return Response.json({ error: 'Preset name is required' }, { status: 400 });
    }

    const db = getDb();
    const id = uuidv4();

    db.prepare(`
      INSERT INTO scrape_presets (id, name, mode, queries, engines, max_results, crawl_depth, country, file_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      name.trim(),
      mode || 'search',
      queries || '',
      JSON.stringify(engines || ['duckduckgo', 'bing', 'brave']),
      maxResults || 200,
      crawlDepth || 1,
      country || 'us',
      fileType || ''
    );

    const preset = db.prepare('SELECT * FROM scrape_presets WHERE id = ?').get(id);
    return Response.json({ preset }, { status: 201 });
  } catch (error: any) {
    console.error('[Scrape Presets API] POST error:', error.message);
    return Response.json({ error: 'Failed to create preset' }, { status: 500 });
  }
}

/**
 * PUT /api/scrape/presets — update an existing preset
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, mode, queries, engines, maxResults, crawlDepth, country, fileType } = body;

    if (!id) {
      return Response.json({ error: 'Preset ID is required' }, { status: 400 });
    }

    const db = getDb();
    const existing = db.prepare('SELECT * FROM scrape_presets WHERE id = ?').get(id);
    if (!existing) {
      return Response.json({ error: 'Preset not found' }, { status: 404 });
    }

    db.prepare(`
      UPDATE scrape_presets SET
        name = COALESCE(?, name),
        mode = COALESCE(?, mode),
        queries = COALESCE(?, queries),
        engines = COALESCE(?, engines),
        max_results = COALESCE(?, max_results),
        crawl_depth = COALESCE(?, crawl_depth),
        country = COALESCE(?, country),
        file_type = COALESCE(?, file_type),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      name || null,
      mode || null,
      queries !== undefined ? queries : null,
      engines ? JSON.stringify(engines) : null,
      maxResults || null,
      crawlDepth || null,
      country !== undefined ? country : null,
      fileType !== undefined ? fileType : null,
      id
    );

    const preset = db.prepare('SELECT * FROM scrape_presets WHERE id = ?').get(id);
    return Response.json({ preset });
  } catch (error: any) {
    console.error('[Scrape Presets API] PUT error:', error.message);
    return Response.json({ error: 'Failed to update preset' }, { status: 500 });
  }
}

/**
 * DELETE /api/scrape/presets?id=xxx
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return Response.json({ error: 'Preset ID is required' }, { status: 400 });
    }

    const db = getDb();
    db.prepare('DELETE FROM scrape_presets WHERE id = ?').run(id);
    return Response.json({ success: true });
  } catch (error: any) {
    console.error('[Scrape Presets API] DELETE error:', error.message);
    return Response.json({ error: 'Failed to delete preset' }, { status: 500 });
  }
}
