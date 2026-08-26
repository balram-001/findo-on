import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type FeedbackPayload = {
  rating?: unknown;
  comment?: unknown;
  name?: unknown;
  email?: unknown;
};

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as FeedbackPayload;
    const rating = Number(body.rating);
    const comment = text(body.comment, 2000);
    const name = text(body.name, 120);
    const email = text(body.email, 254);

    if (!Number.isInteger(rating) || rating < 1 || rating > 5 || !comment) {
      return NextResponse.json({ success: false, error: "A rating and feedback message are required." }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim() || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ success: false, error: "Feedback storage is not configured." }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await supabase.from("feedback_submissions").insert({ rating, comment, name: name || null, email: email || null });
    if (error) {
      console.error("Unable to store feedback:", error.message);
      return NextResponse.json({ success: false, error: "Unable to save feedback. Please try again." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "Invalid feedback submission." }, { status: 400 });
  }
}
