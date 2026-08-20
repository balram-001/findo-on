import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export async function POST(req: Request) {
  try {
    const { leads, message } = await req.json();

    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return NextResponse.json({ success: false, error: 'No leads provided' }, { status: 400 });
    }

    const scriptPath = path.join(process.cwd(), 'whatsapp_automation.py');
    const payload = JSON.stringify({ leads, message });

    const pythonProcess = spawn('python', [scriptPath, payload], {
      detached: true,
      stdio: 'ignore'
    });
    pythonProcess.unref();

    return NextResponse.json({
      success: true,
      message: `WhatsApp messaging started for ${leads.length} contacts.`
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}