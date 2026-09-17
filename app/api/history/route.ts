import { NextResponse } from 'next/server';

export async function GET() {
  const sheetUrl = process.env.NEXT_PUBLIC_GOOGLE_SHEETS_URL;

  if (!sheetUrl) {
    return NextResponse.json(
      { success: false, message: 'Google Sheets URL is not configured.' },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(`${sheetUrl}?action=history&limit=100`, {
      method: 'GET',
      next: { revalidate: 15 },
    });
    const result = await response.text();

    try {
      return NextResponse.json(JSON.parse(result), { status: response.status });
    } catch {
      return NextResponse.json(
        {
          success: false,
          message: `Apps Script returned invalid history data (${response.status}).`,
          response: result.slice(0, 300),
        },
        { status: 502 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to fetch history.',
      },
      { status: 502 }
    );
  }
}

export async function POST(request: Request) {
  const sheetUrl = process.env.NEXT_PUBLIC_GOOGLE_SHEETS_URL;

  if (!sheetUrl) {
    return NextResponse.json(
      { success: false, message: 'Google Sheets URL is not configured.' },
      { status: 500 }
    );
  }

  try {
    const body = await request.text();
    const response = await fetch(sheetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body,
      redirect: 'manual',
      cache: 'no-store',
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      return NextResponse.json({ success: true, status: 'success' });
    }

    const result = await response.text();
    try {
      return NextResponse.json(JSON.parse(result), { status: response.status });
    } catch {
      return NextResponse.json(
        { success: false, message: 'Apps Script returned invalid history data.', response: result.slice(0, 300) },
        { status: response.ok ? 502 : response.status }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Failed to update order status.' },
      { status: 502 }
    );
  }
}
