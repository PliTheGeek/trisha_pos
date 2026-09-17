import { NextResponse } from 'next/server';

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
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    };
    const response = await fetch(sheetUrl, {
      method: 'POST',
      headers,
      body,
      redirect: 'manual',
      cache: 'no-store',
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      return NextResponse.json({
        success: true,
        status: 'success',
        message: 'Order accepted by Google Apps Script.',
      });
    }

    const result = await response.text();

    try {
      return NextResponse.json(JSON.parse(result), { status: response.status });
    } catch {
      return NextResponse.json(
        {
          success: false,
          message: `Apps Script returned a non-JSON response (${response.status}).`,
          response: result.slice(0, 300),
        },
        { status: response.ok ? 502 : response.status }
      );
    }
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to reach Google Apps Script.',
      },
      { status: 502 }
    );
  }
}
